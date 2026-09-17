import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Server, Socket } from "socket.io";
import { z } from "zod";
import { GameRoom } from "./GameRoom.js";

const TROLLS = {
  "think-fast": "এত ভাবিস কেন? দাবা নাকি? 💀",
  "plus4": "+4 খাও ভাই! 😂",
  "uno-soon": "UNO আসতেছে, দোয়া কইরো 👀",
  "skill-low": "কপাল ভালো, স্কিল কম 😏",
  "caught": "ধরা খাইছো বস! 😈",
  "shop": "কার্ড তুলতে তুলতে দোকান খুলবা নাকি? 😂",
  "turn": "তোমার চাল, ঘুমাইও না 😴",
  "mercy": "আমি নিরীহ মানুষ, +4 দিও না 🥺",
  "watch": "দেখে খেল, পরে কান্দিস না 😂",
  "stadium": "স্টেডিয়াম গরম! 🔥",
} as const;

type TrollId = keyof typeof TROLLS;
export type RoomVisibility = "public" | "private" | "invite";
export type RoomPrivacyState = { visibility: RoomVisibility; inviteKey: string };

export function createUnoServer(options: { maxRooms?: number } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: { directives: { "script-src": ["'self'"], "connect-src": ["'self'"], "upgrade-insecure-requests": null } } }));
  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 8192, pingInterval: 10_000, pingTimeout: 10_000 });
  const rooms = new Map<string, GameRoom>();
  const roomPrivacy = new Map<string, RoomPrivacyState>();
  const membership = new Map<string, { room: GameRoom; token: string }>();
  const ipBuckets = new Map<string, { at: number; count: number }>();
  const uuid = z.string().uuid();
  const name = z.string().trim().min(1).max(24);
  const avatar = z.string().trim().min(1).max(8);
  const color = z.enum(["RED", "YELLOW", "GREEN", "BLUE"]);
  const code = z.string().regex(/^[A-Z2-9]{4}$/);
  const inviteKey = z.string().uuid();
  const visibility = z.enum(["public", "private", "invite"]);
  const empty = z.object({}).strict();
  const roomSound = z.enum(["headphone-1", "kemon-aso", "fast", "gorib", "rag-korla", "dhoka", "khoma", "big-fan-bhai", "ashraful", "uhuhu-babare", "vul"]);
  const trollId = z.enum(Object.keys(TROLLS) as [TrollId, ...TrollId[]]);

  const policyFor = (room: GameRoom) => roomPrivacy.get(room.state.roomCode) ?? { visibility: "public" as const, inviteKey: randomUUID() };
  const createPolicy = (room: GameRoom) => {
    const policy: RoomPrivacyState = { visibility: "public", inviteKey: randomUUID() };
    roomPrivacy.set(room.state.roomCode, policy);
    return policy;
  };

  function publish(room: GameRoom) {
    room.assertIntegrity("publish");
    const policy = policyFor(room);
    for (const token of room.tokens) {
      const p = room.player(token);
      if (p.connected && !p.isBot) {
        const sync = room.sync(token);
        io.to(p.socketId).emit("s_sync_state", {
          ...sync,
          roomVisibility: policy.visibility,
          inviteKey: room.tokens[0] === token ? policy.inviteKey : null,
          players: sync.players.map((player, index) => ({ ...player, isHost: index === 0 })),
        });
      }
    }
  }

  function broadcastHumans(room: GameRoom, event: string, payload: unknown) {
    for (const t of room.tokens) {
      const p = room.player(t);
      if (p.connected && !p.isBot) io.to(p.socketId).emit(event, payload);
    }
  }

  io.use((socket, next) => {
    const ip = socket.handshake.address, now = Date.now();
    let b = ipBuckets.get(ip);
    if (!b || now - b.at > 60_000) { b = { at: now, count: 0 }; ipBuckets.set(ip, b); }
    if (++b.count > 90) return next(Error("একটু আস্তে ভাই 😄"));
    next();
  });

  io.on("connection", (socket: Socket) => {
    socket.conn.on("packet", (packet) => {
      if (packet.type === "pong") { const m = membership.get(socket.id); if (m) m.room.player(m.token).lastHeartbeat = Date.now(); }
    });
    let budget = 60, refill = Date.now();
    let lastSoundAt = 0, lastTrollAt = 0;

    function bind<T>(event: string, schema: z.ZodType<T>, fn: (data: T) => void) {
      socket.on(event, (raw: unknown) => {
        const now = Date.now(); budget = Math.min(60, budget + (now - refill) * 0.015); refill = now;
        if (budget < 1) { socket.emit("s_error", { message: "এত তাড়া কিসের! একটু ধীরে 😅" }); return; }
        budget--;
        try {
          const result = schema.safeParse(raw ?? {});
          if (!result.success) throw Error("রিকোয়েস্টটা ঠিক হয়নি।");
          fn(result.data);
        } catch (e) {
          const message = e instanceof Error ? e.message : "কাজটা হলো না ভাই।";
          console.error(`[UNO] ${event}:`, e);
          socket.emit("s_error", { message: message.startsWith("CARD_") ? "কার্ড স্টেট নিরাপত্তা চেক ব্যর্থ হয়েছে। রুমটি রিফ্রেশ করো ⚠️" : message });
        }
      });
    }
    function free() { if (membership.has(socket.id)) throw Error("তুমি ইতিমধ্যে একটা রুমে আছো।"); }
    function session() {
      const m = membership.get(socket.id);
      if (!m || m.room.player(m.token).socketId !== socket.id) throw Error("আগে রুমে ঢুকো বা রিকানেক্ট করো।");
      m.room.player(m.token).lastHeartbeat = Date.now(); m.room.tick(); return m;
    }
    function action(fn: (room: GameRoom, t: string) => void) {
      const { room, token } = session();
      try { fn(room, token); room.assertIntegrity("after action"); }
      finally { publish(room); }
    }
    function attach(room: GameRoom, displayName: string, av: string) {
      const token = randomUUID();
      room.add({ socketId: socket.id, sessionToken: token, displayName, avatar: av, hand: [], isReady: false, isUnoSafe: false, connected: true, lastHeartbeat: Date.now(), isBot: false });
      membership.set(socket.id, { room, token });
      socket.emit("s_room_created", { roomCode: room.state.roomCode, sessionToken: token });
      publish(room); return token;
    }
    function newCode() {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let roomCode: string;
      do { roomCode = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(""); } while (rooms.has(roomCode));
      return roomCode;
    }

    bind("c_create_room", z.object({ displayName: name, avatar }).strict(), ({ displayName, avatar: av }) => {
      free(); if (rooms.size >= (options.maxRooms ?? 1000)) throw Error("সার্ভার এখন ভর্তি। একটু পরে চেষ্টা করো।");
      const room = new GameRoom(newCode()); rooms.set(room.state.roomCode, room); createPolicy(room); attach(room, displayName, av);
    });
    bind("c_create_bot_room", z.object({ displayName: name, avatar }).strict(), ({ displayName, avatar: av }) => {
      free(); if (rooms.size >= (options.maxRooms ?? 1000)) throw Error("সার্ভার এখন ভর্তি। একটু পরে চেষ্টা করো।");
      const room = new GameRoom(newCode()); rooms.set(room.state.roomCode, room); createPolicy(room);
      const human = attach(room, displayName, av);
      const bots = [["বট মামা","🤖"],["কার্ড গুরু","🧠"],["UNO কাকা","😈"]] as const;
      const [botName, botAvatar] = bots[randomInt(bots.length)]; room.addBot(botName, botAvatar); room.ready(human, true); publish(room);
    });
    bind("c_join_room", z.object({ roomCode: code, displayName: name, avatar, inviteKey: inviteKey.optional() }).strict(), ({ roomCode, displayName, avatar: av, inviteKey: suppliedInvite }) => {
      free(); const room = rooms.get(roomCode); if (!room) throw Error("এই রুমটা পাওয়া গেল না।");
      const policy = policyFor(room);
      if (policy.visibility === "invite" && suppliedInvite !== policy.inviteKey) throw Error("এই রুমে ঢুকতে সঠিক invite link লাগবে 🔒");
      attach(room, displayName, av);
    });
    bind("c_reconnect", z.object({ roomCode: code, sessionToken: uuid }).strict(), ({ roomCode, sessionToken }) => {
      free(); const room = rooms.get(roomCode);
      if (!room || !room.state.players[sessionToken]) { socket.emit("s_session_expired", {}); throw Error("পুরনো রুম শেষ হয়ে গেছে। নতুন রুম বানাও।"); }
      const player = room.player(sessionToken), oldId = player.socketId;
      try { room.reconnect(sessionToken, socket.id); } catch (e) { socket.emit("s_session_expired", {}); throw e; }
      membership.delete(oldId); membership.set(socket.id, { room, token: sessionToken });
      if (oldId !== socket.id) { io.to(oldId).emit("s_session_replaced", {}); io.sockets.sockets.get(oldId)?.disconnect(true); }
      publish(room);
    });

    bind("c_room_privacy", z.object({ visibility, rotateInvite: z.boolean().optional() }).strict(), ({ visibility: nextVisibility, rotateInvite }) => {
      const { room, token } = session();
      if (room.tokens[0] !== token) throw Error("শুধু room host privacy বদলাতে পারবে।");
      if (room.state.status !== "LOBBY") throw Error("Match শুরু হওয়ার পর room privacy বদলানো যাবে না।");
      const prior = policyFor(room);
      const next: RoomPrivacyState = { visibility: nextVisibility, inviteKey: rotateInvite ? randomUUID() : prior.inviteKey };
      roomPrivacy.set(room.state.roomCode, next);
      publish(room);
      io.emit("s_room_privacy_changed", { roomCode: room.state.roomCode });
    });

    bind("c_toggle_ready", z.object({ isReady: z.boolean() }).strict(), (d) => action((r,t) => r.ready(t,d.isReady)));
    bind("c_play_card", z.object({ cardId: uuid, chosenColor: color.optional(), calledUno: z.boolean() }).strict(), (d) => action((r,t) => {
      const isDevil = r.player(t).hand.find((c) => c.id === d.cardId)?.value === "DEVIL";
      r.play(t,d.cardId,d.chosenColor,d.calledUno);
      if (isDevil) socket.emit("s_devil_reveal", { durationMs: 1000, players: r.devilReveal(t) });
    }));
    bind("c_play_drawn", z.object({ chosenColor: color.optional(), calledUno: z.boolean() }).strict(), (d) => action((r,t) => {
      const c=r.state.drawnCardPlayable; if(!c) throw Error("তোলা কার্ড নেই।");
      const isDevil = c.value === "DEVIL";
      r.play(t,c.id,d.chosenColor,d.calledUno,true);
      if (isDevil) socket.emit("s_devil_reveal", { durationMs: 1000, players: r.devilReveal(t) });
    }));
    bind("c_choose_start_color", z.object({ chosenColor: color }).strict(), (d) => action((r,t) => r.chooseStart(t,d.chosenColor)));
    bind("c_draw_card", empty, () => action((r,t) => r.draw(t)));
    bind("c_pass_turn", empty, () => action((r,t) => r.pass(t)));
    bind("c_catch_uno", empty, () => action((r,t) => r.catchUno(t)));
    bind("c_request_rematch", empty, () => action((r,t) => r.requestRematch(t)));

    bind("c_troll_reaction", z.object({ trollId }).strict(), ({ trollId: id }) => {
      const now = Date.now(); if (now - lastTrollAt < 1000) throw Error("ট্রল একটু আস্তে ভাই 😂"); lastTrollAt = now;
      const { room, token } = session();
      broadcastHumans(room, "s_troll_reaction", { senderName: room.player(token).displayName, text: TROLLS[id], trollId: id, at: now });
    });

    bind("c_sound_reaction", z.object({ soundId: roomSound }).strict(), ({ soundId }) => {
      const now = Date.now(); if (now - lastSoundAt < 1800) throw Error("সাউন্ড একটু আস্তে ভাই 😅"); lastSoundAt = now;
      const { room, token } = session();
      broadcastHumans(room, "s_sound_reaction", { soundId, senderName: room.player(token).displayName, at: now });
    });

    bind("c_leave_room", empty, () => {
      const { room, token } = session(); room.disconnect(token);
      if (room.state.status === "PLAYING") {
        const connected = room.tokens.filter((x) => x !== token && room.player(x).connected);
        if (connected.length === 1) room.finish(connected[0], "forfeit");
      }
      membership.delete(socket.id); socket.emit("s_session_expired", {}); publish(room);
    });
    socket.on("disconnect", () => {
      const m=membership.get(socket.id); membership.delete(socket.id);
      if(m && m.room.player(m.token).socketId===socket.id){m.room.disconnect(m.token); publish(m.room);}
    });
  });

  const botDue = new Map<string, number>();
  const ticker = setInterval(() => {
    for (const [code,room] of rooms) {
      const rev=room.revision;
      try {
        room.tick();
        if (room.state.status === "PLAYING" && !room.paused && room.player(room.current).isBot) {
          const now = Date.now(); const due = botDue.get(code);
          if (!due) botDue.set(code, now + 650 + randomInt(700));
          else if (now >= due) { room.playBotTurn(); botDue.delete(code); }
        } else botDue.delete(code);
        room.assertIntegrity("ticker");
        if(room.revision!==rev) publish(room);
      } catch (e) {
        console.error(`[UNO integrity ${code}]`, e);
      }
      const humans = room.tokens.filter((t)=>!room.player(t).isBot);
      const abandoned=humans.length>0 && humans.every((t)=>!room.player(t).connected) && Date.now()-room.updatedAt>60_000;
      const idle=room.state.status!=="PLAYING" && Date.now()-room.updatedAt>30*60_000;
      if(abandoned||idle){ for(const t of room.tokens){const id=room.player(t).socketId; membership.delete(id); io.to(id).emit("s_session_expired",{});} rooms.delete(code); roomPrivacy.delete(code); }
    }
    for(const [ip,b] of ipBuckets) if(Date.now()-b.at>60_000) ipBuckets.delete(ip);
  },100); ticker.unref();

  app.get("/healthz", (_req,res)=>res.json({status:"ok"}));
  app.use(express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client")));
  async function close(){clearInterval(ticker); await new Promise<void>((resolve)=>io.close(()=>resolve()));}
  return {http,io,rooms,roomPrivacy,close};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createUnoServer(); const port=Number(process.env.PORT??3000);
  server.http.listen(port,"0.0.0.0",()=>console.log(`UNO server listening on port ${port}`));
  for(const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>{void server.close().then(()=>process.exit(0));});
}
