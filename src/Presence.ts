import type { Server, Socket } from "socket.io";
import { z } from "zod";

const presenceName = z.string().trim().min(1).max(24);

type PresenceEntry = { socketId: string; name: string; updatedAt: number };

export function registerPresence(io: Server) {
  const active = new Map<string, PresenceEntry>();

  const publish = () => {
    const users = [...active.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ socketId, name }) => ({ id: socketId, name }));
    io.emit("s_presence", { users, count: users.length });
  };

  io.on("connection", (socket: Socket) => {
    socket.emit("s_presence", {
      users: [...active.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(({ socketId, name }) => ({ id: socketId, name })),
      count: active.size,
    });

    socket.on("c_presence_set", (raw: unknown) => {
      const parsed = z.object({ displayName: presenceName }).strict().safeParse(raw ?? {});
      if (!parsed.success) return;
      active.set(socket.id, { socketId: socket.id, name: parsed.data.displayName, updatedAt: Date.now() });
      publish();
    });

    socket.on("disconnect", () => {
      if (active.delete(socket.id)) publish();
    });
  });
}
