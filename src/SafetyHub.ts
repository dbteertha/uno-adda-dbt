import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type { GameRoom } from "./GameRoom.js";

const reason = z.enum(["harassment", "spam", "hate", "sexual", "threats", "cheating", "voice", "other"]);
const reportSchema = z.object({
  targetName: z.string().trim().min(1).max(24),
  reason,
  note: z.string().trim().max(180).optional().default(""),
}).strict();

type Report = {
  id: string;
  roomCode: string;
  reporter: string;
  target: string;
  reason: z.infer<typeof reason>;
  note: string;
  at: number;
};

export function registerSafetyHub(io: Server, rooms: Map<string, GameRoom>) {
  const reports: Report[] = [];
  const recentBySocket = new Map<string, number[]>();
  const recentFingerprint = new Map<string, number>();

  function membership(socket: Socket) {
    for (const room of rooms.values()) {
      for (const token of room.tokens) {
        const player = room.player(token);
        if (!player.isBot && player.connected && player.socketId === socket.id) return { room, token, player };
      }
    }
    return null;
  }

  function rateAllowed(socketId: string) {
    const now = Date.now();
    const recent = (recentBySocket.get(socketId) ?? []).filter((at) => now - at < 5 * 60_000);
    if (recent.length >= 3) { recentBySocket.set(socketId, recent); return false; }
    recent.push(now); recentBySocket.set(socketId, recent); return true;
  }

  io.on("connection", (socket: Socket) => {
    socket.on("c_safety_report", (raw: unknown) => {
      const parsed = reportSchema.safeParse(raw);
      if (!parsed.success) return socket.emit("s_safety_error", { message: "Report details were invalid." });
      const member = membership(socket);
      if (!member) return socket.emit("s_safety_error", { message: "Join the room before reporting a player." });
      const targetToken = member.room.tokens.find((token) => member.room.player(token).displayName === parsed.data.targetName && !member.room.player(token).isBot);
      if (!targetToken) return socket.emit("s_safety_error", { message: "That player is no longer in this room." });
      if (targetToken === member.token) return socket.emit("s_safety_error", { message: "You cannot report yourself." });
      if (!rateAllowed(socket.id)) return socket.emit("s_safety_error", { message: "Report limit reached. Try again later." });

      const now = Date.now();
      const fingerprint = `${member.token}:${targetToken}:${parsed.data.reason}`;
      if (now - (recentFingerprint.get(fingerprint) ?? 0) < 60_000) return socket.emit("s_safety_error", { message: "That report was already submitted recently." });
      recentFingerprint.set(fingerprint, now);

      const report: Report = {
        id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        roomCode: member.room.state.roomCode,
        reporter: member.player.displayName,
        target: member.room.player(targetToken).displayName,
        reason: parsed.data.reason,
        note: parsed.data.note,
        at: now,
      };
      reports.unshift(report);
      if (reports.length > 500) reports.length = 500;
      console.warn("[DBT SAFETY REPORT]", JSON.stringify({ id: report.id, roomCode: report.roomCode, reporter: report.reporter, target: report.target, reason: report.reason, at: report.at }));
      socket.emit("s_safety_ack", { id: report.id, target: report.target });
    });

    socket.on("disconnect", () => recentBySocket.delete(socket.id));
  });

  const cleanup = setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60_000;
    for (const [key, at] of recentFingerprint) if (at < cutoff) recentFingerprint.delete(key);
  }, 30 * 60_000);
  cleanup.unref();

  return { reports, close: () => clearInterval(cleanup) };
}
