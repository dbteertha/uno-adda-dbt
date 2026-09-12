import { randomUUID } from "node:crypto";
import { createDeck, shuffle, points, COLORS, DECK_SIZE } from "./Deck.js";
import type { UnoRoomState, PlayerSession, UnoCard, PlayColor, ClientSyncPayload, MatchHistoryItem, GameEvent } from "./types.js";

export class GameRoom {
  state: UnoRoomState;
  scores: Record<string, number> = {};
  wins: Record<string, number> = {};
  rematch = new Set<string>();
  disconnected = new Map<string, number>();
  turnDeadline: number | null = null;
  remainingTurn = 30_000;
  needsStartingColor = false;
  vulnerabilities = new Map<string, number>();
  revision = 0;
  round = 0;
  updatedAt: number;
  resultReason: string | null = null;
  history: MatchHistoryItem[] = [];
  lastEvent: GameEvent | null = null;

  // A card id must map to exactly one color/value for the entire lifetime of a room.
  // This catches any accidental card mutation immediately instead of letting the UI drift.
  private cardIdentity = new Map<string, string>();
  private roundCardIds = new Set<string>();

  constructor(code: string, private now: () => number = Date.now) {
    this.updatedAt = now();
    this.state = {
      roomCode: code, players: {}, playerOrder: [], currentTurnIndex: 0, direction: 1,
      activeColor: "RED", drawPile: [], discardPile: [], vulnerablePlayerToken: null,
      vulnerabilityExpiry: null, drawnCardPlayable: null, status: "LOBBY", winnerToken: null,
    };
  }

  get tokens() { return this.state.playerOrder.filter(Boolean); }
  get current() { return this.state.playerOrder[this.state.currentTurnIndex]; }
  get paused() { return this.state.status === "PLAYING" && this.tokens.some((t) => !this.state.players[t].isBot && !this.state.players[t].connected); }
  touch() { this.revision++; this.updatedAt = this.now(); }

  private event(type: string, actor: string, target?: string, value?: string) {
    this.lastEvent = { id: randomUUID(), type, actor: this.player(actor).displayName, target: target ? this.player(target).displayName : undefined, value, at: this.now() };
  }

  private signature(c: UnoCard) { return `${c.color}:${c.value}`; }
  private rememberCard(c: UnoCard) {
    const sig = this.signature(c);
    const old = this.cardIdentity.get(c.id);
    if (old && old !== sig) throw Error(`CARD_INTEGRITY: ${c.id} changed from ${old} to ${sig}`);
    if (!old) this.cardIdentity.set(c.id, sig);
  }

  private allZoneCards() {
    return [
      ...this.state.drawPile,
      ...this.state.discardPile,
      ...this.tokens.flatMap((t) => this.player(t).hand),
    ];
  }

  assertIntegrity(context = "state") {
    const seen = new Set<string>();
    let allKnownRoundCards = this.roundCardIds.size === DECK_SIZE;
    for (const c of this.allZoneCards()) {
      this.rememberCard(c);
      if (seen.has(c.id)) throw Error(`CARD_INTEGRITY: duplicate card ${c.id} during ${context}`);
      seen.add(c.id);
      if (this.roundCardIds.size === DECK_SIZE && !this.roundCardIds.has(c.id)) allKnownRoundCards = false;
    }
    if (this.state.drawnCardPlayable) {
      this.rememberCard(this.state.drawnCardPlayable);
      const owner = this.current ? this.player(this.current) : null;
      if (!owner?.hand.some((c) => c.id === this.state.drawnCardPlayable!.id)) {
        throw Error(`CARD_INTEGRITY: pending drawn card is not in current hand during ${context}`);
      }
    }
    if (allKnownRoundCards && seen.size !== DECK_SIZE) {
      throw Error(`CARD_INTEGRITY: expected ${DECK_SIZE} cards, found ${seen.size} during ${context}`);
    }
    if (this.tokens.length && (this.state.currentTurnIndex < 0 || this.state.currentTurnIndex >= this.tokens.length)) {
      throw Error(`CARD_INTEGRITY: invalid current turn index during ${context}`);
    }
    return true;
  }

  private counts() { return Object.fromEntries(this.tokens.map((t) => [t, this.player(t).hand.length])); }
  private assertPlayCountDelta(before: Record<string, number>, actor: string, target: string | undefined, penalty: number, context: string) {
    for (const t of this.tokens) {
      let expected = before[t];
      if (t === actor) expected -= 1;
      if (target && t === target) expected += penalty;
      const actual = this.player(t).hand.length;
      if (actual !== expected) throw Error(`CARD_COUNT_INTEGRITY: ${t} expected ${expected}, got ${actual} during ${context}`);
    }
  }

  add(player: PlayerSession) {
    if (this.tokens.length >= 4 || this.state.status !== "LOBBY") throw Error("রুম ভর্তি হয়ে গেছে।");
    this.state.players[player.sessionToken] = player;
    this.state.playerOrder.push(player.sessionToken);
    this.scores[player.sessionToken] = 0;
    this.wins[player.sessionToken] = 0;
    this.touch();
  }

  addBot(displayName = "বট মামা", avatar = "🤖") {
    const token = randomUUID();
    this.add({ socketId: `bot:${token}`, sessionToken: token, displayName, avatar, hand: [], isReady: true, isUnoSafe: false, connected: true, lastHeartbeat: this.now(), isBot: true });
    return token;
  }

  player(token: string) { const p = this.state.players[token]; if (!p) throw Error("সেশন পাওয়া যায়নি।"); return p; }

  ready(token: string, value: boolean) {
    if (this.state.status !== "LOBBY") throw Error("রাউন্ড শুরু হয়ে গেছে।");
    this.player(token).isReady = value;
    this.touch();
    if (this.tokens.length >= 2 && !this.paused && this.tokens.every((t) => this.player(t).isReady)) this.start();
  }

  start(deck = shuffle(createDeck())) {
    const s = this.state;
    if (this.tokens.length < 2) throw Error("কমপক্ষে ২ জন খেলোয়াড় লাগবে।");
    if (deck.length !== DECK_SIZE || new Set(deck.map((c) => c.id)).size !== DECK_SIZE) throw Error(`ডেক ঠিক নেই—${DECK_SIZE}টা ইউনিক কার্ড লাগবে।`);
    this.roundCardIds = new Set(deck.map((c) => c.id));
    for (const c of deck) this.rememberCard(c);

    s.drawPile = [...deck]; s.discardPile = []; s.drawnCardPlayable = null; s.winnerToken = null;
    s.status = "PLAYING"; s.currentTurnIndex = 0; s.direction = 1;
    this.clearUno(); this.rematch.clear(); this.resultReason = null; this.round++;
    for (const t of this.tokens) { const p = this.player(t); p.hand = []; p.isUnoSafe = false; p.isReady = false; }
    for (let i = 0; i < 7; i++) for (const t of this.tokens) this.take(t, 1);
    let first = s.drawPile.pop()!;
    while (["WILD_DRAW_FOUR", "DEVIL"].includes(first.value)) { s.drawPile.push(first); shuffle(s.drawPile); first = s.drawPile.pop()!; }
    s.discardPile.push(first); s.activeColor = first.color; this.needsStartingColor = first.value === "WILD";
    if (first.value === "DRAW_TWO") { this.take(this.current, 2); this.advance(1, false); }
    else if (first.value === "SKIP") this.advance(1, false);
    else if (first.value === "REVERSE") {
      if (this.tokens.length === 2) this.advance(1, false); else s.direction = -1;
    }
    this.resetTimer();
    this.assertIntegrity("round start");
    this.touch();
  }

  private resetTimer() { this.remainingTurn = 30_000; this.turnDeadline = this.paused ? null : this.now() + this.remainingTurn; }
  private advance(steps = 1, reset = true) {
    const n = this.tokens.length;
    for (let i = 0; i < steps; i++) this.state.currentTurnIndex = (this.state.currentTurnIndex + this.state.direction + n) % n;
    this.state.drawnCardPlayable = null;
    if (reset) this.resetTimer();
  }
  private assertTurn(t: string) {
    if (this.state.status !== "PLAYING" || this.paused) throw Error("খেলা এখন সক্রিয় নয়।");
    if (this.current !== t) throw Error("এখন তোমার চাল না ভাই 😄");
  }
  private clearUno(token?: string) {
    for (const t of token ? [token] : [...this.vulnerabilities.keys()]) { this.player(t).isUnoSafe = true; this.vulnerabilities.delete(t); }
    const latest = [...this.vulnerabilities.entries()].at(-1);
    this.state.vulnerablePlayerToken = latest?.[0] ?? null; this.state.vulnerabilityExpiry = latest?.[1] ?? null;
  }

  take(t: string, n: number) {
    const s = this.state; const got: UnoCard[] = [];
    for (let i = 0; i < n; i++) {
      if (!s.drawPile.length && s.discardPile.length > 1) {
        const top = s.discardPile.pop()!;
        s.drawPile = shuffle([...s.discardPile]);
        s.discardPile = [top];
      }
      const c = s.drawPile.pop(); if (!c) break;
      this.rememberCard(c);
      this.player(t).hand.push(c); got.push(c);
    }
    if (this.player(t).hand.length !== 1) { this.player(t).isUnoSafe = false; if (this.vulnerabilities.has(t)) this.clearUno(t); }
    return got;
  }

  legal(t: string, c: UnoCard) {
    const s = this.state; const top = s.discardPile.at(-1); if (!top || this.needsStartingColor) return false;
    if (c.value === "WILD_DRAW_FOUR") return !this.player(t).hand.some((x) => x.id !== c.id && x.color === s.activeColor);
    return c.color === "WILD" || c.color === s.activeColor || c.value === top.value;
  }

  chooseStart(t: string, color: PlayColor) {
    this.assertTurn(t); if (!this.needsStartingColor || !COLORS.includes(color)) throw Error("এখন রঙ বাছাই করার সময় না।");
    this.state.activeColor = color; this.needsStartingColor = false; this.event("color", t, undefined, color); this.assertIntegrity("choose start color"); this.touch();
  }

  play(t: string, id: string, color: PlayColor | undefined, calledUno: boolean, fromDraw = false) {
    this.assertIntegrity("before play");
    this.assertTurn(t);
    const before = this.counts();
    const s = this.state, p = this.player(t), c = p.hand.find((x) => x.id === id);
    if (!c || !this.legal(t, c)) throw Error("এই কার্ডটা এখন চলবে না 😅");
    if (s.drawnCardPlayable && (!fromDraw || s.drawnCardPlayable.id !== id)) throw Error("এখন শুধু তোলা কার্ডটাই খেলতে পারবে।");
    if (fromDraw && s.drawnCardPlayable?.id !== id) throw Error("তোলা কার্ড নেই।");
    if (c.color === "WILD" && (!color || !COLORS.includes(color))) throw Error("একটা রঙ বেছে নাও।");
    if (p.hand.length === 1 && this.now() < (this.vulnerabilities.get(t) ?? 0)) throw Error("UNO ধরার সময়টা শেষ হোক আগে!");

    p.hand = p.hand.filter((x) => x.id !== id);
    s.discardPile.push(c);
    s.activeColor = c.color === "WILD" ? color! : c.color;
    s.drawnCardPlayable = null;
    if (p.hand.length === 1) {
      p.isUnoSafe = calledUno;
      if (!calledUno) { s.vulnerablePlayerToken = t; s.vulnerabilityExpiry = this.now() + 2000; this.vulnerabilities.set(t, s.vulnerabilityExpiry); }
      this.event("uno", t, undefined, calledUno ? "called" : "missed");
    }

    const nextBefore = this.nextToken();
    let penalty = 0;
    let target: string | undefined;
    if (c.value === "DRAW_TWO") { target = nextBefore; penalty = this.take(nextBefore, 2).length; this.event("draw2", t, nextBefore); }
    else if (c.value === "WILD_DRAW_FOUR") { target = nextBefore; penalty = this.take(nextBefore, 4).length; this.event("draw4", t, nextBefore); }
    else if (c.value === "SKIP") this.event("skip", t, nextBefore);
    else if (c.value === "REVERSE") this.event("reverse", t);
    else if (c.value === "WILD") this.event("wild", t, undefined, color);
    else if (c.value === "DEVIL") this.event("devil", t, undefined, color);
    else this.event("play", t, undefined, c.value);

    this.assertPlayCountDelta(before, t, target, penalty, `play ${c.value}`);
    if (!p.hand.length) { this.assertIntegrity("winning play"); this.finish(t, "emptied-hand"); return; }

    if (c.value === "REVERSE") {
      if (this.tokens.length === 2) this.resetTimer();
      else { s.direction = s.direction === 1 ? -1 : 1; this.advance(1); }
    } else if (["SKIP", "DRAW_TWO", "WILD_DRAW_FOUR"].includes(c.value)) this.advance(2);
    else this.advance(1);
    this.assertIntegrity("after play");
    this.touch();
  }

  private nextToken() { const n = this.tokens.length; return this.tokens[(this.state.currentTurnIndex + this.state.direction + n) % n]; }

  draw(t: string) {
    this.assertIntegrity("before draw");
    this.assertTurn(t); if (this.needsStartingColor || this.state.drawnCardPlayable) throw Error("আগের কাজটা আগে শেষ করো।");
    const before = this.player(t).hand.length;
    const c = this.take(t, 1)[0];
    if (this.player(t).hand.length !== before + (c ? 1 : 0)) throw Error("CARD_COUNT_INTEGRITY: draw count mismatch");
    this.event("draw", t);
    if (c && this.legal(t, c)) this.state.drawnCardPlayable = c; else this.advance(1);
    this.assertIntegrity("after draw");
    this.touch();
  }
  pass(t: string) { this.assertIntegrity("before pass"); this.assertTurn(t); if (!this.state.drawnCardPlayable) throw Error("আগে একটা কার্ড তোলো।"); this.event("pass", t); this.advance(1); this.assertIntegrity("after pass"); this.touch(); }

  catchUno(t: string) {
    this.assertIntegrity("before UNO catch");
    if (this.state.status !== "PLAYING" || this.paused) throw Error("খেলা থেমে আছে।");
    this.player(t);
    const victim = [...this.vulnerabilities.entries()].find(([x, expiry]) => x !== t && this.now() < expiry)?.[0];
    if (!victim) throw Error("এখন কাউকে UNO ধরে ফেলতে পারবে না।");
    const before = this.player(victim).hand.length;
    const got = this.take(victim, 2).length;
    if (this.player(victim).hand.length !== before + got) throw Error("CARD_COUNT_INTEGRITY: UNO penalty count mismatch");
    this.clearUno(victim); this.event("catch", t, victim); this.assertIntegrity("after UNO catch"); this.touch();
  }

  finish(t: string, reason: string) {
    if (this.state.status === "ROUND_OVER") return;
    this.state.status = "ROUND_OVER"; this.state.winnerToken = t; this.resultReason = reason; this.turnDeadline = null; this.state.drawnCardPlayable = null; this.needsStartingColor = false; this.clearUno();
    const gained = this.tokens.filter((x) => x !== t).flatMap((x) => this.player(x).hand).reduce((n, c) => n + points(c), 0);
    this.scores[t] += gained; this.wins[t] += 1;
    this.history.unshift({ round: this.round, winnerName: this.player(t).displayName, winnerAvatar: this.player(t).avatar, points: gained, reason, at: this.now() });
    this.history = this.history.slice(0, 12); this.event("win", t, undefined, String(gained)); this.assertIntegrity("round finish"); this.touch();
  }

  disconnect(t: string) { const p = this.player(t); if (!p.connected) return; p.connected = false; this.disconnected.set(t, this.now() + 45_000); if (this.turnDeadline !== null) { this.remainingTurn = Math.max(0, this.turnDeadline - this.now()); this.turnDeadline = null; } this.touch(); }
  reconnect(t: string, socketId: string) { this.tick(); const p = this.player(t); if (this.disconnected.has(t) && this.now() >= this.disconnected.get(t)!) throw Error("ফিরে আসার সময় শেষ।"); const wasPaused = this.paused; p.socketId = socketId; p.connected = true; p.lastHeartbeat = this.now(); this.disconnected.delete(t); if (wasPaused && !this.paused && this.state.status === "PLAYING") this.turnDeadline = this.now() + this.remainingTurn; this.assertIntegrity("reconnect"); this.touch(); }

  requestRematch(t: string) {
    if (this.state.status !== "ROUND_OVER") throw Error("রাউন্ড শেষ হোক আগে।");
    this.player(t); this.rematch.add(t);
    for (const x of this.tokens) if (this.player(x).isBot) this.rematch.add(x);
    this.touch();
    if (this.rematch.size === this.tokens.length && !this.paused) this.start();
  }

  private botColor(t: string): PlayColor {
    const counts: Record<PlayColor, number> = { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };
    for (const c of this.player(t).hand) if (c.color !== "WILD") counts[c.color]++;
    return (Object.entries(counts).sort((a,b) => b[1] - a[1])[0]?.[0] as PlayColor) || "RED";
  }

  private botTaunt(t: string) {
    const ev = this.lastEvent;
    const lines: Record<string, string[]> = {
      draw: ["কার্ড তুললাম, কিন্তু প্ল্যান আরও ভয়ংকর 😏", "ডেকের সাথে একটু কথা বলে আসি 😂"],
      draw2: ["+2 নাও বস, গিফট ফ্রি! 😂", "দুইটা কার্ড—মন খারাপ কইরো না 😈"],
      draw4: ["+4! বন্ধুত্ব পরে দেখা যাবে 💀🔥", "চারটা নাও ভাই, আজকে ছাড় নাই 😎"],
      skip: ["তোমার চাল? আজকে না 😂", "বসে থাকো বস, আমি খেলি 😈"],
      reverse: ["রাস্তা ঘুরাই দিলাম 🔄", "খেলা উল্টে দিলাম, এখন সামলাও 😎"],
      uno: ["UNO! বট মামা কিন্তু সিরিয়াস 🤖🔥", "একটাই বাকি—ধরতে পারলে ধরো 👀"],
      play: ["এই চালটা মনে রাখবা 😏", "চুপচাপ কার্ড নামালাম, ভয় পাও 😂"],
      wild: ["রঙও আমার, নিয়মও আমার 😎", "কালার বদল! মাথা ঠান্ডা রাখো 😂"],
      devil: ["😈 ডেভিল কার্ড! চোখ খোলা রাখো!", "ডেভিল নামল—গোপন কার্ডে এক সেকেন্ডের ঝড় 😈"]
    };
    const choices = ev ? lines[ev.type] : undefined;
    if (choices?.length) this.event("taunt", t, undefined, choices[Math.floor(Math.random()*choices.length)]);
    else if (Math.random() < 0.25) this.event("taunt", t, undefined, "বট মামা কিন্তু ঘুমায় না 🤖");
    this.player(t).lastHeartbeat = this.now();
  }

  playBotTurn() {
    if (this.state.status !== "PLAYING" || this.paused) return false;
    const t = this.current;
    const p = this.player(t);
    if (!p.isBot) return false;

    const catchable = [...this.vulnerabilities.entries()].find(([x, expiry]) => x !== t && this.now() < expiry);
    if (catchable) { this.catchUno(t); this.event("taunt", t, undefined, "UNO ভুল! ধরে ফেললাম 😂🤖"); return true; }
    if (this.needsStartingColor) { this.chooseStart(t, this.botColor(t)); this.event("taunt", t, undefined, "কালার আমি বাছি—বটেরও পছন্দ আছে 😎"); return true; }
    if (this.state.drawnCardPlayable) {
      const c = this.state.drawnCardPlayable;
      const chosen = c.color === "WILD" ? this.botColor(t) : undefined;
      this.play(t, c.id, chosen, p.hand.length === 2, true); this.botTaunt(t); return true;
    }
    const legal = p.hand.filter((c) => this.legal(t, c));
    if (legal.length) {
      const score = (c: UnoCard) => c.value === "WILD_DRAW_FOUR" ? 7 : c.value === "DEVIL" ? 6.5 : c.value === "DRAW_TWO" ? 6 : c.value === "SKIP" ? 5 : c.value === "REVERSE" ? 4 : c.value === "WILD" ? 3 : Number.isFinite(Number(c.value)) ? Number(c.value) / 10 : 1;
      const c = [...legal].sort((a,b) => score(b) - score(a))[0];
      const chosen = c.color === "WILD" ? this.botColor(t) : undefined;
      this.play(t, c.id, chosen, p.hand.length === 2); this.botTaunt(t); return true;
    }
    this.draw(t); this.botTaunt(t); return true;
  }

  tick() {
    const s = this.state, now = this.now();
    for (const [t, deadline] of this.disconnected) if (now >= deadline && s.status === "PLAYING") {
      const connected = this.tokens.filter((x) => x !== t && this.player(x).connected);
      if (connected.length >= 1) this.finish(connected[0], "forfeit");
    }
    for (const [t, expiry] of this.vulnerabilities) if (now >= expiry) { this.clearUno(t); this.touch(); }
    if (s.status === "PLAYING" && !this.paused && this.turnDeadline !== null && now >= this.turnDeadline) {
      this.assertIntegrity("before timeout");
      if (this.needsStartingColor) { this.needsStartingColor = false; s.activeColor = "RED"; }
      const timed = this.current;
      if (!s.drawnCardPlayable) {
        const before = this.player(timed).hand.length;
        const got = this.take(timed, 1).length;
        if (this.player(timed).hand.length !== before + got) throw Error("CARD_COUNT_INTEGRITY: timeout draw mismatch");
      }
      this.event("timeout", timed); this.advance(1); this.assertIntegrity("after timeout"); this.touch();
    }
  }

  devilReveal(t: string) {
    this.player(t);
    return this.tokens
      .filter((x) => x !== t)
      .map((x) => ({
        seat: this.tokens.indexOf(x),
        displayName: this.player(x).displayName,
        avatar: this.player(x).avatar,
        cards: this.player(x).hand.map((c) => ({ color: c.color, value: c.value })),
      }));
  }

  sync(t: string): ClientSyncPayload {
    this.assertIntegrity("sync");
    const s = this.state, p = this.player(t); const active = s.status === "PLAYING" && !this.paused; const mine = active && this.current === t;
    const locked = p.hand.length === 1 && this.now() < (this.vulnerabilities.get(t) ?? 0);
    const catchable = [...this.vulnerabilities.entries()].some(([x, expiry]) => x !== t && this.now() < expiry);
    const disconnectedDeadlines = this.tokens.filter((x) => x !== t && !this.player(x).isBot).map((x) => this.disconnected.get(x)).filter((x): x is number => !!x);
    return {
      roomCode: s.roomCode, status: s.status, isMyTurn: mine,
      myHand: p.hand.map((c) => ({ id: c.id, color: c.color, value: c.value })),
      myName: p.displayName, myAvatar: p.avatar,
      topDiscardCard: s.discardPile.at(-1) ? { ...s.discardPile.at(-1)! } : null,
      activeColor: s.activeColor, direction: s.direction, drawPileCount: s.drawPile.length,
      canCallUno: mine && p.hand.length === 2, canCatchOpponent: active && catchable,
      pendingDrawnCard: mine && s.drawnCardPlayable ? { ...s.drawnCardPlayable } : null,
      winnerName: s.winnerToken ? this.player(s.winnerToken).displayName : null, winnerAvatar: s.winnerToken ? this.player(s.winnerToken).avatar : null,
      playableCardIds: mine && !locked ? p.hand.filter((c) => this.legal(t,c) && (!s.drawnCardPlayable || c.id === s.drawnCardPlayable.id)).map((c) => c.id) : [],
      needsStartingColor: mine && this.needsStartingColor, paused: this.paused, turnDeadline: this.turnDeadline,
      reconnectDeadline: disconnectedDeadlines.length ? Math.min(...disconnectedDeadlines) : null,
      unoDeadline: [...this.vulnerabilities.entries()].find(([x]) => x !== t)?.[1] ?? null,
      serverNow: this.now(),
      players: this.tokens.map((x) => ({ displayName: this.player(x).displayName, avatar: this.player(x).avatar, connected: this.player(x).connected, isReady: this.player(x).isReady, isMe: x === t, isCurrent: x === this.current, cardCount: this.player(x).hand.length, score: this.scores[x], wins: this.wins[x], rematchRequested: this.rematch.has(x), isBot: !!this.player(x).isBot, seat: this.tokens.indexOf(x) })),
      history: this.history.map((h) => ({ ...h })), revision: this.revision, round: this.round, resultReason: this.resultReason,
      lastEvent: this.lastEvent ? { ...this.lastEvent } : null,
    };
  }
}
