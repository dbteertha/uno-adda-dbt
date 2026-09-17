import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SafetyReport } from "./SafetyHub.js";

type SafetyReviewSource = {
  listReports(limit?: number): SafetyReport[];
  resolveReport(id: string): boolean;
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function suppliedKey(req: IncomingMessage) {
  const direct = req.headers["x-dbt-safety-key"];
  if (typeof direct === "string") return direct;
  const auth = req.headers.authorization;
  return typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function authorized(req: IncomingMessage, expected: string) {
  const supplied = suppliedKey(req);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function handleModerationReviewRequest(req: IncomingMessage, res: ServerResponse, source: SafetyReviewSource) {
  const url = new URL(req.url || "/", "http://dbt.local");
  if (!url.pathname.startsWith("/api/safety-review")) return false;

  const expected = process.env.DBT_SAFETY_REVIEW_KEY?.trim();
  if (!expected) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  if (!authorized(req, expected)) {
    json(res, 401, { error: "Unauthorized" });
    return true;
  }

  if (url.pathname === "/api/safety-review" && req.method === "GET") {
    const limit = Number(url.searchParams.get("limit") || 100);
    const reports = source.listReports(limit);
    const byReason: Record<string, number> = {};
    for (const report of reports) byReason[report.reason] = (byReason[report.reason] ?? 0) + 1;
    json(res, 200, { count: reports.length, byReason, reports });
    return true;
  }

  const match = url.pathname.match(/^\/api\/safety-review\/([a-z0-9-]{5,80})$/i);
  if (match && req.method === "DELETE") {
    const removed = source.resolveReport(match[1]);
    json(res, removed ? 200 : 404, removed ? { ok: true, id: match[1] } : { error: "Report not found" });
    return true;
  }

  json(res, 404, { error: "Not found" });
  return true;
}
