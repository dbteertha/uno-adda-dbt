import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type { GameRoom } from "./GameRoom.js";

type PublicFrame = {
  at: number;
  revision: number;
  state: ReturnType<typeof publicState>;
};

type WatchGrant = {
  key: string;
  createdAt: number;
  rotatedAt: number;
};

const roomCode = z.string().regex(/^[A-Z2-9]{4}$/);
const watchKey = z.string().uuid();
const roomRequest = z.object({ roomCode }).strict();
const watchRequest = z.object({ roomCode, watchKey }).strict();
const MAX_FRAMES = 260;
const MAX_EVENT_HISTORY = 120;

function publicState(room: GameRoom) {
  const top = room.state.discardPile.at(-1);
  const winner = room.state.winnerToken ? room.player(room.state.winnerToken) : null;
  return {
    roomCode: room.state.roomCode,
    status: room.state.status,
    activeColor: room.state.activeColor,
    direction: room.state.direction,
    drawPileCount: room.state.drawPile.length,
    topDiscardCard: top ? { color: top.color, value: top.value } : null,
    needsStartingColor: room.needsStartingColor,
    paused: room.paused,
    turnDeadline: room.turnDeadline,
    serverNow: Date.now(),
    winnerName: winner?.displayName ?? null,
    winnerAvatar: winner?.avatar ?? null,
    round: room.round,
    revision: room.revision,
    resultReason: room.resultReason,
    players: room.tokens.map((token, seat) => {
      const player = room.player(token);
      return {
        seat,
        displayName: player.displayName,
        avatar: player.avatar,
        connected: player.connected,
        isReady: player.isReady,
        isCurrent: token === room.current,
        cardCount: player.hand.length,
        score: room.scores[token] ?? 0,
        wins: room.wins[token] ?? 0,
        isBot: !!player.isBot,
      };
    }),
    history: room.history.slice(0, 12).map((item) => ({ ...item })),
    lastEvent: room.lastEvent ? { ...room.lastEvent } : null,
  };
}

function hostOwns(room: GameRoom, socketId: string) {
  const token = room.tokens[0];
  return !!token && room.player(token).socketId === socketId && room.player(token).connected;
}

function isPlayerSocket(room: GameRoom, socketId: string) {
  return room.tokens.some((token) => room.player(token).socketId === socketId && room.player(token).connected);
}

export function registerSpectatorReplay(io: Server, rooms: Map<string, GameRoom>) {
  const grants = new Map<string, WatchGrant>();
  const watchers = new Map<string, string>();
  const frames = new Map<string, PublicFrame[]>();
  const lastRevision = new Map<string, number>();
  const lastEventId = new Map<string, string>();
  const publicEvents = new Map<string, Array<Record<string, unknown>>>();
  const spectateRoom = (code: string) => `dbt:spectate:${code}`;

  const grantFor = (code: string) => {
    let grant = grants.get(code);
    if (!grant) {
      const now = Date.now();
      grant = { key: randomUUID(), createdAt: now, rotatedAt: now };
      grants.set(code, grant);
    }
    return grant;
  };

  const validGrant = (code: string, key: string) => grants.get(code)?.key === key;

  const record = (room: GameRoom) => {
    const code = room.state.roomCode;
    const snapshot = publicState(room);
    const list = frames.get(code) ?? [];
    list.push({ at: Date.now(), revision: room.revision, state: snapshot });
    if (list.length > MAX_FRAMES) list.splice(0, list.length - MAX_FRAMES);
    frames.set(code, list);

    const event = room.lastEvent;
    if (event?.id && event.id !== lastEventId.get(code)) {
      lastEventId.set(code, event.id);
      const events = publicEvents.get(code) ?? [];
      events.push({ ...event });
      if (events.length > MAX_EVENT_HISTORY) events.splice(0, events.length - MAX_EVENT_HISTORY);
      publicEvents.set(code, events);
    }
    return snapshot;
  };

  const dropWatcher = (socket: Socket) => {
    const code = watchers.get(socket.id);
    if (!code) return;
    watchers.delete(socket.id);
    socket.leave(spectateRoom(code));
  };

  io.on("connection", (socket: Socket) => {
    socket.on("c_watch_link", (raw: unknown) => {
      const parsed = roomRequest.safeParse(raw ?? {});
      if (!parsed.success) return socket.emit("s_spectator_error", { message: "Invalid room code." });
      const room = rooms.get(parsed.data.roomCode);
      if (!room || !hostOwns(room, socket.id)) return socket.emit("s_spectator_error", { message: "Only the connected room host can create a watch link." });
      const grant = grantFor(room.state.roomCode);
      socket.emit("s_watch_link", { roomCode: room.state.roomCode, watchKey: grant.key, createdAt: grant.createdAt });
    });

    socket.on("c_rotate_watch_link", (raw: unknown) => {
      const parsed = roomRequest.safeParse(raw ?? {});
      if (!parsed.success) return socket.emit("s_spectator_error", { message: "Invalid room code." });
      const room = rooms.get(parsed.data.roomCode);
      if (!room || !hostOwns(room, socket.id)) return socket.emit("s_spectator_error", { message: "Only the connected room host can rotate the watch link." });
      const now = Date.now();
      const grant: WatchGrant = { key: randomUUID(), createdAt: now, rotatedAt: now };
      grants.set(room.state.roomCode, grant);
      io.to(spectateRoom(room.state.roomCode)).emit("s_spectator_closed", { reason: "watch-link-rotated" });
      for (const [socketId, code] of watchers) if (code === room.state.roomCode) watchers.delete(socketId);
      socket.emit("s_watch_link", { roomCode: room.state.roomCode, watchKey: grant.key, createdAt: grant.createdAt });
    });

    socket.on("c_spectate_room", (raw: unknown) => {
      const parsed = watchRequest.safeParse(raw ?? {});
      if (!parsed.success) return socket.emit("s_spectator_error", { message: "Watch link is invalid." });
      const room = rooms.get(parsed.data.roomCode);
      if (!room || !validGrant(parsed.data.roomCode, parsed.data.watchKey)) return socket.emit("s_spectator_error", { message: "Watch link expired or the room is gone." });
      if (isPlayerSocket(room, socket.id)) return socket.emit("s_spectator_error", { message: "Players cannot spectate through their active game connection." });
      dropWatcher(socket);
      watchers.set(socket.id, room.state.roomCode);
      socket.join(spectateRoom(room.state.roomCode));
      socket.emit("s_spectator_state", record(room));
    });

    socket.on("c_spectator_replay", (raw: unknown) => {
      const parsed = watchRequest.safeParse(raw ?? {});
      if (!parsed.success || !validGrant(parsed.data.roomCode, parsed.data.watchKey)) return socket.emit("s_spectator_error", { message: "Replay access expired." });
      const room = rooms.get(parsed.data.roomCode);
      if (!room) return socket.emit("s_spectator_error", { message: "Room replay is no longer available." });
      socket.emit("s_spectator_replay", {
        roomCode: parsed.data.roomCode,
        exportedAt: Date.now(),
        current: publicState(room),
        events: (publicEvents.get(parsed.data.roomCode) ?? []).map((event) => ({ ...event })),
        frames: (frames.get(parsed.data.roomCode) ?? []).map((frame) => ({ ...frame, state: { ...frame.state, players: frame.state.players.map((p) => ({ ...p })) } })),
      });
    });

    socket.on("c_stop_spectating", () => {
      dropWatcher(socket);
      socket.emit("s_spectator_closed", { reason: "left" });
    });

    socket.on("disconnect", () => dropWatcher(socket));
  });

  const ticker = setInterval(() => {
    const activeCodes = new Set(rooms.keys());
    for (const [code, room] of rooms) {
      if (lastRevision.get(code) === room.revision) continue;
      lastRevision.set(code, room.revision);
      const snapshot = record(room);
      io.to(spectateRoom(code)).emit("s_spectator_state", snapshot);
    }
    for (const code of [...frames.keys()]) {
      if (activeCodes.has(code)) continue;
      frames.delete(code);
      lastRevision.delete(code);
      lastEventId.delete(code);
      publicEvents.delete(code);
      grants.delete(code);
      io.to(spectateRoom(code)).emit("s_spectator_closed", { reason: "room-ended" });
      for (const [socketId, watchedCode] of watchers) if (watchedCode === code) watchers.delete(socketId);
    }
  }, 160);
  ticker.unref();

  return { close: () => clearInterval(ticker) };
}
