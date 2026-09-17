import type { Server } from "socket.io";
import type { GameRoom } from "./GameRoom.js";

const TAKEOVER_AFTER_MS = 5_000;
const RECONNECT_WINDOW_MS = 5 * 60_000;

type ActiveSeat = { token: string; startedAt: number };

export function registerReconnectTakeover(io: Server, rooms: Map<string, GameRoom>) {
  const active = new WeakMap<GameRoom, Map<string, ActiveSeat>>();

  const activeFor = (room: GameRoom) => {
    let map = active.get(room);
    if (!map) { map = new Map(); active.set(room, map); }
    return map;
  };

  const publish = (room: GameRoom) => {
    try {
      room.assertIntegrity("reconnect takeover publish");
      for (const token of room.tokens) {
        const p = room.player(token);
        if (p.connected && !p.isBot) io.to(p.socketId).emit("s_sync_state", room.sync(token));
      }
    } catch (error) {
      console.error("[DBT reconnect takeover publish]", error);
    }
  };

  const notice = (room: GameRoom, name: string, isActive: boolean) => {
    for (const token of room.tokens) {
      const p = room.player(token);
      if (p.connected && !p.isBot) io.to(p.socketId).emit("s_takeover_notice", { name, active: isActive });
    }
  };

  const restore = (room: GameRoom, token: string) => {
    const map = activeFor(room);
    if (!map.has(token)) return false;
    const p = room.player(token);
    p.isBot = false;
    map.delete(token);
    room.touch();
    notice(room, p.displayName, false);
    return true;
  };

  const timer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      try {
        const map = activeFor(room);

        for (const token of [...map.keys()]) {
          const p = room.player(token);
          if (p.connected || room.state.status !== "PLAYING") restore(room, token);
        }

        if (room.state.status !== "PLAYING") continue;

        let changed = false;
        for (const [token, deadline] of room.disconnected) {
          const p = room.player(token);
          if (p.connected || p.isBot && !map.has(token)) continue;
          const disconnectedAt = deadline - 45_000;
          if (now - disconnectedAt < TAKEOVER_AFTER_MS) continue;
          if (!map.has(token)) {
            p.isBot = true;
            map.set(token, { token, startedAt: now });
            room.disconnected.set(token, now + RECONNECT_WINDOW_MS);
            if (room.turnDeadline === null) room.turnDeadline = now + Math.max(4_000, room.remainingTurn);
            room.touch();
            notice(room, p.displayName, true);
            changed = true;
          }
        }

        if (changed) publish(room);
      } catch (error) {
        console.error("[DBT reconnect takeover]", error);
      }
    }
  }, 250);
  timer.unref();

  // A reconnect may initially arrive while the seat is still marked as an AI stand-in.
  // Restore the human immediately after the core reconnect handler has attached the new socket.
  io.on("connection", (socket) => {
    socket.on("c_reconnect", () => {
      setTimeout(() => {
        for (const room of rooms.values()) {
          for (const token of activeFor(room).keys()) {
            const p = room.player(token);
            if (p.socketId === socket.id && p.connected) {
              if (restore(room, token)) publish(room);
              return;
            }
          }
        }
      }, 0);
    });
  });
}
