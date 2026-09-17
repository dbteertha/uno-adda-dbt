import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

test("critical Classic launcher and match controls remain present", () => {
  const html = read("client/index.html");
  for (const id of [
    "home-play-uno",
    "create",
    "join",
    "bot-play",
    "lobby",
    "board",
    "draw",
    "hand",
    "uno",
    "results",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing Classic critical control: ${id}`);
  }
});

test("critical Flex launcher and match controls remain present", () => {
  const html = read("client/flex/index.html");
  for (const id of [
    "create-flex",
    "join-flex",
    "lobby",
    "game",
    "draw",
    "hand",
    "uno",
    "play-dialog",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing Flex critical control: ${id}`);
  }
});

test("premium staging modules stay fail-safe and gameplay-passive", () => {
  const classicHook = read("client/classic-socket-hook.js");
  const effects = read("client/premium-effects.js");
  const reconnect = read("client/premium-reconnect.js");
  const multiplayer = read("client/premium-multiplayer.js");

  assert.match(classicHook, /DBT_STABILITY/);
  assert.match(classicHook, /guardAsync/);
  assert.match(effects, /roomReady/);
  assert.match(reconnect, /server-authoritative/i);
  assert.doesNotMatch(multiplayer, /\.emit\(\s*["'](?:c_|f_)/, "passive multiplayer memory must not emit gameplay actions");
});

test("PWA update policy only skips waiting after an explicit apply-update message", () => {
  const sw = read("client/sw.js");
  const install = sw.match(/self\.addEventListener\(['"]install['"][\s\S]*?\n\}\);/)?.[0] ?? "";
  const message = sw.match(/self\.addEventListener\(['"]message['"][\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.ok(install, "service-worker install handler missing");
  assert.doesNotMatch(install, /skipWaiting\s*\(/, "service worker must not force an active-session takeover during install");
  assert.match(message, /DBT_APPLY_UPDATE/);
  assert.match(message, /skipWaiting\s*\(/, "explicit apply-update flow should remain available");
  assert.match(sw, /ignoreSearch\s*:\s*true/, "versioned premium assets must remain available offline");
});

test("accessibility layer retains reduced-motion and forced-colors support", () => {
  const css = read("client/premium-accessibility.css");
  const js = read("client/premium-accessibility.js");
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
  assert.match(js, /aria-live|announce/i);
});

test("Classic privacy, safety and competitive services stay registered", () => {
  const main = read("src/main.ts");
  const server = read("src/server.ts");
  assert.match(main, /registerSafetyHub/);
  assert.match(main, /registerCompetitionHub/);
  assert.match(main, /premium-safety\.js/);
  assert.match(main, /premium-competition\.js/);
  assert.match(server, /RoomVisibility\s*=\s*["']public["']\s*\|\s*["']private["']\s*\|\s*["']invite["']/);
  assert.match(server, /c_room_privacy/);
  assert.match(server, /inviteKey/);
});

test("Arena spectator snapshots never expose hidden hand contents", () => {
  const arena = read("src/CompetitiveHub.ts");
  const snapshotBody = arena.match(/function publicSnapshot[\s\S]*?\n}\n\nexport function/)?.[0] ?? "";
  assert.ok(snapshotBody, "public spectator snapshot builder missing");
  assert.match(snapshotBody, /cardCount:\s*player\.hand\.length/);
  assert.doesNotMatch(snapshotBody, /hand:\s*player\.hand/);
  assert.doesNotMatch(snapshotBody, /myHand/);
  assert.doesNotMatch(arena, /c_play_card|c_draw_card|c_pass_turn/, "spectator service must not expose gameplay mutation events");
});

test("competition results are derived from actual Classic room winners", () => {
  const hub = read("src/CompetitionHub.ts");
  assert.match(hub, /room\.state\.status\s*!==\s*["']ROUND_OVER["']/);
  assert.match(hub, /room\.history\[0\]\?\.winnerName/);
  assert.match(hub, /applyRatedResult/);
  assert.match(hub, /advanceTournament/);
  assert.doesNotMatch(hub, /Math\.random\(\).*winner|randomInt\([^\n]*winner/i, "competitive winners must never be random/simulated");
});

test("Flex invite privacy remains isolated from card-state code", () => {
  const privacy = read("src/FlexPrivacy.ts");
  const flex = read("src/UnoFlex.ts");
  assert.match(privacy, /invite/i);
  assert.match(privacy, /private|visibility/i);
  assert.doesNotMatch(privacy, /\.hand\s*=|deck\s*=|discard\s*=/, "privacy helper must not mutate Flex card zones");
  assert.match(flex, /FLEX_CARD_CONSERVATION/);
  assert.match(flex, /FLEX_DUPLICATE_CARD/);
  assert.match(flex, /FLEX_CARD_MUTATED/);
});

test("bounded replay, report and tournament state prevents unbounded session growth", () => {
  const arena = read("src/CompetitiveHub.ts");
  const safety = read("src/SafetyHub.ts");
  const competition = read("src/CompetitionHub.ts");
  assert.match(arena, /MAX_REPLAY_ROOMS/);
  assert.match(arena, /MAX_REPLAY_FRAMES/);
  assert.match(arena, /MAX_DELAYED_FRAMES/);
  assert.match(safety, /reports\.length\s*>\s*500/);
  assert.match(competition, /rankedMatches\.delete/);
  assert.match(competition, /tournaments\.delete/);
});

test("voice supports short-lived TURN credentials without removing static fallback", () => {
  const voice = read("src/VoiceChat.ts");
  assert.match(voice, /DBT_TURN_SHARED_SECRET/);
  assert.match(voice, /createHmac\(["']sha1["']/);
  assert.match(voice, /DBT_TURN_TTL_SECONDS/);
  assert.match(voice, /DBT_TURN_USERNAME/);
  assert.match(voice, /DBT_TURN_CREDENTIAL/);
});

test("spectator anti-sniping delay filters live and replay state", () => {
  const arena = read("src/CompetitiveHub.ts");
  assert.match(arena, /DBT_SPECTATOR_DELAY_MS/);
  assert.match(arena, /SPECTATOR_DELAY_MS/);
  assert.match(arena, /availableReplay/);
  assert.match(arena, /frame\.at\s*<=\s*cutoff/);
  assert.match(arena, /queueBroadcast/);
});

test("moderation review API is hidden unless a dedicated secret is configured", () => {
  const review = read("src/ModerationReview.ts");
  const main = read("src/main.ts");
  assert.match(review, /DBT_SAFETY_REVIEW_KEY/);
  assert.match(review, /timingSafeEqual/);
  assert.match(review, /404/);
  assert.match(review, /401/);
  assert.match(main, /handleModerationReviewRequest/);
});
