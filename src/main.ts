import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createUnoServer } from "./server.js";
import { registerUnoFlex } from "./UnoFlex.js";
import { registerFlexPrivacy } from "./FlexPrivacy.js";
import { registerPresence } from "./Presence.js";
import { registerClassicPowers } from "./ClassicPowers.js";
import { registerVoiceChat } from "./VoiceChat.js";
import { registerReconnectTakeover } from "./ReconnectTakeover.js";
import { registerCompetitiveHub } from "./CompetitiveHub.js";
import { registerSafetyHub } from "./SafetyHub.js";
import { registerCompetitionHub } from "./CompetitionHub.js";
import { handleAdminRequest } from "./AdminPanel.js";
import { handleAnalyticsRequest } from "./Analytics.js";

const server = createUnoServer();
try {
  registerVoiceChat(server.io, server.rooms);
} catch (error) {
  console.error("[DBT voice init] Voice disabled; gameplay continues.", error);
}
const flexPrivacy = registerFlexPrivacy(server.io);
registerUnoFlex(server.io);
registerPresence(server.io, server.rooms, server.roomPrivacy);
registerClassicPowers(server.io, server.rooms);
registerReconnectTakeover(server.io, server.rooms);
const competitiveHub = registerCompetitiveHub(server.io, server.rooms, server.roomPrivacy);
const safetyHub = registerSafetyHub(server.io, server.rooms);
const competitionHub = registerCompetitionHub(server.io, server.rooms);

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");

function serveStaticHtml(res: ServerResponse, filename: string) {
  const page = readFileSync(path.join(clientDir, filename), "utf8");
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(page);
}

function serveGamePage(res: ServerResponse, filename: string, flex = false) {
  let page = readFileSync(path.join(clientDir, filename), "utf8");
  if (flex) {
    page = page.replace(
      '<script defer src="/flex/flex.js"></script>',
      '<script defer src="/flex/socket-hook.js?v=staging-1"></script>\n  <script defer src="/flex/flex.js"></script>',
    );
  }
  const flexManifest = flex ? '  <link rel="manifest" href="/manifest.webmanifest" />\n' : "";
  const flexExtras = flex ? '  <link rel="stylesheet" href="/flex/privacy.css?v=staging-1" />\n  <script defer src="/flex/privacy.js?v=staging-1"></script>\n' : "";
  const classicExtras = flex ? "" : '  <link rel="stylesheet" href="/premium-safety.css?v=staging-1" />\n  <script defer src="/premium-safety.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-competition.css?v=staging-1" />\n  <script defer src="/premium-competition.js?v=staging-1"></script>\n';
  page = page.replace(
    "</head>",
    `${flexManifest}  <link rel="stylesheet" href="/premium-accessibility.css?v=staging-1" />\n  <script defer src="/premium-accessibility.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-reconnect.css?v=staging-1" />\n  <script defer src="/premium-reconnect.js?v=staging-1"></script>\n  <script defer src="/premium-multiplayer-loader.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-match-story.css?v=staging-1" />\n  <script defer src="/premium-match-story.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-modes.css?v=staging-1" />\n  <script defer src="/premium-modes.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-weekly-recent.css?v=staging-1" />\n  <script defer src="/premium-weekly-recent.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-voice-lab.css?v=staging-1" />\n  <script defer src="/premium-voice-lab.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-audio-mixer.css?v=staging-1" />\n  <script defer src="/premium-audio-mixer.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-room-privacy.css?v=staging-1" />\n  <script defer src="/premium-room-privacy.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-captions.css?v=staging-1" />\n  <script defer src="/premium-captions.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-diagnostics.css?v=staging-1" />\n  <script defer src="/premium-diagnostics.js?v=staging-1"></script>\n${flexExtras}${classicExtras}</head>`,
  );
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(page);
}

const originalRequestListeners = server.http.listeners("request");
server.http.removeAllListeners("request");
server.http.on("request", async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (await handleAnalyticsRequest(req, res)) return;
    if (await handleAdminRequest(req, res, server.io)) return;
  } catch (error) {
    console.error("[DBT request]", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Request failed" }));
    }
    return;
  }

  const url = new URL(req.url ?? "/", "http://dbt.local");
  const pathname = url.pathname;

  if (pathname === "/analytics") {
    try { serveStaticHtml(res, "analytics-dashboard.html"); }
    catch (error) {
      console.error("[DBT analytics page]", error);
      res.statusCode = 500;
      res.end("Unable to open analytics dashboard.");
    }
    return;
  }

  if (pathname === "/arena" || pathname === "/arena/" || pathname === "/arena.html" || /^\/spectate=[A-Z2-9]{4}\/?$/i.test(pathname)) {
    try { serveStaticHtml(res, "arena.html"); }
    catch (error) {
      console.error("[DBT arena page]", error);
      res.statusCode = 500;
      res.end("Unable to open DBT Arena.");
    }
    return;
  }

  if (pathname === "/" || pathname === "/index.html") {
    try { serveGamePage(res, "index.html"); }
    catch (error) {
      console.error("[DBT classic page]", error);
      res.statusCode = 500;
      res.end("Unable to open UNO Adda.");
    }
    return;
  }

  if (pathname === "/flex" || pathname === "/flex/" || pathname === "/flex/index.html") {
    try { serveGamePage(res, path.join("flex", "index.html"), true); }
    catch (error) {
      console.error("[DBT flex page]", error);
      res.statusCode = 500;
      res.end("Unable to open UNO Flex.");
    }
    return;
  }

  if (/^\/room=[A-Z2-9]{4}\/?$/i.test(pathname)) {
    try { serveGamePage(res, "index.html"); }
    catch (error) {
      console.error("[DBT room link]", error);
      res.statusCode = 500;
      res.end("Unable to open UNO Adda room.");
    }
    return;
  }

  for (const listener of originalRequestListeners) {
    (listener as (req: IncomingMessage, res: ServerResponse) => void).call(server.http, req, res);
  }
});

const port = Number(process.env.PORT ?? 3000);
server.http.listen(port, "0.0.0.0", () => console.log(`DBT Games server listening on port ${port}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    competitiveHub.close();
    safetyHub.close();
    competitionHub.close();
    flexPrivacy.close();
    void server.close().then(() => process.exit(0));
  });
}
