import { randomInt, randomUUID } from "node:crypto";
import type { Namespace, Server, Socket } from "socket.io";
import { z } from "zod";

type Color = "RED" | "YELLOW" | "GREEN" | "BLUE";
type CardKind =
  | "NUMBER"
  | "SKIP"
  | "REVERSE"
  | "DRAW2"
  | "FLEX_SKIP"
  | "FLEX_REVERSE"
  | "FLEX_DRAW2"
  | "WILD_ALL_FLIP"
  | "WILD_FLEX_ALL_DRAW"
  | "WILD_FLEX_TARGET_DRAW2"
  | "WILD_FLEX_DRAW4";

type Card = {
  id: string;
  kind: CardKind;
  color: Color | null;
  value: number | null;
  flexColor: Color | null;
  flipPower: boolean;
};

type Player = {
  token: string;
  socketId: string;
  name: string;
  avatar: string;
  hand: Card[];
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  powerOn: boolean;
  unoCalled: boolean;
};

type PendingDraw4 = {
  offender: string;
  victim: string;
  chosenColor: Color;
  offenderHadMatchingColor: boolean;
};

type Room = {
  code: string;
  players: Player[];
  deck: Card[];
  discard: Card[];
  activeColor: Color;
  current: number;
  direction: 1 | -1;
  status: "LOBBY" | "PLAYING" | "FINISHED";
  winner: string | null;
  mode: "BOT" | "MULTI";
  updatedAt: number;
  pendingDraw4: PendingDraw4 | null;
  lastAction: string;
  drawnBy: string | null;
  identity: Map<string, string>;
};

const COLORS: Color[] = ["RED", "YELLOW", "GREEN", "BLUE"];
const colorSchema = z.enum(COLORS);
const nameSchema = z.string().trim().min(1).max(24);
const avatarSchema = z.string().trim().min(1).max(8);
const codeSchema = z.string().regex(/^[A-Z2-9]{4}$/);
const uuidSchema = z.string().uuid();
const empty = z.object({}).strict();

function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function card(kind: CardKind, color: Color | null, value: number | null, flexColor: Color | null = null, flipPower = false): Card {
  return { id: randomUUID(), kind, color, value, flexColor, flipPower };
}

function signature(c: Card) {
  return `${c.kind}|${c.color ?? "WILD"}|${c.value ?? ""}|${c.flexColor ?? ""}|${c.flipPower ? 1 : 0}`;
}

function makeDeck(): Card[] {
  const cards: Card[] = [];
  for (let c = 0; c < COLORS.length; c++) {
    const color = COLORS[c];
    const flexColor = COLORS[(c + 1) % COLORS.length];
    for (let copy = 0; copy < 2; copy++) {
      for (let n = 1; n <= 8; n++) cards.push(card("NUMBER", color, n, null, false));
    }
    cards.push(card("SKIP", color, null), card("REVERSE", color, null), card("DRAW2", color, null));
    cards.push(card("FLEX_SKIP", color, null, flexColor), card("FLEX_REVERSE", color, null, flexColor), card("FLEX_DRAW2", color, null, flexColor));
    for (let n = 1; n <= 4; n++) cards.push(card("NUMBER", color, n, flexColor, true));
  }
  for (let i = 0; i < 2; i++) {
    cards.push(card("WILD_ALL_FLIP", null, null));
    cards.push(card("WILD_FLEX_ALL_DRAW", null, null, "RED"));
    cards.push(card("WILD_FLEX_TARGET_DRAW2", null, null, "BLUE"));
    cards.push(card("WILD_FLEX_DRAW4", null, null, "GREEN"));
  }
  return shuffle(cards);
}

function allCards(room: Room) {
  return [...room.deck, ...room.discard, ...room.players.flatMap((p) => p.hand)];
}

function captureIdentity(room: Room) {
  room.identity.clear();
  for (const c of allCards(room)) room.identity.set(c.id, signature(c));
}

function assertIntegrity(room: Room) {
  if (room.status === "LOBBY") return;
  const cards = allCards(room);
  if (cards.length !== 112) throw Error(`FLEX_CARD_CONSERVATION:${cards.length}`);
  const ids = new Set<string>();
  for (const c of cards) {
    if (ids.has(c.id)) throw Error(`FLEX_DUPLICATE_CARD:${c.id}`);
    ids.add(c.id);
    const expected = room.identity.get(c.id);
    if (!expected || expected !== signature(c)) throw Error(`FLEX_CARD_MUTATED:${c.id}`);
  }
}

function nextIndex(room: Room, steps = 1) {
  const total = room.players.length;
  let idx = room.current;
  for (let n = 0; n < steps; n++) {
    for (let guard = 0; guard < total; guard++) {
      idx = (idx + room.direction + total) % total;
      if (room.players[idx]?.connected || room.players[idx]?.isBot) break;
    }
  }
  return idx;
}

function refill(room: Room) {
  if (room.deck.length) return;
  const top = room.discard.pop();
  room.deck = shuffle(room.discard.splice(0));
  if (top) room.discard.push(top);
}

function drawOne(room: Room) {
  refill(room);
  const c = room.deck.pop();
  if (!c) throw Error("ড্র পাইল খালি হয়ে গেছে।");
  return c;
}

function draw(room: Room, p: Player, count: number) {
  for (let i = 0; i < count; i++) p.hand.push(drawOne(room));
}

function resetPowerIfAllOff(room: Room) {
  const active = room.players.filter((p) => p.connected || p.isBot);
  if (active.length && active.every((p) => !p.powerOn)) {
    for (const p of active) p.powerOn = true;
    room.lastAction = "সব Power Card OFF হয়েছিল — সবাই আবার ON ✅";
  }
}

function symbolGroup(kind: CardKind) {
  if (kind === "FLEX_SKIP") return "SKIP";
  if (kind === "FLEX_REVERSE") return "REVERSE";
  if (kind === "FLEX_DRAW2") return "DRAW2";
  return kind;
}

function regularMatch(c: Card, room: Room) {
  const top = room.discard.at(-1);
  if (!top) return true;
  if (c.color === null) return true;
  if (c.color === room.activeColor) return true;
  if (c.kind === "NUMBER" && top.kind === "NUMBER" && c.value === top.value) return true;
  if (c.kind !== "NUMBER" && top.kind !== "NUMBER" && symbolGroup(c.kind) === symbolGroup(top.kind)) return true;
  return false;
}

function flexMatch(c: Card, room: Room, p: Player) {
  if (!p.powerOn || !c.flexColor) return false;
  if (c.kind.startsWith("WILD_")) return true;
  return c.flexColor === room.activeColor;
}

function legalSides(c: Card, room: Room, p: Player) {
  const sides: Array<"REGULAR" | "FLEX"> = [];
  if (regularMatch(c, room)) sides.push("REGULAR");
  if (flexMatch(c, room, p)) sides.push("FLEX");
  return sides;
}

function sync(room: Room, token: string) {
  const me = room.players.find((p) => p.token === token);
  if (!me) throw Error("Player not found");
  return {
    roomCode: room.code,
    status: room.status,
    mode: room.mode,
    winner: room.winner,
    direction: room.direction,
    activeColor: room.activeColor,
    currentToken: room.players[room.current]?.token ?? null,
    top: room.discard.at(-1) ?? null,
    deckCount: room.deck.length,
    hasDrawn: room.drawnBy === token,
    pendingDraw4: room.pendingDraw4 && room.pendingDraw4.victim === token ? { canChallenge: true } : null,
    lastAction: room.lastAction,
    hand: me.hand.map((c) => ({ ...c, legalSides: room.status === "PLAYING" && room.players[room.current]?.token === token && !room.pendingDraw4 ? legalSides(c, room, me) : [] })),
    players: room.players.map((p) => ({ token: p.token, name: p.name, avatar: p.avatar, ready: p.ready, connected: p.connected, isBot: p.isBot, cardCount: p.hand.length, powerOn: p.powerOn, unoCalled: p.unoCalled })),
  };
}

function chooseBotColor(bot: Player) {
  const counts = new Map<Color, number>(COLORS.map((c) => [c, 0]));
  for (const c of bot.hand) if (c.color) counts.set(c.color, (counts.get(c.color) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? COLORS[randomInt(COLORS.length)];
}

function makeCode(rooms: Map<string, Room>) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(""); while (rooms.has(code));
  return code;
}

export function registerUnoFlex(io: Server) {
  const nsp: Namespace = io.of("/flex");
  const rooms = new Map<string, Room>();
  const sessions = new Map<string, { room: Room; token: string }>();

  function player(room: Room, token: string) {
    const p = room.players.find((x) => x.token === token);
    if (!p) throw Error("Player not found");
    return p;
  }

  function publish(room: Room) {
    assertIntegrity(room);
    room.updatedAt = Date.now();
    for (const p of room.players) if (!p.isBot && p.connected) nsp.to(p.socketId).emit("f_state", sync(room, p.token));
  }

  function start(room: Room) {
    const active = room.players.filter((p) => p.connected || p.isBot);
    if (active.length < 2) throw Error("কমপক্ষে ২ জন লাগবে।");
    room.deck = makeDeck(); room.discard = []; room.current = 0; room.direction = 1; room.winner = null; room.pendingDraw4 = null; room.drawnBy = null;
    for (const p of room.players) { p.hand = []; p.powerOn = true; p.unoCalled = false; for (let i = 0; i < 7; i++) draw(room, p, 1); }
    let starter = drawOne(room);
    while (starter.kind !== "NUMBER") { room.deck.unshift(starter); shuffle(room.deck); starter = drawOne(room); }
    room.discard.push(starter); room.activeColor = starter.color ?? "RED"; room.status = "PLAYING"; room.lastAction = "গেম শুরু — Power Cards ON ✅";
    captureIdentity(room);
    publish(room);
    scheduleBot(room);
  }

  function maybeStart(room: Room) {
    if (room.mode === "BOT") return;
    const active = room.players.filter((p) => p.connected);
    if (active.length >= 2 && active.every((p) => p.ready)) start(room);
  }

  function advance(room: Room, steps = 1) {
    room.drawnBy = null;
    room.current = nextIndex(room, steps);
  }

  function finishIfWinner(room: Room, p: Player) {
    if (p.hand.length === 0) { room.status = "FINISHED"; room.winner = p.token; room.drawnBy = null; room.lastAction = `${p.name} জিতে গেছে 🏆`; return true; }
    return false;
  }

  function applyCard(room: Room, p: Player, c: Card, side: "REGULAR" | "FLEX", chosenColor?: Color, targetToken?: string) {
    const flex = side === "FLEX";
    if (flex) p.powerOn = false;
    if (!flex && c.color) room.activeColor = c.color;
    if (c.color === null && chosenColor) room.activeColor = chosenColor;
    room.lastAction = `${p.name} ${flex ? "FLEX" : "REGULAR"} ${c.kind} খেলেছে`;
    if (c.flipPower) p.powerOn = !p.powerOn;

    switch (c.kind) {
      case "SKIP": advance(room, 2); break;
      case "REVERSE": room.direction = room.direction === 1 ? -1 : 1; advance(room, 1); break;
      case "DRAW2": { const victim = room.players[nextIndex(room)]; draw(room, victim, 2); advance(room, 2); break; }
      case "FLEX_SKIP": flex ? advance(room, room.players.length) : advance(room, 2); break;
      case "FLEX_REVERSE": room.direction = room.direction === 1 ? -1 : 1; advance(room, flex ? 2 : 1); break;
      case "FLEX_DRAW2":
        if (flex) { for (const other of room.players) if (other.token !== p.token && (other.connected || other.isBot)) draw(room, other, 1); advance(room, 1); }
        else { const victim = room.players[nextIndex(room)]; draw(room, victim, 2); advance(room, 2); }
        break;
      case "WILD_ALL_FLIP":
        for (const other of room.players) if (other.connected || other.isBot) other.powerOn = !other.powerOn;
        advance(room, 1);
        break;
      case "WILD_FLEX_ALL_DRAW":
        if (flex) for (const other of room.players) if (other.token !== p.token && (other.connected || other.isBot)) draw(room, other, 2);
        advance(room, 1);
        break;
      case "WILD_FLEX_TARGET_DRAW2":
        if (flex) { const target = room.players.find((x) => x.token === targetToken); if (!target || target.token === p.token) throw Error("একজন প্রতিপক্ষ বেছে নাও।"); draw(room, target, 2); }
        advance(room, 1);
        break;
      case "WILD_FLEX_DRAW4":
        if (flex) {
          const target = room.players.find((x) => x.token === targetToken); if (!target || target.token === p.token) throw Error("একজন প্রতিপক্ষ বেছে নাও।");
          draw(room, target, 4); advance(room, 1);
        } else {
          const victimIdx = nextIndex(room); const victim = room.players[victimIdx];
          room.pendingDraw4 = { offender: p.token, victim: victim.token, chosenColor: room.activeColor, offenderHadMatchingColor: false };
          room.current = victimIdx;
          room.drawnBy = null;
          room.lastAction = `${victim.name}: +4 নেবে নাকি Challenge করবে?`;
        }
        break;
      default: advance(room, 1); break;
    }
    resetPowerIfAllOff(room);
  }

  function resolveDraw4(room: Room, victim: Player, challenge: boolean) {
    const pending = room.pendingDraw4;
    if (!pending || pending.victim !== victim.token) throw Error("Challenge করার মতো +4 নেই।");
    const offender = player(room, pending.offender);
    if (challenge) {
      if (pending.offenderHadMatchingColor) { draw(room, offender, 4); room.lastAction = `Challenge সফল — ${offender.name} ৪ কার্ড তুলেছে`; }
      else { draw(room, victim, 6); room.lastAction = `Challenge ব্যর্থ — ${victim.name} ৬ কার্ড তুলেছে`; }
    } else { draw(room, victim, 4); room.lastAction = `${victim.name} +4 গ্রহণ করেছে`; }
    room.pendingDraw4 = null;
    advance(room, 1);
  }

  function play(room: Room, token: string, cardId: string, side: "REGULAR" | "FLEX", chosenColor?: Color, targetToken?: string) {
    if (room.status !== "PLAYING") throw Error("গেম চলছে না।");
    if (room.pendingDraw4) throw Error("আগে +4 Challenge resolve করো।");
    const p = player(room, token);
    if (room.players[room.current]?.token !== token) throw Error("তোমার টার্ন না।");
    const idx = p.hand.findIndex((x) => x.id === cardId); if (idx < 0) throw Error("কার্ড পাওয়া যায়নি।");
    const c = p.hand[idx];
    if (!legalSides(c, room, p).includes(side)) throw Error(side === "FLEX" ? "Power ON না থাকলে বা flex color না মিললে এই side খেলা যাবে না।" : "কার্ডটি color, number বা symbol দিয়ে match করছে না।");
    const oldActive = room.activeColor;
    if (c.color === null && !chosenColor) throw Error("একটি color বেছে নাও।");
    const hadMatchingColor = p.hand.some((x) => x.id !== c.id && (x.color === oldActive || x.color === null));
    p.hand.splice(idx, 1);
    room.discard.push(c);
    applyCard(room, p, c, side, chosenColor, targetToken);
    if (c.kind === "WILD_FLEX_DRAW4" && side === "REGULAR") {
      const pending: PendingDraw4 | null = room.pendingDraw4;
      if (pending) pending.offenderHadMatchingColor = hadMatchingColor;
    }
    if (p.hand.length !== 1) p.unoCalled = false;
    if (!finishIfWinner(room, p)) scheduleBot(room);
    publish(room);
  }

  function botTurn(room: Room, bot: Player) {
    if (room.status !== "PLAYING" || room.players[room.current]?.token !== bot.token) return;
    if (room.pendingDraw4?.victim === bot.token) { resolveDraw4(room, bot, false); publish(room); return scheduleBot(room); }
    const legal: Array<{ c: Card; side: "REGULAR" | "FLEX" }> = [];
    for (const c of bot.hand) for (const side of legalSides(c, room, bot)) legal.push({ c, side });
    if (!legal.length) {
      const drawn = drawOne(room); bot.hand.push(drawn); room.lastAction = `${bot.name} একটি কার্ড তুলেছে`;
      const sides = legalSides(drawn, room, bot);
      if (!sides.length) { advance(room); publish(room); return scheduleBot(room); }
      const side = sides.includes("REGULAR") ? "REGULAR" : "FLEX";
      const chosen = drawn.color === null ? chooseBotColor(bot) : undefined;
      const candidates = room.players.filter((x) => x.token !== bot.token && (x.connected || x.isBot));
      const target = candidates.length ? candidates[randomInt(candidates.length)].token : undefined;
      return play(room, bot.token, drawn.id, side, chosen, target);
    }
    const pick = legal[randomInt(legal.length)];
    const chosen = pick.c.color === null ? chooseBotColor(bot) : undefined;
    const candidates = room.players.filter((x) => x.token !== bot.token && (x.connected || x.isBot));
    const target = candidates.length ? candidates[randomInt(candidates.length)].token : undefined;
    play(room, bot.token, pick.c.id, pick.side, chosen, target);
  }

  function scheduleBot(room: Room) {
    if (room.status !== "PLAYING") return;
    const current = room.players[room.current];
    if (!current?.isBot) return;
    setTimeout(() => botTurn(room, current), 550 + randomInt(500));
  }

  const makeRoom = (mode: "BOT" | "MULTI"): Room => ({
    code: makeCode(rooms), players: [], deck: [], discard: [], activeColor: "RED", current: 0, direction: 1,
    status: "LOBBY", winner: null, mode, updatedAt: Date.now(), pendingDraw4: null,
    lastAction: mode === "BOT" ? "Bot match তৈরি হয়েছে" : "Flex room তৈরি হয়েছে", drawnBy: null, identity: new Map(),
  });

  nsp.on("connection", (socket: Socket) => {
    function bind<T>(event: string, schema: z.ZodType<T>, fn: (data: T) => void) {
      socket.on(event, (raw: unknown) => {
        try { const parsed = schema.safeParse(raw ?? {}); if (!parsed.success) throw Error("রিকোয়েস্ট ঠিক হয়নি।"); fn(parsed.data); }
        catch (e) { socket.emit("f_error", { message: e instanceof Error ? e.message : "UNO Flex error" }); }
      });
    }
    function free() { if (sessions.has(socket.id)) throw Error("আগে বর্তমান Flex room ছাড়ো।"); }
    function session() { const s = sessions.get(socket.id); if (!s) throw Error("আগে Flex room-এ ঢুকো।"); return s; }
    function attach(room: Room, displayName: string, avatar: string) {
      if (room.status !== "LOBBY") throw Error("এই গেম শুরু হয়ে গেছে।");
      if (room.players.filter((p) => p.connected || p.isBot).length >= 8) throw Error("Room full");
      const token = randomUUID(); const p: Player = { token, socketId: socket.id, name: displayName, avatar, hand: [], ready: false, connected: true, isBot: false, powerOn: true, unoCalled: false };
      room.players.push(p); sessions.set(socket.id, { room, token }); socket.emit("f_room", { roomCode: room.code, sessionToken: token }); publish(room); return p;
    }

    bind("f_create_multi", z.object({ displayName: nameSchema, avatar: avatarSchema }).strict(), ({ displayName, avatar }) => {
      free(); const room = makeRoom("MULTI"); rooms.set(room.code, room); attach(room, displayName, avatar);
    });
    bind("f_create_bot", z.object({ displayName: nameSchema, avatar: avatarSchema }).strict(), ({ displayName, avatar }) => {
      free(); const room = makeRoom("BOT"); rooms.set(room.code, room); attach(room, displayName, avatar);
      const bots = [["Flex Bot A","🤖"],["Flex Bot B","😈"],["Flex Bot C","🧠"]] as const;
      for (const [botName, botAvatar] of bots) room.players.push({ token: randomUUID(), socketId: "", name: botName, avatar: botAvatar, hand: [], ready: true, connected: true, isBot: true, powerOn: true, unoCalled: false });
      start(room);
    });
    bind("f_join", z.object({ roomCode: codeSchema, displayName: nameSchema, avatar: avatarSchema }).strict(), ({ roomCode, displayName, avatar }) => {
      free(); const room = rooms.get(roomCode); if (!room) throw Error("Flex room পাওয়া যায়নি।"); attach(room, displayName, avatar);
    });
    bind("f_reconnect", z.object({ roomCode: codeSchema, sessionToken: uuidSchema }).strict(), ({ roomCode, sessionToken }) => {
      free(); const room = rooms.get(roomCode); if (!room) return socket.emit("f_left", {});
      const p = room.players.find((x) => x.token === sessionToken && !x.isBot); if (!p) return socket.emit("f_left", {});
      sessions.delete(p.socketId); p.socketId = socket.id; p.connected = true; sessions.set(socket.id, { room, token: sessionToken }); publish(room); scheduleBot(room);
    });
    bind("f_ready", z.object({ ready: z.boolean() }).strict(), ({ ready }) => { const { room, token } = session(); player(room, token).ready = ready; maybeStart(room); publish(room); });
    bind("f_play", z.object({ cardId: uuidSchema, side: z.enum(["REGULAR","FLEX"]), chosenColor: colorSchema.optional(), targetToken: uuidSchema.optional() }).strict(), (d) => { const { room, token } = session(); play(room, token, d.cardId, d.side, d.chosenColor, d.targetToken); });
    bind("f_draw", empty, () => {
      const { room, token } = session(); if (room.pendingDraw4) throw Error("আগে +4 resolve করো।");
      const p = player(room, token); if (room.players[room.current]?.token !== token) throw Error("তোমার টার্ন না।");
      if (room.drawnBy === token) throw Error("এই টার্নে ইতিমধ্যে একটি কার্ড তুলেছো। এখন খেলো বা PASS দাও।");
      p.hand.push(drawOne(room)); room.drawnBy = token; room.lastAction = `${p.name} একটি কার্ড তুলেছে — এখন খেলতে বা PASS দিতে পারে`; publish(room);
    });
    bind("f_pass", empty, () => {
      const { room, token } = session(); if (room.pendingDraw4) throw Error("আগে +4 resolve করো।");
      const p = player(room, token); if (room.players[room.current]?.token !== token) throw Error("তোমার টার্ন না।");
      room.lastAction = `${p.name} PASS দিয়েছে`; advance(room); publish(room); scheduleBot(room);
    });
    bind("f_uno", empty, () => { const { room, token } = session(); const p = player(room, token); if (p.hand.length !== 1) throw Error("UNO বলার সময় এখনো হয়নি।"); p.unoCalled = true; room.lastAction = `${p.name}: UNO! 🚨`; publish(room); });
    bind("f_catch", empty, () => { const { room, token } = session(); const catcher = player(room, token); const target = room.players.find((p) => p.token !== token && p.hand.length === 1 && !p.unoCalled); if (!target) throw Error("কাউকে catch করা যাচ্ছে না।"); draw(room, target, 2); target.unoCalled = false; room.lastAction = `${catcher.name} ${target.name}-কে UNO catch করেছে — +2`; publish(room); });
    bind("f_draw4", z.object({ challenge: z.boolean() }).strict(), ({ challenge }) => { const { room, token } = session(); const p = player(room, token); resolveDraw4(room, p, challenge); publish(room); scheduleBot(room); });
    bind("f_leave", empty, () => { const { room, token } = session(); const p = player(room, token); p.connected = false; sessions.delete(socket.id); socket.emit("f_left", {}); if (room.status === "PLAYING") { const alive = room.players.filter((x) => x.connected || x.isBot); if (alive.length === 1) { room.status = "FINISHED"; room.winner = alive[0].token; } } publish(room); });
    socket.on("disconnect", () => { const s = sessions.get(socket.id); sessions.delete(socket.id); if (!s) return; const p = player(s.room, s.token); p.connected = false; publish(s.room); });
  });

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) if (now - room.updatedAt > 30 * 60_000 || room.players.every((p) => !p.connected && !p.isBot)) rooms.delete(code);
  }, 60_000);
  cleanup.unref();
}
