import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z } from "zod";

type FlexVisibility = "public" | "private" | "invite";
type FlexPolicy = {
  roomCode: string;
  hostToken: string;
  visibility: FlexVisibility;
  inviteKey: string;
  status: "LOBBY" | "PLAYING" | "FINISHED" | "UNKNOWN";
  updatedAt: number;
};
type FlexIdentity = { roomCode: string; token: string; socketId: string; isHost: boolean; updatedAt: number };
type EntryIntent = "host" | "guest" | null;

const code = z.string().regex(/^[A-Z2-9]{4}$/);
const uuid = z.string().uuid();
const visibility = z.enum(["public", "private", "invite"]);
const authorizeSchema = z.object({ roomCode: code, inviteKey: uuid }).strict();
const stateSchema = z.object({ roomCode: code, sessionToken: uuid }).strict();
const policySchema = z.object({ roomCode: code, sessionToken: uuid, visibility, rotateInvite: z.boolean().optional() }).strict();
const joinSchema = z.object({ roomCode: code }).passthrough();
const reconnectSchema = z.object({ roomCode: code, sessionToken: uuid }).passthrough();
const roomSchema = z.object({ roomCode: code, sessionToken: uuid }).passthrough();
const stateOutSchema = z.object({ roomCode: code, status: z.enum(["LOBBY", "PLAYING", "FINISHED"]) }).passthrough();

export function registerFlexPrivacy(io: Server) {
  const nsp = io.of("/flex");
  const policies = new Map<string, FlexPolicy>();
  const identities = new Map<string, FlexIdentity>();
  const socketTokens = new Map<string, string>();
  const intents = new Map<string, EntryIntent>();
  const joinAuth = new Map<string, { roomCode: string; inviteKey: string; expiresAt: number }>();

  const policyFor = (roomCode: string) => policies.get(roomCode);
  const publicState = (policy: FlexPolicy, token?: string) => ({
    roomCode: policy.roomCode,
    visibility: policy.visibility,
    inviteKey: token === policy.hostToken ? policy.inviteKey : null,
    isHost: token === policy.hostToken,
    status: policy.status,
  });
  const emitPolicy = (socket: Socket, policy: FlexPolicy, token?: string) => socket.emit("fp_state", publicState(policy, token));

  function authorizeIdentity(socket: Socket, roomCode: string, token: string) {
    const known = identities.get(token);
    if (!known || known.roomCode !== roomCode) return null;
    known.socketId = socket.id;
    known.updatedAt = Date.now();
    socketTokens.set(socket.id, token);
    return known;
  }

  // Must be registered before registerUnoFlex(). Packet middleware then protects f_join
  // before the Flex game handler can attach a player to an invite-only room.
  nsp.on("connection", (socket: Socket) => {
    socket.use(([event, raw], next) => {
      if (event !== "f_join") return next();
      const parsed = joinSchema.safeParse(raw ?? {});
      if (!parsed.success) return next();
      const policy = policyFor(parsed.data.roomCode);
      if (!policy || policy.visibility !== "invite") return next();
      const grant = joinAuth.get(socket.id);
      joinAuth.delete(socket.id);
      if (grant && grant.roomCode === policy.roomCode && grant.inviteKey === policy.inviteKey && grant.expiresAt >= Date.now()) return next();
      socket.emit("f_error", { message: "This Flex room is invite-only. Open the current invite link to join 🔒" });
      return next(new Error("FLEX_INVITE_REQUIRED"));
    });

    socket.on("f_create_multi", () => intents.set(socket.id, "host"));
    socket.on("f_create_bot", () => intents.set(socket.id, "host"));
    socket.on("f_join", () => intents.set(socket.id, "guest"));

    socket.on("fp_authorize_join", (raw: unknown) => {
      const parsed = authorizeSchema.safeParse(raw ?? {});
      if (!parsed.success) return socket.emit("fp_error", { message: "Invite link is invalid." });
      const policy = policyFor(parsed.data.roomCode);
      if (!policy) return socket.emit("fp_error", { message: "Flex room was not found." });
      if (policy.visibility !== "invite") {
        joinAuth.set(socket.id, { roomCode: policy.roomCode, inviteKey: parsed.data.inviteKey, expiresAt: Date.now() + 8_000 });
        return socket.emit("fp_join_authorized", { roomCode: policy.roomCode });
      }
      if (parsed.data.inviteKey !== policy.inviteKey) return socket.emit("fp_error", { message: "This Flex invite link has expired." });
      joinAuth.set(socket.id, { roomCode: policy.roomCode, inviteKey: policy.inviteKey, expiresAt: Date.now() + 8_000 });
      socket.emit("fp_join_authorized", { roomCode: policy.roomCode });
    });

    socket.on("fp_get_state", (raw: unknown) => {
      const parsed = stateSchema.safeParse(raw ?? {});
      if (!parsed.success) return;
      const identity = authorizeIdentity(socket, parsed.data.roomCode, parsed.data.sessionToken);
      const policy = policyFor(parsed.data.roomCode);
      if (identity && policy) emitPolicy(socket, policy, identity.token);
    });

    socket.on("fp_set_privacy", (raw: unknown) => {
      const parsed = policySchema.safeParse(raw ?? {});
      if (!parsed.success) return socket.emit("fp_error", { message: "Privacy request was invalid." });
      const identity = authorizeIdentity(socket, parsed.data.roomCode, parsed.data.sessionToken);
      const policy = policyFor(parsed.data.roomCode);
      if (!identity || !policy || !identity.isHost || policy.hostToken !== identity.token) return socket.emit("fp_error", { message: "Only the Flex room host can change privacy." });
      if (policy.status !== "LOBBY") return socket.emit("fp_error", { message: "Flex room privacy can only change in the lobby." });
      policy.visibility = parsed.data.visibility;
      if (parsed.data.rotateInvite) policy.inviteKey = randomUUID();
      policy.updatedAt = Date.now();
      for (const known of identities.values()) {
        if (known.roomCode !== policy.roomCode) continue;
        const peer = nsp.sockets.get(known.socketId);
        if (peer) emitPolicy(peer, policy, known.token);
      }
    });

    socket.on("f_reconnect", (raw: unknown) => {
      const parsed = reconnectSchema.safeParse(raw ?? {});
      if (!parsed.success) return;
      const identity = authorizeIdentity(socket, parsed.data.roomCode, parsed.data.sessionToken);
      if (!identity) return;
      const policy = policyFor(parsed.data.roomCode);
      if (policy) queueMicrotask(() => emitPolicy(socket, policy, identity.token));
    });

    socket.onAnyOutgoing((event: string, ...args: unknown[]) => {
      if (event === "f_room") {
        const parsed = roomSchema.safeParse(args[0]);
        if (!parsed.success) return;
        const intent = intents.get(socket.id) ?? null;
        intents.delete(socket.id);
        let policy = policyFor(parsed.data.roomCode);
        if (!policy && intent === "host") {
          policy = {
            roomCode: parsed.data.roomCode,
            hostToken: parsed.data.sessionToken,
            visibility: "public",
            inviteKey: randomUUID(),
            status: "LOBBY",
            updatedAt: Date.now(),
          };
          policies.set(policy.roomCode, policy);
        }
        if (!policy) return;
        const identity: FlexIdentity = {
          roomCode: parsed.data.roomCode,
          token: parsed.data.sessionToken,
          socketId: socket.id,
          isHost: policy.hostToken === parsed.data.sessionToken,
          updatedAt: Date.now(),
        };
        identities.set(identity.token, identity);
        socketTokens.set(socket.id, identity.token);
        queueMicrotask(() => emitPolicy(socket, policy!, identity.token));
      }
      if (event === "f_state") {
        const parsed = stateOutSchema.safeParse(args[0]);
        if (!parsed.success) return;
        const policy = policyFor(parsed.data.roomCode);
        if (policy) {
          policy.status = parsed.data.status;
          policy.updatedAt = Date.now();
        }
      }
      if (event === "f_left") {
        const token = socketTokens.get(socket.id);
        if (token) {
          const identity = identities.get(token);
          if (identity && identity.socketId === socket.id) identity.updatedAt = Date.now();
        }
      }
    });

    socket.on("disconnect", () => {
      joinAuth.delete(socket.id);
      intents.delete(socket.id);
      const token = socketTokens.get(socket.id);
      socketTokens.delete(socket.id);
      const identity = token ? identities.get(token) : undefined;
      if (identity && identity.socketId === socket.id) identity.updatedAt = Date.now();
    });
  });

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [socketId, grant] of joinAuth) if (grant.expiresAt < now) joinAuth.delete(socketId);
    const identityCutoff = now - 45 * 60_000;
    for (const [token, identity] of identities) if (identity.updatedAt < identityCutoff) identities.delete(token);
    const policyCutoff = now - 2 * 60 * 60_000;
    for (const [roomCode, policy] of policies) if (policy.updatedAt < policyCutoff) policies.delete(roomCode);
  }, 5 * 60_000);
  cleanup.unref();

  return { policies, close: () => clearInterval(cleanup) };
}
