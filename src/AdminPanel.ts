import { randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Server } from "socket.io";

type VisualEdit = {
  selector: string;
  text?: string;
  hidden?: boolean;
  styles?: Record<string, string>;
};

export type AdminConfig = {
  launcherTitle: string;
  launcherSubtitle: string;
  promoTitle: string;
  promoText: string;
  collaborationText: string;
  awardsText: string;
  roomsTitle: string;
  usersTitle: string;
  commentatorName: string;
  announcement: string;
  createButton: string;
  botButton: string;
  joinButton: string;
  showPromo: boolean;
  showRooms: boolean;
  showSuggestedUsers: boolean;
  showCommentary: boolean;
  simulatedHype: boolean;
  transitionSound: boolean;
  accent: string;
  accent2: string;
  background: string;
  avatars: Array<{ icon: string; label: string }>;
  customCSS: string;
  visualEdits: VisualEdit[];
};

const DEFAULT_CONFIG: AdminConfig = {
  launcherTitle: "UNO ADDA",
  launcherSubtitle: "Classic or Flex · Bot or Multiplayer · Mobile Ready",
  promoTitle: "UNO ADDA — A MULTIBILLIONAIRE-SCALE PROJECT",
  promoText: "DBT Entertainment parody promo hub.",
  collaborationText: "Dream collab roster: Elon Musk, Lionel Messi, and more — concept only; no endorsement implied.",
  awardsText: "Award-inspired showcase: The Game Awards · BAFTA Games Awards · Golden Joystick Awards.",
  roomsTitle: "ACTIVE ROOMS",
  usersTitle: "USERS YOU MAY PLAY WITH",
  commentatorName: "MR BEAN",
  announcement: "",
  createButton: "নতুন রুম খোলো 🔥",
  botButton: "🤖 বট মামার সাথে এখনই খেলি",
  joinButton: "ঢুকে পড়ো 😈",
  showPromo: true,
  showRooms: true,
  showSuggestedUsers: true,
  showCommentary: true,
  simulatedHype: true,
  transitionSound: true,
  accent: "#ff2f92",
  accent2: "#41d9ff",
  background: "#080817",
  avatars: [
    { icon: "⚽", label: "Lionel Messi" },
    { icon: "🐐", label: "Cristiano Ronaldo" },
    { icon: "🏏", label: "Shakib Al Hasan" },
    { icon: "👑", label: "Virat Kohli" },
    { icon: "💪", label: "John Cena" },
    { icon: "🪨", label: "Dwayne Johnson" },
  ],
  customCSS: "",
  visualEdits: [],
};

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");
const configPath = path.join(clientDir, "admin-config.json");
const sessions = new Map<string, number>();

function cleanString(value: unknown, fallback: string, max = 4000) {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}
function cleanBool(value: unknown, fallback: boolean) { return typeof value === "boolean" ? value : fallback; }
function cleanColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
function cleanVisualEdits(raw: unknown): VisualEdit[] {
  if (!Array.isArray(raw)) return [];
  const allowedStyles = new Set(["transform","width","height","minWidth","minHeight","fontSize","fontWeight","color","background","backgroundColor","borderColor","borderRadius","padding","margin","opacity","textAlign","letterSpacing","lineHeight","display","position","left","top","right","bottom","zIndex","boxShadow"]);
  return raw.slice(0, 500).flatMap((item: any) => {
    if (!item || typeof item.selector !== "string" || item.selector.length > 300) return [];
    const styles: Record<string, string> = {};
    if (item.styles && typeof item.styles === "object") {
      for (const [k, v] of Object.entries(item.styles)) if (allowedStyles.has(k) && typeof v === "string" && v.length <= 500) styles[k] = v;
    }
    return [{
      selector: item.selector,
      ...(typeof item.text === "string" ? { text: item.text.slice(0, 8000) } : {}),
      ...(typeof item.hidden === "boolean" ? { hidden: item.hidden } : {}),
      ...(Object.keys(styles).length ? { styles } : {}),
    }];
  });
}
function normalize(raw: any): AdminConfig {
  const avatars = Array.isArray(raw?.avatars)
    ? raw.avatars.slice(0, 12).map((x: any) => ({ icon: cleanString(x?.icon, "🎮", 8), label: cleanString(x?.label, "Player", 40) }))
    : DEFAULT_CONFIG.avatars;
  return {
    launcherTitle: cleanString(raw?.launcherTitle, DEFAULT_CONFIG.launcherTitle, 80),
    launcherSubtitle: cleanString(raw?.launcherSubtitle, DEFAULT_CONFIG.launcherSubtitle, 160),
    promoTitle: cleanString(raw?.promoTitle, DEFAULT_CONFIG.promoTitle, 160),
    promoText: cleanString(raw?.promoText, DEFAULT_CONFIG.promoText, 800),
    collaborationText: cleanString(raw?.collaborationText, DEFAULT_CONFIG.collaborationText, 800),
    awardsText: cleanString(raw?.awardsText, DEFAULT_CONFIG.awardsText, 800),
    roomsTitle: cleanString(raw?.roomsTitle, DEFAULT_CONFIG.roomsTitle, 80),
    usersTitle: cleanString(raw?.usersTitle, DEFAULT_CONFIG.usersTitle, 80),
    commentatorName: cleanString(raw?.commentatorName, DEFAULT_CONFIG.commentatorName, 40),
    announcement: cleanString(raw?.announcement, "", 500),
    createButton: cleanString(raw?.createButton, DEFAULT_CONFIG.createButton, 80),
    botButton: cleanString(raw?.botButton, DEFAULT_CONFIG.botButton, 80),
    joinButton: cleanString(raw?.joinButton, DEFAULT_CONFIG.joinButton, 80),
    showPromo: cleanBool(raw?.showPromo, DEFAULT_CONFIG.showPromo),
    showRooms: cleanBool(raw?.showRooms, DEFAULT_CONFIG.showRooms),
    showSuggestedUsers: cleanBool(raw?.showSuggestedUsers, DEFAULT_CONFIG.showSuggestedUsers),
    showCommentary: cleanBool(raw?.showCommentary, DEFAULT_CONFIG.showCommentary),
    simulatedHype: cleanBool(raw?.simulatedHype, DEFAULT_CONFIG.simulatedHype),
    transitionSound: cleanBool(raw?.transitionSound, DEFAULT_CONFIG.transitionSound),
    accent: cleanColor(raw?.accent, DEFAULT_CONFIG.accent),
    accent2: cleanColor(raw?.accent2, DEFAULT_CONFIG.accent2),
    background: cleanColor(raw?.background, DEFAULT_CONFIG.background),
    avatars,
    customCSS: cleanString(raw?.customCSS, "", 16000),
    visualEdits: cleanVisualEdits(raw?.visualEdits),
  };
}

export function getAdminConfig(): AdminConfig {
  try {
    if (existsSync(configPath)) return normalize(JSON.parse(readFileSync(configPath, "utf8")));
  } catch (error) { console.error("[Admin config read]", error); }
  return { ...DEFAULT_CONFIG, avatars: DEFAULT_CONFIG.avatars.map((x) => ({ ...x })), visualEdits: [] };
}

function saveAdminConfig(config: AdminConfig) {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
function tokenFrom(req: IncomingMessage) {
  const cookie = req.headers.cookie || "";
  return cookie.split(";").map((x) => x.trim()).find((x) => x.startsWith("dbt_admin="))?.slice(10) || "";
}
function authed(req: IncomingMessage) {
  const token = tokenFrom(req), expiry = sessions.get(token) || 0;
  if (!token || expiry < Date.now()) { if (token) sessions.delete(token); return false; }
  sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
  return true;
}
async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += b.length; if (total > 180_000) throw Error("Payload too large");
    chunks.push(b);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function safePassword(input: string, expected: string) {
  const a = Buffer.from(input), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleAdminRequest(req: IncomingMessage, res: ServerResponse, io: Server): Promise<boolean> {
  const url = new URL(req.url || "/", "http://dbt.local");
  if (url.pathname === "/api/config" && req.method === "GET") { json(res, 200, getAdminConfig()); return true; }

  if (url.pathname === "/admin" && req.method === "GET") {
    try {
      res.statusCode = 302; res.setHeader("Location", "/?edit=1"); res.end(); return true;
    } catch { res.statusCode = 500; res.end("Admin editor unavailable"); return true; }
  }

  if (!url.pathname.startsWith("/api/admin/")) return false;

  if (url.pathname === "/api/admin/login" && req.method === "POST") {
    const expected = process.env.UNO_ADMIN_PASSWORD || "";
    if (!expected) { json(res, 503, { error: "Admin password is not configured. Set UNO_ADMIN_PASSWORD on Render first." }); return true; }
    try {
      const body = await readJson(req); const supplied = String(body?.password || "");
      if (!safePassword(supplied, expected)) { json(res, 401, { error: "Wrong admin password" }); return true; }
      const token = randomUUID(); sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
      res.setHeader("Set-Cookie", `dbt_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`);
      json(res, 200, { ok: true }); return true;
    } catch { json(res, 400, { error: "Invalid request" }); return true; }
  }

  if (!authed(req)) { json(res, 401, { error: "Admin login required" }); return true; }
  if (url.pathname === "/api/admin/me" && req.method === "GET") { json(res, 200, { ok: true }); return true; }
  if (url.pathname === "/api/admin/config" && req.method === "GET") { json(res, 200, getAdminConfig()); return true; }
  if (url.pathname === "/api/admin/config" && req.method === "PUT") {
    try {
      const config = normalize(await readJson(req)); saveAdminConfig(config); io.emit("s_admin_config", config);
      json(res, 200, { ok: true, config }); return true;
    } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : "Unable to save" }); return true; }
  }
  if (url.pathname === "/api/admin/logout" && req.method === "POST") {
    sessions.delete(tokenFrom(req)); res.setHeader("Set-Cookie", "dbt_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"); json(res, 200, { ok: true }); return true;
  }
  json(res, 404, { error: "Not found" }); return true;
}
