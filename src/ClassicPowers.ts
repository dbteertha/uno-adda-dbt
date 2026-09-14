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
  lastAction: string;
  passGuardInstalled: boolean;
};

const POWER_KINDS: PowerKind[] = ["MAGNET", "SHIELD", "TIME_FREEZE", "ROBBERY"];
const emptyBag = (): PowerBag => ({ MAGNET: 0, SHIELD: 0, TIME_FREEZE: 0, ROBBERY: 0 });

export function registerClassicPowers(io: Server, rooms: Map<string, GameRoom>) {
  const metas = new WeakMap<GameRoom, Meta>();
  const botPowerTurn = new WeakMap<GameRoom, string>();

  const installPassGuard = (room: GameRoom, meta: Meta) => {
    if (meta.passGuardInstalled) return;
    const originalPass = room.pass.bind(room);
    room.pass = ((token: string) => {
      const player = room.player(token);
      const hasApplicable = room.state.drawnCardPlayable
        ? room.legal(token, room.state.drawnCardPlayable)
        : player.hand.some((card) => room.legal(token, card));
      if (!hasApplicable) {
        throw Error("PASS শুধু তখনই করা যাবে যখন তোমার কাছে current color / number / action-এর applicable card আছে।");
      }
      originalPass(token);
    }) as GameRoom["pass"];
    meta.passGuardInstalled = true;
  };

  const metaFor = (room: GameRoom) => {
    let meta = metas.get(room);
    if (!meta) {
      meta = {
        enabledPowers: [...POWER_KINDS], wild: true, drawFour: true, devil: true,
        powers: new Map(), shielded: new Set(), freezeArmedBy: null, pendingRobbery: null,
        lastStatus: room.state.status, lastAction: "DBT Power Cards ready", passGuardInstalled: false,
      };
      metas.set(room, meta);
    }
    installPassGuard(room, meta);
    return meta;
  };

  const sessionFor = (socket: Socket) => {
    for (const room of rooms.values()) {
      const token = room.tokens.find((t) => room.player(t).socketId === socket.id);
      if (token) { metaFor(room); return { room, token }; }
    }
    throw Error("আগে Classic room-এ ঢুকো।");
  };

  const ensureStartedPowers = (room: GameRoom) => {
    const meta = metaFor(room);
    if (room.state.status === "PLAYING" && (meta.lastStatus !== "PLAYING" || meta.powers.size === 0)) {
      meta.powers.clear();
      meta.shielded.clear();
      meta.pendingRobbery = null;
      meta.freezeArmedBy = null;
      meta.lastAction = "Match started · selected DBT Power Cards dealt";
      for (const token of room.tokens) {
        const bag = emptyBag();
        for (const kind of meta.enabledPowers) bag[kind] = 1;
        meta.powers.set(token, bag);
      }
    }
    if (room.state.status !== "PLAYING" && meta.lastStatus === "PLAYING") {
      meta.pendingRobbery = null;
      meta.freezeArmedBy = null;
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
      meToken: token,
      currentToken: room.current,
      isMyTurn: room.state.status === "PLAYING" && room.current === token,
      myPowers: { ...me },
      shieldActive: meta.shielded.has(token),
      freezeArmed: meta.freezeArmedBy !== null,
      lastPowerAction: meta.lastAction,
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
        connected: room.player(t).connected,
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

  const tellRoom = (room: GameRoom, message: string) => {
    for (const token of room.tokens) {
      const p = room.player(token);
      if (p.connected && !p.isBot) io.to(p.socketId).emit("s_power_notice", { message });
    }
  };

  const targetFor = (room: GameRoom, actor: string, targetToken?: string) => {
    if (!targetToken || targetToken === actor || !room.tokens.includes(targetToken)) throw Error("একজন opponent বেছে নাও।");
    const p = room.player(targetToken);
    if (!p.connected && !p.isBot) throw Error("এই opponent এখন disconnected।");
    return targetToken;
  };

  const consumeShield = (room: GameRoom, meta: Meta, target: string, label: string) => {
    if (!meta.shielded.has(target)) return false;
    meta.shielded.delete(target);
    const name = room.player(target).displayName;
    meta.lastAction = `🛡️ ${name}'s SHIELD blocked ${label}`;
    tellRoom(room, meta.lastAction);
    room.touch();
    return true;
  };

  const usePower = (room: GameRoom, actor: string, power: PowerKind, targetToken?: string) => {
    const meta = ensureStartedPowers(room);
    if (room.state.status !== "PLAYING" || room.current !== actor) throw Error("Power Card নিজের turn-এ ব্যবহার করো।");
    if (!meta.enabledPowers.includes(power)) throw Error("এই Power Card room-এ enabled না।");
    if (meta.pendingRobbery) throw Error("আগের ROBBERY আগে শেষ করো।");
    const actorPlayer = room.player(actor);
    const bag = meta.powers.get(actor) ?? emptyBag();
    if (bag[power] <= 0) throw Error("এই Power Card আর তোমার কাছে নেই।");

    if (power === "SHIELD") {
      if (meta.shielded.has(actor)) throw Error("তোমার SHIELD already active।");
      bag.SHIELD--;
      meta.shielded.add(actor);
      meta.powers.set(actor, bag);
      meta.lastAction = `🛡️ ${actorPlayer.displayName} activated SHIELD`;
      room.touch(); tellRoom(room, meta.lastAction); return;
    }

    if (power === "TIME_FREEZE") {
      if (meta.freezeArmedBy) throw Error("একটা TIME FREEZE already armed আছে।");
      bag.TIME_FREEZE--;
      meta.freezeArmedBy = actor;
      meta.powers.set(actor, bag);
      meta.lastAction = `⏱️ ${actorPlayer.displayName} armed TIME FREEZE · next turn gets 3 seconds`;
      room.touch(); tellRoom(room, meta.lastAction); return;
    }

    const target = targetFor(room, actor, targetToken);
    const targetPlayer = room.player(target);

    if (power === "MAGNET") {
      if (targetPlayer.hand.length <= 1) throw Error("Opponent-এর শেষ card MAGNET দিয়ে নেওয়া যাবে না।");
      bag.MAGNET--;
      meta.powers.set(actor, bag);
      if (consumeShield(room, meta, target, "MAGNET")) return;
      const [stolen] = targetPlayer.hand.splice(randomInt(targetPlayer.hand.length), 1);
      actorPlayer.hand.push(stolen);
      actorPlayer.isUnoSafe = false;
      if (targetPlayer.hand.length === 1) targetPlayer.isUnoSafe = true;
      meta.lastAction = `🧲 ${actorPlayer.displayName} pulled 1 random card from ${targetPlayer.displayName}`;
      room.touch(); tellRoom(room, meta.lastAction); return;
    }

    const targetBag = meta.powers.get(target) ?? emptyBag();
    const choices = POWER_KINDS.filter((k) => targetBag[k] > 0);
    if (!choices.length) throw Error("এই opponent-এর কাছে Power Card নেই।");
    bag.ROBBERY--;
    meta.powers.set(actor, bag);
    if (consumeShield(room, meta, target, "ROBBERY")) return;

    if (targetPlayer.isBot) {
      const picked = choices[randomInt(choices.length)];
      targetBag[picked]--;
      bag[picked]++;
      meta.powers.set(target, targetBag);
      meta.powers.set(actor, bag);
      meta.lastAction = `🥷 ${actorPlayer.displayName} robbed ${picked} from ${targetPlayer.displayName}`;
      room.touch(); tellRoom(room, meta.lastAction);
    } else {
      meta.pendingRobbery = { thief: actor, target };
      meta.lastAction = `🥷 ${targetPlayer.displayName} must choose a Power Card to give ${actorPlayer.displayName}`;
      room.touch(); tellRoom(room, meta.lastAction);
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
    const thief = room.player(pending.thief).displayName;
    const victim = room.player(token).displayName;
    meta.pendingRobbery = null;
    meta.lastAction = `🥷 ${victim} gave ${power} to ${thief}`;
    room.touch(); tellRoom(room, meta.lastAction);
  };

  const maybeBotPower = (room: GameRoom) => {
    const meta = ensureStartedPowers(room);
    if (room.state.status !== "PLAYING" || meta.pendingRobbery) return;
    const token = room.current;
    const p = room.player(token);
    if (!p.isBot) return;
    const turnKey = `${room.round}:${token}:${room.turnDeadline ?? 0}`;
    if (botPowerTurn.get(room) === turnKey) return;
    botPowerTurn.set(room, turnKey);
    const bag = meta.powers.get(token) ?? emptyBag();
    if (randomInt(100) >= 38) return;

    const opponents = room.tokens.filter((t) => t !== token && (room.player(t).connected || room.player(t).isBot));
    const robberyTargets = opponents.filter((t) => Object.values(meta.powers.get(t) ?? emptyBag()).some((n) => n > 0));
    const magnetTargets = opponents.filter((t) => room.player(t).hand.length > 1);
    const candidates: Array<{ power: PowerKind; target?: string }> = [];
    if (bag.SHIELD > 0 && !meta.shielded.has(token)) candidates.push({ power: "SHIELD" });
    if (bag.TIME_FREEZE > 0 && !meta.freezeArmedBy) candidates.push({ power: "TIME_FREEZE" });
    if (bag.ROBBERY > 0 && robberyTargets.length) candidates.push({ power: "ROBBERY", target: robberyTargets[randomInt(robberyTargets.length)] });
    if (bag.MAGNET > 0 && magnetTargets.length) candidates.push({ power: "MAGNET", target: magnetTargets[randomInt(magnetTargets.length)] });
    if (!candidates.length) return;
    const pick = candidates[randomInt(candidates.length)];
    usePower(room, token, pick.power, pick.target);
    publish(room);
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
      meta.lastAction = `Room rules updated · ${powers.length} DBT powers enabled`;
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
          meta.lastAction = `⏱️ ${room.player(target).displayName} has 3 seconds`;
          room.touch(); tellRoom(room, meta.lastAction);
        }
        publish(room);
      }
      try { maybeBotPower(room); } catch (error) { console.error("[Classic bot power]", error); }
    }
  }, 100);
  ticker.unref();
}
