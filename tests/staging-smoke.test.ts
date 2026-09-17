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

test("PWA update policy does not force an active-session takeover", () => {
  const sw = read("client/sw.js");
  assert.doesNotMatch(sw, /self\.skipWaiting\(\)/, "service worker must not force skipWaiting during an active match");
  assert.match(sw, /cache/i);
});

test("accessibility layer retains reduced-motion and forced-colors support", () => {
  const css = read("client/premium-accessibility.css");
  const js = read("client/premium-accessibility.js");
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
  assert.match(js, /aria-live|announce/i);
});
