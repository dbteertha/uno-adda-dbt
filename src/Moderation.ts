import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type { GameRoom } from "./GameRoom.js";

const roomCode = z.string().regex(/^[A-Z2-9]{4}$/);
const reason = z.enum(["harassment", "spam", "offensive-name", "voice-abuse", "cheating-concern", "disruptive-reactions", "other"]);
const reportSchema = z.object({
  roomCode,
  seat: z.number().int().min(0).max(3),
  reason,
  note: z.string().trim().max(160).optional(),
}).strict();

type ModerationReport = {
  id: string;
  at: number;
  roomCode: string;
  reporterName: string;
  reporterSeat: number;
  targetName: string;
  targetSeat: number;
  reason: z.infer<typeof reason>;
  note?: string;
};

export function registerModeration(io: Server, rooms: Map<string, GameRoom>) {
  const reports: ModerationReport[] = [];
  const reportBudget = new Map<string, { count: number; windowAt: number; lastAt: number }>();

  function memberFor(socketId: string) {
    for (const room of rooms.values()) {
      for (const [seat, token] of room.tokens.entries()) {
        const player = room.player(token);
        if (player.connected && !player.isBot && player.socketId === socketId) return { room, token, seat, player };
      }
    }
    return null;
  }

  function allowReport(socketId: string) {
    const now = Date.now();
    const current = reportBudget.get(socketId) ?? { count: 0, windowAt: now, lastAt: 0 };
    if (now - current.windowAt > 30 * 60_000) { current.count = 0; current.windowAt = now; }
    if (now - current.lastAt < 8_000 || current.count >= 8) return false;
    current.count += 1; current.lastAt = now; reportBudget.set(socketId, current); return true;
  }

  io.on("connection", (socket: Socket) => {
    socket.on("c_report_player", (raw: unknown) => {
      const parsed = reportSchema.safeParse(raw ?? {});
      if (!parsed.success) return socket.emit("s_report_error", { message: "Report details were invalid." });
      if (!allowReport(socket.id)) return socket.emit("s_report_error", { message: "Please wait before sending another report." });
      const member = memberFor(socket.id);
      if (!member || member.room.state.roomCode !== parsed.data.roomCode) return socket.emit("s_report_error", { message: "Join the room before reporting a player." });
      const targetToken = member.room.tokens[parsed.data.seat];
      if (!targetToken) return socket.emit("s_report_error", { message: "That player is no longer in the room." });
      if (targetToken === member.token) return socket.emit("s_report_error", { message: "You cannot report yourself." });
      const target = member.room.player(targetToken);
      if (target.isBot) return socket.emit("s_report_error", { message: "Bots do not need reports." });

      const item: ModerationReport = {
        id: randomUUID(), at: Date.now(), roomCode: member.room.state.roomCode,
        reporterName: member.player.displayName, reporterSeat: member.seat,
        targetName: target.displayName, targetSeat: parsed.data.seat,
        reason: parsed.data.reason,
        ...(parsed.data.note ? { note: parsed.data.note } : {}),
      };
      reports.push(item); if (reports.length > 500) reports.splice(0, reports.length - 500);
      console.warn("[DBT moderation report]", JSON.stringify(item));
      socket.emit("s_report_received", { id: item.id, at: item.at, targetName: item.targetName, reason: item.reason });
    });

    socket.on("disconnect", () => reportBudget.delete(socket.id));
  });

  return {
    recent(limit = 100) { return reports.slice(-Math.max(1, Math.min(500, limit))).map((item) => ({ ...item })); },
    clear() { reports.length = 0; },
  };
}
