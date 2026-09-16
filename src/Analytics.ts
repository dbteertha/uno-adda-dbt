import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

type Session = {
  id: string;
  visitorId: string;
  name: string;
  startedAt: number;
  lastSeenAt: number;
  endedAt?: number;
  durationMs: number;
  page: string;
  referrer: string;
  timezone: string;
  language: string;
  deviceType: string;
  deviceName: string;
  browser: string;
  os: string;
  screen: string;
  country: string;
  ipHash: string;
};

type Store = { sessions: Session[] };
const dataPath = path.resolve(process.cwd(), "analytics-data.json");
let store: Store = { sessions: [] };
try {
  if (existsSync(dataPath)) store = JSON.parse(readFileSync(dataPath, "utf8"));
} catch (error) { console.error("[analytics load]", error); }

function persist() {
  try { writeFileSync(dataPath, JSON.stringify(store), "utf8"); }
  catch (error) { console.error("[analytics persist]", error); }
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += b.length; if (total > 32_000) throw Error("Payload too large"); chunks.push(b);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function str(v: unknown, max = 200) { return typeof v === "string" ? v.slice(0, max) : ""; }
function parseUA(uaRaw: string) {
  const ua = uaRaw || "";
  const deviceType = /ipad|tablet/i.test(ua) ? "Tablet" : /mobile|iphone|android/i.test(ua) ? "Mobile" : "Desktop";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other";
  const os = /Windows NT/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS/iPadOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  const model = ua.match(/Android[^;]*;\s*([^;)]+)[;)]/)?.[1]?.replace(/\s+Build\/.*/, "").trim();
  const deviceName = model || (/iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : deviceType);
  return { deviceType, deviceName, browser, os };
}
function countryFrom(req: IncomingMessage) {
  const candidates = [req.headers["cf-ipcountry"], req.headers["x-vercel-ip-country"], req.headers["x-country-code"]];
  for (const v of candidates) if (typeof v === "string" && /^[A-Z]{2}$/i.test(v)) return v.toUpperCase();
  return "";
}
function ipHash(req: IncomingMessage) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0] : req.socket.remoteAddress || "").trim();
  if (!ip) return "";
  return createHash("sha256").update(`uno-adda:${ip}`).digest("hex").slice(0, 16);
}
function keyOK(url: URL) {
  const expected = process.env.ANALYTICS_KEY || "";
  return !!expected && url.searchParams.get("key") === expected;
}

export async function handleAnalyticsRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || "/", "http://dbt.local");

  if (url.pathname === "/api/analytics/session" && req.method === "POST") {
    try {
      const raw = await body(req);
      const id = str(raw.sessionId, 80) || randomUUID();
      const now = Date.now();
      const ua = str(req.headers["user-agent"], 800);
      const parsed = parseUA(ua);
      let s = store.sessions.find((x) => x.id === id);
      if (!s) {
        s = {
          id,
          visitorId: str(raw.visitorId, 80) || randomUUID(),
          name: str(raw.name, 40),
          startedAt: Number.isFinite(raw.startedAt) ? Math.min(now, Number(raw.startedAt)) : now,
          lastSeenAt: now,
          durationMs: 0,
          page: str(raw.page, 300), referrer: str(raw.referrer, 500), timezone: str(raw.timezone, 80), language: str(raw.language, 40),
          deviceType: parsed.deviceType, deviceName: parsed.deviceName, browser: parsed.browser, os: parsed.os,
          screen: str(raw.screen, 40), country: countryFrom(req), ipHash: ipHash(req),
        };
        store.sessions.push(s);
      } else {
        s.lastSeenAt = now;
        s.durationMs = Math.max(s.durationMs, Math.min(12 * 60 * 60 * 1000, Number(raw.durationMs) || 0));
        const name = str(raw.name, 40); if (name) s.name = name;
        const page = str(raw.page, 300); if (page) s.page = page;
      }
      if (raw.event === "end") { s.endedAt = now; s.lastSeenAt = now; }
      persist();
      json(res, 200, { ok: true, sessionId: s.id });
    } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : "Analytics error" }); }
    return true;
  }

  if (url.pathname === "/api/analytics/report" && req.method === "GET") {
    if (!keyOK(url)) { json(res, 403, { error: "Analytics key required" }); return true; }
    const now = Date.now();
    const rows = [...store.sessions].sort((a,b) => b.lastSeenAt - a.lastSeenAt);
    const unique = new Set(rows.map((s) => s.visitorId)).size;
    const activeNow = rows.filter((s) => now - s.lastSeenAt < 35_000).length;
    const totalDuration = rows.reduce((n,s) => n + s.durationMs, 0);
    const firstTrackedAt = rows.length ? Math.min(...rows.map((s) => s.startedAt)) : null;
    json(res, 200, {
      summary: { sessions: rows.length, uniqueVisitors: unique, activeNow, averageDurationMs: rows.length ? Math.round(totalDuration / rows.length) : 0, firstTrackedAt },
      sessions: rows.map(({ ipHash, ...s }) => ({ ...s, active: now - s.lastSeenAt < 35_000 })),
      note: "All tracked sessions are kept with no 90-day or 10,000-session deletion limit. Tracking only includes visits recorded after analytics was installed. Raw IP addresses are not stored.",
    });
    return true;
  }

  return false;
}
