import { randomInt } from "node:crypto";
import type { Server, Socket } from "socket.io";
import type { GameRoom } from "./GameRoom.js";

type PowerKind = "MAGNET" | "SHIELD" | "TIME_FREEZE" | "ROBBERY";
type PowerBag = Record<PowerKind, number>;
type Meta = {
  enabledPowers: PowerKind[];
  wild: boolean;
  drawFour: boolean;
  devil: boolean;
  powers: Map<string, PowerBag>;
  shielded: Set<string>;
  freezeArmedBy: string | null;
  pendingRobbery: { thief: string; target: string } | null;
  lastStatus: string;
};

const POWER_KINDS: PowerKind[] = ["MAGNET", "SHIELD", "TIME_FREEZE", "ROBBERY"];
const emptyBag = (): PowerBag => ({ MAGNET: 0, SHIELD: 0, TIME_FREEZE: 0, ROBBERY: 0 });

export function registerClassicPowers(io: Server, rooms: Map<string, GameRoom>) {
  const metas = new WeakMap<GameRoom, Meta>();

  const metaFor = (room: GameRoom) => {
    let meta = metas.get(room);
    if (!meta) {
      meta = {
        enabledPowers: [...POWER_KINDS], wild: true, drawFour: true, devil: true,
        powers: new Map(), shielded: new Set(), freezeArmedBy: null, pendingRobbery: null,
        lastStatus: room.state.status,
      };
      metas.set(room, meta);
    }
    return meta;
  };

  const sessionFor = (socket: Socket) => {
    for (const room of rooms.values()) {
      const token = room.tokens.find((t) => room.player(t).socketId === socket.id);
      if (token) return { room, token };
    }
    throw Error("আগে Classic room-এ ঢুকো।");
  };

  const ensureStartedPowers = (room: GameRoom) => {
    const meta = metaFor(room);
    if (room.state.status === "PLAYING" && meta.lastStatus !== "PLAYING") {
      meta.powers.clear();
      meta.shielded.clear();
      meta.pendingRobbery = null;
      meta.freezeArmedBy = null;
      for (const token of room.tokens) {
        const bag = emptyBag();
        for (const kind of meta.enabledPowers) bag[kind] = 1;
        meta.powers.set(token, bag);
      }
    }
    meta.lastStatus = room.state.status;
    return meta;
  };

  const publicMeta = (room: GameRoom, token: string) => {
    const meta = ensureStartedPowers(room);
    const pending = meta.pendingRobbery;
    const me = meta.powers.get(token) ?? emptyBag();
    const targetBag = pending?.target === token ? me : emptyBag();
    return {
      enabledPowers: meta.enabledPowers,
      specialCards: { wild: meta.wild, drawFour: meta.drawFour, devil: meta.devil },
      isHost: room.tokens[0] === token,
      myPowers: { ...me },
      shieldActive: meta.shielded.has(token),
      pendingRobbery: pending ? {
        thief: pending.thief,
        target: pending.target,
        mustChoose: pending.target === token,
        choices: POWER_KINDS.filter((k) => targetBag[k] > 0),
      } : null,
      players: room.tokens.map((t) => ({
        token: t,
        name: room.player(t).displayName,
        avatar: room.player(t).avatar,
        isBot: !!room.player(t).isBot,
        powerCount: Object.values(meta.powers.get(t) ?? emptyBag()).reduce((a, b) => a + b, 0),
        shieldActive: meta.shielded.has(t),
      })),
    };
  };

  const publish = (room: GameRoom) => {
    ensureStartedPowers(room);
    for (const token of room.tokens) {
      const p = room.player(token);
      if (p.connected && !p.isBot) io.to(p.socketId).emit("s_classic_meta", publicMeta(room, token));
    }
  };

  const targetFor = (room: GameRoom, actor: string, targetToken?: string) => {
    if (!targetToken || targetToken === actor || !room.tokens.includes(targetToken)) throw Error("একজন opponent বেছে নাও।");
    return targetToken;
  };

  const consumeShield = (room: GameRoom, meta: Meta, target: string, label: string) => {
    if (!meta.shielded.has(target)) return false;
    meta.shielded.delete(target);
    const targetPlayer = room.player(target);
    io.to(targetPlayer.socketId).emit("s_power_notice", { message: `🛡️ SHIELD ${label} block করেছে!` });
    return true;
  };

  const usePower = (room: GameRoom, actor: string, power: PowerKind, targetToken?: string) => {
    const meta = ensureStartedPowers(room);
    if (room.state.status !== "PLAYING" || room.current !== actor) throw Error("Power Card নিজের turn-এ ব্যবহার করো।");
    if (!meta.enabledPowers.includes(power)) throw Error("এই Power Card room-এ enabled না।");
    if (meta.pendingRobbery) throw Error("আগের ROBBERY আগে শেষ করো।");
    const bag = meta.powers.get(actor) ?? emptyBag();
    if (bag[power] <= 0) throw Error("এই Power Card আর তোমার কাছে নেই।");

    if (power === "SHIELD") {
      bag.SHIELD--;
      meta.shielded.add(actor);
      meta.powers.set(actor, bag);
      return;
    }
    if (power === "TIME_FREEZE") {
      bag.TIME_FREEZE--;
      meta.freezeArmedBy = actor;
      meta.powers.set(actor, bag);
      return;
    }

    const target = targetFor(room, actor, targetToken);
    if (power === "MAGNET") {
      if (room.player(target).hand.length <= 1) throw Error("Opponent-এর শেষ card MAGNET দিয়ে নেওয়া যাবে না।");
      bag.MAGNET--;
      meta.powers.set(actor, bag);
      if (consumeShield(room, meta, target, "MAGNET")) return;
      const hand = room.player(target).hand;
      const [stolen] = hand.splice(randomInt(hand.length), 1);
      room.player(actor).hand.push(stolen);
      room.touch();
      return;
    }

    const targetBag = meta.powers.get(target) ?? emptyBag();
    const choices = POWER_KINDS.filter((k) => targetBag[k] > 0);
    if (!choices.length) throw Error("এই opponent-এর কাছে Power Card নেই।");
    bag.ROBBERY--;
    meta.powers.set(actor, bag);
    if (consumeShield(room, meta, target, "ROBBERY")) return;
    if (room.player(target).isBot) {
      const picked = choices[randomInt(choices.length)];
      targetBag[picked]--;
      bag[picked]++;
      meta.powers.set(target, targetBag);
      meta.powers.set(actor, bag);
    } else {
      meta.pendingRobbery = { thief: actor, target };
    }
  };

  const chooseRobbery = (room: GameRoom, token: string, power: PowerKind) => {
    const meta = metaFor(room);
    const pending = meta.pendingRobbery;
    if (!pending || pending.target !== token) throw Error("তোমাকে এখন Power Card দিতে বলা হয়নি।");
    const targetBag = meta.powers.get(token) ?? emptyBag();
    if (targetBag[power] <= 0) throw Error("এই Power Card তোমার কাছে নেই।");
    const thiefBag = meta.powers.get(pending.thief) ?? emptyBag();
    targetBag[power]--;
    thiefBag[power]++;
    meta.powers.set(token, targetBag);
    meta.powers.set(pending.thief, thiefBag);
    meta.pendingRobbery = null;
  };

  io.on("connection", (socket) => {
    const safe = (fn: () => void) => { try { fn(); } catch (e) { socket.emit("s_error", { message: e instanceof Error ? e.message : "Classic Power error" }); } };

    socket.on("c_classic_config", (raw: any) => safe(() => {
      const { room, token } = sessionFor(socket);
      if (room.state.status !== "LOBBY") throw Error("Game শুরু হওয়ার পর rules বদলানো যাবে না।");
      if (room.tokens[0] !== token) throw Error("শুধু room host rules select করতে পারবে।");
      const powers = Array.isArray(raw?.powers) ? POWER_KINDS.filter((p) => raw.powers.includes(p)) : [...POWER_KINDS];
      const wild = raw?.wild !== false, drawFour = raw?.drawFour !== false, devil = raw?.devil !== false;
      room.configureSpecialCards({ wild, drawFour, devil });
      const meta = metaFor(room);
      meta.enabledPowers = powers; meta.wild = wild; meta.drawFour = drawFour; meta.devil = devil;
      publish(room);
    }));

    socket.on("c_power_use", (raw: any) => safe(() => {
      const { room, token } = sessionFor(socket);
      const power = String(raw?.power || "") as PowerKind;
      if (!POWER_KINDS.includes(power)) throw Error("Unknown Power Card");
      usePower(room, token, power, typeof raw?.targetToken === "string" ? raw.targetToken : undefined);
      publish(room);
    }));

    socket.on("c_robbery_choose", (raw: any) => safe(() => {
      const { room, token } = sessionFor(socket);
      const power = String(raw?.power || "") as PowerKind;
      if (!POWER_KINDS.includes(power)) throw Error("Unknown Power Card");
      chooseRobbery(room, token, power);
      publish(room);
    }));

    for (const event of ["c_create_room","c_create_bot_room","c_join_room","c_reconnect","c_toggle_ready","c_play_card","c_play_drawn","c_draw_card","c_pass_turn","c_request_rematch"]) {
      socket.on(event, () => setTimeout(() => { try { publish(sessionFor(socket).room); } catch {} }, 0));
    }
  });

  const ticker = setInterval(() => {
    for (const room of rooms.values()) {
      const meta = ensureStartedPowers(room);
      if (meta.freezeArmedBy && room.state.status === "PLAYING" && room.current !== meta.freezeArmedBy) {
        const target = room.current;
        meta.freezeArmedBy = null;
        if (!consumeShield(room, meta, target, "TIME FREEZE")) {
          room.remainingTurn = 3000;
          room.turnDeadline = Date.now() + 3000;
          room.touch();
        }
        publish(room);
      }
    }
  }, 100);
  ticker.unref();
}
