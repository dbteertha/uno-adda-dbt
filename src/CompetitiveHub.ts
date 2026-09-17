import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type { GameRoom } from "./GameRoom.js";
import type { RoomPrivacyState } from "./server.js";

type ReplayFrame = ReturnType<typeof publicSnapshot>;
type LeaderRow = { name: string; avatar: string; wins: number; matches: number; points: number; lastWinAt: number };
type DelayedFrame = { dueAt: number; frame: ReplayFrame };

const roomCode = z.string().regex(/^[A-Z2-9]{4}$/);
const watchSchema = z.object({ roomCode, inviteKey: z.string().uuid().optional() }).strict();
const empty = z.object({}).strict();
const MAX_REPLAY_ROOMS = 120;
const MAX_REPLAY_FRAMES = 72;
const MAX_DELAYED_FRAMES = 32;
const requestedDelay = Number(process.env.DBT_SPECTATOR_DELAY_MS ?? 3000);
const SPECTATOR_DELAY_MS = Number.isFinite(requestedDelay) ? Math.max(0, Math.min(15_000, Math.floor(requestedDelay))) : 3000;

function publicSnapshot(room: GameRoom, spectators = 0) {
  const top = room.state.discardPile.at(-1);
  return {
    roomCode: room.state.roomCode,
    status: room.state.status,
    round: room.round,
    revision: room.revision,
    activeColor: room.state.activeColor,
    direction: room.state.direction,
    topDiscardCard: top ? { color: top.color, value: top.value } : null,
    drawPileCount: room.state.drawPile.length,
    paused: room.paused,
    winnerName: room.state.winnerToken ? room.player(room.state.winnerToken).displayName : null,
    resultReason: room.resultReason,
    lastEvent: room.lastEvent ? { ...room.lastEvent } : null,
    players: room.tokens.map((token) => {
      const player = room.player(token);
      return {
        name: player.displayName,
        avatar: player.avatar,
        connected: player.connected,
        cardCount: player.hand.length,
        score: room.scores[token] ?? 0,
        wins: room.wins[token] ?? 0,
        isCurrent: room.current === token,
        isBot: !!player.isBot,
      };
    }),
    history: room.history.slice(0, 8).map((item) => ({ ...item })),
    spectators,
    at: Date.now(),
  };
}

export function registerCompetitiveHub(io: Server, rooms: Map<string, GameRoom>, privacy: Map<string, RoomPrivacyState>) {
  const arena = io.of("/arena");
  const watching = new Map<string, string>();
  const spectatorCounts = new Map<string, number>();
  const replay = new Map<string, ReplayFrame[]>();
  const replayTouched = new Map<string, number>();
  const lastRevision = new Map<string, number>();
  const delayed = new Map<string, DelayedFrame[]>();
  const published = new Map<string, ReplayFrame>();
  const scoredRounds = new Set<string>();
  const leaderboard = new Map<string, LeaderRow>();

  const scope = (code: string) => `classic:${code}`;
  const countFor = (code: string) => spectatorCounts.get(code) ?? 0;
  const policyFor = (code: string) => privacy.get(code) ?? { visibility: "public" as const, inviteKey: "" };

  function canWatch(code: string, suppliedInvite?: string) {
    const policy = policyFor(code);
    if (policy.visibility !== "invite") return true;
    return !!policy.inviteKey && suppliedInvite === policy.inviteKey;
  }

  function leaderboardRows() {
    return [...leaderboard.values()]
      .sort((a, b) => b.wins - a.wins || b.points - a.points || b.matches - a.matches || b.lastWinAt - a.lastWinAt)
      .slice(0, 40);
  }

  function publicRooms() {
    return [...rooms.values()]
      .filter((room) => policyFor(room.state.roomCode).visibility === "public")
      .filter((room) => room.tokens.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40)
      .map((room) => ({
        roomCode: room.state.roomCode,
        status: room.state.status,
        round: room.round,
        players: room.tokens.map((token) => ({ name: room.player(token).displayName, avatar: room.player(token).avatar, isBot: !!room.player(token).isBot })),
        spectators: countFor(room.state.roomCode),
      }));
  }

  function leaveWatch(socket: Socket) {
    const code = watching.get(socket.id);
    if (!code) return;
    watching.delete(socket.id);
    socket.leave(scope(code));
    spectatorCounts.set(code, Math.max(0, countFor(code) - 1));
    arena.to(scope(code)).emit("a_spectators", { roomCode: code, spectators: countFor(code) });
  }

  function queueBroadcast(code: string, frame: ReplayFrame) {
    let list = delayed.get(code);
    if (!list) { list = []; delayed.set(code, list); }
    list.push({ dueAt: frame.at + SPECTATOR_DELAY_MS, frame });
    if (list.length > MAX_DELAYED_FRAMES) list.splice(0, list.length - MAX_DELAYED_FRAMES);
  }

  function drainDelayed(now = Date.now()) {
    for (const [code, list] of delayed) {
      while (list.length && list[0].dueAt <= now) {
        const item = list.shift()!;
        const frame = { ...item.frame, spectators: countFor(code) };
        published.set(code, frame);
        arena.to(scope(code)).emit("a_snapshot", frame);
      }
      if (!list.length) delayed.delete(code);
    }
  }

  function capture(room: GameRoom) {
    if (lastRevision.get(room.state.roomCode) === room.revision) return;
    lastRevision.set(room.state.roomCode, room.revision);
    const code = room.state.roomCode;
    const frame = publicSnapshot(room, countFor(code));
    let frames = replay.get(code);
    if (!frames) { frames = []; replay.set(code, frames); }
    frames.push(frame);
    if (frames.length > MAX_REPLAY_FRAMES) frames.splice(0, frames.length - MAX_REPLAY_FRAMES);
    replayTouched.set(code, Date.now());
    queueBroadcast(code, frame);

    const latest = room.history[0];
    if (latest) {
      const roundKey = `${code}:${latest.round}:${latest.at}`;
      if (!scoredRounds.has(roundKey)) {
        scoredRounds.add(roundKey);
        for (const token of room.tokens) {
          const p = room.player(token);
          if (p.isBot) continue;
          const key = p.displayName.trim().toLocaleLowerCase();
          const row = leaderboard.get(key) ?? { name: p.displayName, avatar: p.avatar, wins: 0, matches: 0, points: 0, lastWinAt: 0 };
          row.name = p.displayName;
          row.avatar = p.avatar;
          row.matches += 1;
          if (p.displayName === latest.winnerName) {
            row.wins += 1;
            row.points += latest.points;
            row.lastWinAt = latest.at;
          }
          leaderboard.set(key, row);
        }
      }
    }
  }

  function availableReplay(code: string) {
    const cutoff = Date.now() - SPECTATOR_DELAY_MS;
    return (replay.get(code) ?? []).filter((frame) => frame.at <= cutoff);
  }

  function trimReplayRooms() {
    if (replay.size <= MAX_REPLAY_ROOMS) return;
    const oldest = [...replayTouched.entries()].sort((a, b) => a[1] - b[1]).slice(0, replay.size - MAX_REPLAY_ROOMS);
    for (const [code] of oldest) {
      replay.delete(code);
      replayTouched.delete(code);
      lastRevision.delete(code);
      delayed.delete(code);
      published.delete(code);
    }
  }

  arena.on("connection", (socket: Socket) => {
    let budget = 80;
    let budgetAt = Date.now();
    const spend = (cost = 1) => {
      const now = Date.now();
      budget = Math.min(80, budget + ((now - budgetAt) / 1000) * 4);
      budgetAt = now;
      if (budget < cost) return false;
      budget -= cost;
      return true;
    };
    const fail = (message: string) => socket.emit("a_error", { message });

    socket.emit("a_rooms", { rooms: publicRooms() });
    socket.emit("a_leaderboard", { rows: leaderboardRows(), persistence: "server-session" });

    socket.on("a_watch", (raw: unknown) => {
      if (!spend(4)) return fail("Arena is busy. Try again in a moment.");
      const parsed = watchSchema.safeParse(raw);
      if (!parsed.success) return fail("Spectator request was invalid.");
      const room = rooms.get(parsed.data.roomCode);
      if (!room) return fail("That room is no longer active.");
      if (!canWatch(parsed.data.roomCode, parsed.data.inviteKey)) return fail("This invite-only room requires its spectator invite link.");
      leaveWatch(socket);
      const code = parsed.data.roomCode;
      watching.set(socket.id, code);
      spectatorCounts.set(code, countFor(code) + 1);
      socket.join(scope(code));
      capture(room);
      drainDelayed();
      const frames = availableReplay(code);
      const latestPublished = published.get(code) ?? frames.at(-1);
      socket.emit("a_watching", { roomCode: code, spectators: countFor(code), replayFrames: frames.length, delayMs: SPECTATOR_DELAY_MS });
      if (latestPublished) socket.emit("a_snapshot", { ...latestPublished, spectators: countFor(code) });
      arena.to(scope(code)).emit("a_spectators", { roomCode: code, spectators: countFor(code) });
    });

    socket.on("a_replay", (raw: unknown) => {
      if (!spend(3)) return;
      if (!empty.safeParse(raw ?? {}).success) return;
      const code = watching.get(socket.id);
      if (!code) return fail("Watch a room before opening replay.");
      socket.emit("a_replay", { roomCode: code, frames: availableReplay(code), delayMs: SPECTATOR_DELAY_MS });
    });

    socket.on("a_refresh", (raw: unknown) => {
      if (!spend(2) || !empty.safeParse(raw ?? {}).success) return;
      socket.emit("a_rooms", { rooms: publicRooms() });
      socket.emit("a_leaderboard", { rows: leaderboardRows(), persistence: "server-session" });
    });

    socket.on("a_leave", () => leaveWatch(socket));
    socket.on("disconnect", () => leaveWatch(socket));
  });

  const ticker = setInterval(() => {
    for (const room of rooms.values()) capture(room);
    drainDelayed();
    trimReplayRooms();
    if (arena.sockets.size) {
      arena.emit("a_rooms", { rooms: publicRooms() });
      arena.emit("a_leaderboard", { rows: leaderboardRows(), persistence: "server-session" });
    }
  }, 500);
  ticker.unref();

  return { close: () => clearInterval(ticker), delayMs: SPECTATOR_DELAY_MS };
}
