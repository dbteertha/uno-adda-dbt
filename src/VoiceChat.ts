import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type { GameRoom } from "./GameRoom.js";

type VoiceMode = "classic" | "flex";
type VoicePolicy = { enabled: boolean; pttOnly: boolean; openMicAllowed: boolean };
type FlexAuth = {
  token: string;
  roomCode: string;
  name: string;
  avatar: string;
  gameSocketId: string;
  connected: boolean;
  updatedAt: number;
  isHost: boolean;
};
type VoiceMember = {
  mode: VoiceMode;
  roomCode: string;
  token: string;
  name: string;
  avatar: string;
  voiceSocketId: string;
  muted: boolean;
  isHost: boolean;
};

const roomCodeSchema = z.string().regex(/^[A-Z2-9]{4}$/);
const uuidSchema = z.string().uuid();
const joinSchema = z.object({
  mode: z.enum(["classic", "flex"]),
  roomCode: roomCodeSchema,
  sessionToken: uuidSchema,
}).strict();
const signalSchema = z.object({
  targetToken: uuidSchema,
  signal: z.discriminatedUnion("type", [
    z.object({ type: z.literal("offer"), sdp: z.string().min(1).max(16_000) }).strict(),
    z.object({ type: z.literal("answer"), sdp: z.string().min(1).max(16_000) }).strict(),
    z.object({ type: z.literal("ice"), candidate: z.string().min(1).max(5_000) }).strict(),
  ]),
}).strict();
const metaSchema = z.object({ muted: z.boolean() }).strict();
const policySchema = z.object({
  enabled: z.boolean(),
  pttOnly: z.boolean(),
  openMicAllowed: z.boolean(),
}).strict().transform((value) => ({
  enabled: value.enabled,
  pttOnly: value.pttOnly,
  openMicAllowed: value.pttOnly ? false : value.openMicAllowed,
}));
const emptySchema = z.object({}).strict();

function publicMember(member: VoiceMember) {
  return { token: member.token, name: member.name, avatar: member.avatar, muted: member.muted, isHost: member.isHost };
}

function iceConfig() {
  const servers: Array<{ urls: string[]; username?: string; credential?: string }> = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const urls = (process.env.DBT_TURN_URLS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const username = process.env.DBT_TURN_USERNAME?.trim();
  const credential = process.env.DBT_TURN_CREDENTIAL?.trim();
  if (urls.length && username && credential) servers.push({ urls, username, credential });
  return servers;
}

export function registerVoiceChat(io: Server, classicRooms: Map<string, GameRoom>) {
  const flexAuth = new Map<string, FlexAuth>();
  const flexSocketToken = new Map<string, string>();
  const voiceRooms = new Map<string, Map<string, VoiceMember>>();
  const voiceSession = new Map<string, VoiceMember>();
  const voicePolicies = new Map<string, VoicePolicy>();
  const scopeOf = (mode: VoiceMode, roomCode: string) => `${mode}:${roomCode}`;
  const policyOf = (scope: string): VoicePolicy => voicePolicies.get(scope) ?? { enabled: true, pttOnly: false, openMicAllowed: true };

  const flex = io.of("/flex");
  flex.on("connection", (socket: Socket) => {
    let pendingProfile: { name: string; avatar: string } | null = null;
    let pendingReconnect: { roomCode: string; token: string } | null = null;
    let pendingRole: "host" | "guest" | null = null;
    let reconnectRejected = false;

    const captureProfile = (raw: unknown, role: "host" | "guest") => {
      const parsed = z.object({
        displayName: z.string().trim().min(1).max(24),
        avatar: z.string().trim().min(1).max(8),
      }).passthrough().safeParse(raw);
      if (parsed.success) {
        pendingProfile = { name: parsed.data.displayName, avatar: parsed.data.avatar };
        pendingRole = role;
      }
    };
    socket.on("f_create_multi", (raw: unknown) => captureProfile(raw, "host"));
    socket.on("f_create_bot", (raw: unknown) => captureProfile(raw, "host"));
    socket.on("f_join", (raw: unknown) => captureProfile(raw, "guest"));

    socket.on("f_reconnect", (raw: unknown) => {
      const parsed = z.object({ roomCode: roomCodeSchema, sessionToken: uuidSchema }).strict().safeParse(raw);
      if (!parsed.success) return;
      const known = flexAuth.get(parsed.data.sessionToken);
      if (!known || known.roomCode !== parsed.data.roomCode) return;
      pendingReconnect = { roomCode: parsed.data.roomCode, token: parsed.data.sessionToken };
      reconnectRejected = false;
      queueMicrotask(() => {
        if (!pendingReconnect || reconnectRejected) return;
        const current = flexAuth.get(pendingReconnect.token);
        if (!current || current.roomCode !== pendingReconnect.roomCode) return;
        current.gameSocketId = socket.id;
        current.connected = true;
        current.updatedAt = Date.now();
        flexSocketToken.set(socket.id, current.token);
        pendingReconnect = null;
      });
    });

    socket.onAnyOutgoing((event: string, ...args: unknown[]) => {
      if (event === "f_room") {
        const parsed = z.object({ roomCode: roomCodeSchema, sessionToken: uuidSchema }).safeParse(args[0]);
        if (!parsed.success) return;
        const prior = flexAuth.get(parsed.data.sessionToken);
        const auth: FlexAuth = {
          token: parsed.data.sessionToken,
          roomCode: parsed.data.roomCode,
          name: pendingProfile?.name ?? prior?.name ?? "Flex Player",
          avatar: pendingProfile?.avatar ?? prior?.avatar ?? "⚡",
          gameSocketId: socket.id,
          connected: true,
          updatedAt: Date.now(),
          isHost: prior?.isHost ?? pendingRole === "host",
        };
        flexAuth.set(auth.token, auth);
        flexSocketToken.set(socket.id, auth.token);
        pendingProfile = null;
        pendingRole = null;
      }
      if (event === "f_left") {
        reconnectRejected = true;
        pendingReconnect = null;
        const token = flexSocketToken.get(socket.id);
        const auth = token ? flexAuth.get(token) : undefined;
        if (auth && auth.gameSocketId === socket.id) {
          auth.connected = false;
          auth.updatedAt = Date.now();
        }
      }
    });

    socket.on("f_leave", () => {
      queueMicrotask(() => {
        const token = flexSocketToken.get(socket.id);
        const auth = token ? flexAuth.get(token) : undefined;
        if (auth && auth.gameSocketId === socket.id) {
          auth.connected = false;
          auth.updatedAt = Date.now();
        }
      });
    });

    socket.on("disconnect", () => {
      const token = flexSocketToken.get(socket.id);
      flexSocketToken.delete(socket.id);
      const auth = token ? flexAuth.get(token) : undefined;
      if (auth && auth.gameSocketId === socket.id) {
        auth.connected = false;
        auth.updatedAt = Date.now();
      }
    });
  });

  function validateClassic(roomCode: string, token: string) {
    const room = classicRooms.get(roomCode);
    if (!room) return null;
    try {
      const player = room.player(token);
      if (!player.connected || player.isBot) return null;
      return { name: player.displayName, avatar: player.avatar, isHost: room.tokens[0] === token };
    } catch {
      return null;
    }
  }

  function validateFlex(roomCode: string, token: string) {
    const auth = flexAuth.get(token);
    if (!auth || !auth.connected || auth.roomCode !== roomCode) return null;
    return { name: auth.name, avatar: auth.avatar, isHost: auth.isHost };
  }

  function removeVoice(socketId: string, reason = "left") {
    const member = voiceSession.get(socketId);
    if (!member) return;
    voiceSession.delete(socketId);
    const scope = scopeOf(member.mode, member.roomCode);
    const room = voiceRooms.get(scope);
    if (room?.get(member.token)?.voiceSocketId === socketId) room.delete(member.token);
    if (room && room.size === 0) voiceRooms.delete(scope);
    io.of("/voice").to(scope).emit("v_peer_left", { token: member.token, reason });
  }

  function forceVoiceOff(scope: string) {
    const members = [...(voiceRooms.get(scope)?.values() ?? [])];
    const voice = io.of("/voice");
    for (const member of members) {
      voice.to(member.voiceSocketId).emit("v_forced_leave", { reason: "Voice was disabled by the room host." });
      removeVoice(member.voiceSocketId, "host-disabled");
    }
  }

  const voice = io.of("/voice");
  voice.on("connection", (socket: Socket) => {
    let budget = 180;
    let budgetAt = Date.now();

    const spend = (cost = 1) => {
      const now = Date.now();
      budget = Math.min(180, budget + ((now - budgetAt) / 1000) * 5);
      budgetAt = now;
      if (budget < cost) return false;
      budget -= cost;
      return true;
    };
    const fail = (message: string) => socket.emit("v_error", { message });

    socket.on("v_join", (raw: unknown) => {
      if (!spend(4)) return fail("Voice signaling is busy. Try again in a moment.");
      const parsed = joinSchema.safeParse(raw);
      if (!parsed.success) return fail("Voice room request was invalid.");
      const { mode, roomCode, sessionToken } = parsed.data;
      const identity = mode === "classic" ? validateClassic(roomCode, sessionToken) : validateFlex(roomCode, sessionToken);
      if (!identity) return fail("Voice access expired. Rejoin the game room first.");

      const scope = scopeOf(mode, roomCode);
      const policy = policyOf(scope);
      if (!policy.enabled) return fail("Voice is disabled for this room.");
      removeVoice(socket.id, "moved");
      let members = voiceRooms.get(scope);
      if (!members) { members = new Map(); voiceRooms.set(scope, members); }
      if (members.size >= 8 && !members.has(sessionToken)) return fail("This voice room is full.");

      const previous = members.get(sessionToken);
      if (previous && previous.voiceSocketId !== socket.id) {
        const old = voice.sockets.get(previous.voiceSocketId);
        old?.emit("v_replaced", {});
        removeVoice(previous.voiceSocketId, "replaced");
        old?.disconnect(true);
      }

      const member: VoiceMember = {
        mode,
        roomCode,
        token: sessionToken,
        name: identity.name,
        avatar: identity.avatar,
        voiceSocketId: socket.id,
        muted: true,
        isHost: identity.isHost,
      };
      members.set(sessionToken, member);
      voiceSession.set(socket.id, member);
      socket.join(scope);

      const peers = [...members.values()].filter((person) => person.token !== member.token).map(publicMember);
      socket.emit("v_joined", {
        self: publicMember(member),
        mode,
        roomCode,
        peers,
        iceServers: iceConfig(),
        policy,
        canManagePolicy: member.isHost,
      });
      socket.to(scope).emit("v_peer_joined", publicMember(member));
    });

    socket.on("v_policy", (raw: unknown) => {
      if (!spend(3)) return fail("Voice settings are changing too quickly.");
      const parsed = policySchema.safeParse(raw);
      if (!parsed.success) return fail("Voice policy request was invalid.");
      const me = voiceSession.get(socket.id);
      if (!me) return fail("Join voice first.");
      if (!me.isHost) return fail("Only the room host can change voice policy.");
      const scope = scopeOf(me.mode, me.roomCode);
      const policy = parsed.data;
      voicePolicies.set(scope, policy);
      voice.to(scope).emit("v_policy", { policy, changedBy: me.name });
      if (!policy.enabled) forceVoiceOff(scope);
    });

    socket.on("v_signal", (raw: unknown) => {
      if (!spend(1)) return;
      const parsed = signalSchema.safeParse(raw);
      if (!parsed.success) return fail("Voice signal rejected.");
      const me = voiceSession.get(socket.id);
      if (!me) return fail("Join voice first.");
      const scope = scopeOf(me.mode, me.roomCode);
      if (!policyOf(scope).enabled) return fail("Voice is disabled for this room.");
      const target = voiceRooms.get(scope)?.get(parsed.data.targetToken);
      if (!target || target.token === me.token) return;
      voice.to(target.voiceSocketId).emit("v_signal", { fromToken: me.token, signal: parsed.data.signal });
    });

    socket.on("v_meta", (raw: unknown) => {
      if (!spend(1)) return;
      const parsed = metaSchema.safeParse(raw);
      if (!parsed.success) return;
      const me = voiceSession.get(socket.id);
      if (!me) return;
      const policy = policyOf(scopeOf(me.mode, me.roomCode));
      if (!policy.enabled) return;
      me.muted = parsed.data.muted;
      socket.to(scopeOf(me.mode, me.roomCode)).emit("v_peer_meta", { token: me.token, muted: me.muted });
    });

    socket.on("v_leave", (raw: unknown) => {
      if (!emptySchema.safeParse(raw ?? {}).success) return;
      removeVoice(socket.id);
      socket.emit("v_left", {});
    });

    socket.on("disconnect", () => removeVoice(socket.id, "disconnected"));
  });

  const cleanup = setInterval(() => {
    const cutoff = Date.now() - 40 * 60_000;
    for (const [token, auth] of flexAuth) if (!auth.connected && auth.updatedAt < cutoff) flexAuth.delete(token);
    for (const scope of [...voicePolicies.keys()]) {
      const [mode, roomCode] = scope.split(":") as [VoiceMode, string];
      const active = mode === "classic" ? classicRooms.has(roomCode) : [...flexAuth.values()].some((auth) => auth.roomCode === roomCode && auth.connected);
      if (!active) voicePolicies.delete(scope);
    }
  }, 5 * 60_000);
  cleanup.unref();
}
