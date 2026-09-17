import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createUnoServer } from "./server.js";
import { registerUnoFlex } from "./UnoFlex.js";
import { registerPresence } from "./Presence.js";
import { registerClassicPowers } from "./ClassicPowers.js";
import { registerVoiceChat } from "./VoiceChat.js";
import { registerReconnectTakeover } from "./ReconnectTakeover.js";
import { handleAdminRequest } from "./AdminPanel.js";
import { handleAnalyticsRequest } from "./Analytics.js";

const server = createUnoServer();
// Voice is isolated from gameplay. A voice initialization failure must never block UNO startup.
try {
  // Register before Flex so trusted Flex session identities are observed before the Flex handler consumes them.
  registerVoiceChat(server.io, server.rooms);
} catch (error) {
  console.error("[DBT voice init] Voice disabled; gameplay continues.", error);
}
registerUnoFlex(server.io);
registerPresence(server.io, server.rooms);
registerClassicPowers(server.io, server.rooms);
// Staging reconnect resilience: after a brief grace period a disconnected Classic seat is held by AI.
// The original session token remains valid, so reconnecting hands control back to the human.
registerReconnectTakeover(server.io, server.rooms);

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");

function serveGamePage(res: ServerResponse, filename: string, flex = false) {
  let page = readFileSync(path.join(clientDir, filename), "utf8");
  if (flex) {
    page = page.replace(
      '<script defer src="/flex/flex.js"></script>',
      '<script defer src="/flex/socket-hook.js?v=staging-1"></script>\n  <script defer src="/flex/flex.js"></script>',
    );
  }
  const flexManifest = flex ? '  <link rel="manifest" href="/manifest.webmanifest" />\n' : "";
  page = page.replace(
    "</head>",
    `${flexManifest}  <link rel="stylesheet" href="/premium-accessibility.css?v=staging-1" />\n  <script defer src="/premium-accessibility.js?v=staging-1"></script>\n  <link rel="stylesheet" href="/premium-reconnect.css?v=staging-1" />\n  <script defer src="/premium-reconnect.js?v=staging-1"></script>\n  <script defer src="/premium-multiplayer-loader.js?v=staging-1"></script>\n</head>`,
  );
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(page);
}

// Pretty invite links, visual editor API and private analytics dashboard.
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
    try {
      const page = readFileSync(path.join(clientDir, "analytics-dashboard.html"));
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(page);
    } catch (error) {
      console.error("[DBT analytics page]", error);
      res.statusCode = 500;
      res.end("Unable to open analytics dashboard.");
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
    void server.close().then(() => process.exit(0));
  });
}
