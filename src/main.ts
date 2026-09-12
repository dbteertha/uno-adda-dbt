import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createUnoServer } from "./server.js";
import { registerUnoFlex } from "./UnoFlex.js";
import { registerPresence } from "./Presence.js";
import { registerClassicPowers } from "./ClassicPowers.js";

const server = createUnoServer();
registerUnoFlex(server.io);
registerPresence(server.io);
registerClassicPowers(server.io, server.rooms);

// Pretty invite links such as /room=ABCD?mode=classic or ?mode=flex.
const originalRequestListeners = server.http.listeners("request");
server.http.removeAllListeners("request");
server.http.on("request", (req: IncomingMessage, res: ServerResponse) => {
  const pathname = new URL(req.url ?? "/", "http://dbt.local").pathname;
  if (/^\/room=[A-Z2-9]{4}\/?$/i.test(pathname)) {
    try {
      const page = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client/index.html"));
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.end(page);
    } catch (error) {
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
