import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type { GameRoom } from "./GameRoom.js";
import type { RoomPrivacyState } from "./server.js";

const presenceName = z.string().trim().min(1).max(24);
type PresenceEntry = { socketId: string; name: string; updatedAt: number };

export function registerPresence(io: Server, rooms: Map<string, GameRoom>, roomPrivacy: Map<string, RoomPrivacyState> = new Map()) {
  const active = new Map<string, PresenceEntry>();

  const roomList = () => [...rooms.values()]
    .filter((room) => (roomPrivacy.get(room.state.roomCode)?.visibility ?? "public") === "public")
    .filter((room) => room.tokens.some((t) => room.player(t).connected || room.player(t).isBot))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20)
    .map((room) => ({
      roomCode: room.state.roomCode,
      status: room.state.status,
      visibility: "public" as const,
      joinable: room.state.status === "LOBBY" && room.tokens.length < 4,
      players: room.tokens.map((t) => ({
        name: room.player(t).displayName,
        avatar: room.player(t).avatar,
        connected: room.player(t).connected,
        isBot: !!room.player(t).isBot,
      })),
    }));

  const payload = () => {
    const users = [...active.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ socketId, name }) => ({ id: socketId, name }));
    return { users, count: users.length, rooms: roomList() };
  };

  const publish = () => io.emit("s_presence", payload());

  io.on("connection", (socket: Socket) => {
    socket.emit("s_presence", payload());

    socket.on("c_presence_set", (raw: unknown) => {
      const parsed = z.object({ displayName: presenceName }).strict().safeParse(raw ?? {});
      if (!parsed.success) return;
      active.set(socket.id, { socketId: socket.id, name: parsed.data.displayName, updatedAt: Date.now() });
      publish();
    });

    for (const event of ["c_create_room","c_create_bot_room","c_join_room","c_reconnect","c_toggle_ready","c_leave_room","c_request_rematch","c_room_privacy"]) {
      socket.on(event, () => setTimeout(publish, 0));
    }

    socket.on("disconnect", () => {
      active.delete(socket.id);
      publish();
    });
  });

  const ticker = setInterval(publish, 2500);
  ticker.unref();
}
