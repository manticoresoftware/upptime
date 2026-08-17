import { CHECKS } from "./checks";
import { runInBatches, type CheckResult } from "./monitor";
import { evaluateReadiness } from "./readiness";
import { proxyUpptimeData } from "./proxy";
import { decideState, type StoredState } from "./state";

export interface Env {
  DB: D1Database;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  ADMIN_TOKEN?: string;
}

interface RunSummary {
  startedAt: string;
  finishedAt: string;
  checked: number;
  up: number;
  down: number;
  transitions: string[];
  dispatch: "sent" | "pending" | "not-needed" | "not-configured";
  results: CheckResult[];
}

const iso = (date = new Date()) => date.toISOString();

const getMeta = async (db: D1Database, key: string): Promise<string | null> => {
  const row = await db.prepare("SELECT value FROM monitor_meta WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
};

const setMeta = async (db: D1Database, key: string, value: string): Promise<void> => {
  await db
    .prepare(
      `INSERT INTO monitor_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value, iso())
    .run();
};

const deleteMeta = async (db: D1Database, key: string): Promise<void> => {
  await db.prepare("DELETE FROM monitor_meta WHERE key = ?").bind(key).run();
};

const dispatchUpptime = async (env: Env): Promise<void> => {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not configured");
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "manticoresoftware/upptime-cloudflare-monitor",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: "uptime" }),
    },
  );
  if (response.status !== 204) {
    const body = await response.text();
    throw new Error(`GitHub dispatch failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
};

const dueChecks = (date: Date) => {
  const minute = Math.floor(date.getTime() / 60_000);
  return CHECKS.filter((check) => !check.everyMinutes || minute % check.everyMinutes === 0);
};

const loadStates = async (db: D1Database): Promise<Map<string, StoredState>> => {
  const rows = await db.prepare("SELECT * FROM monitor_state").all<StoredState>();
  return new Map(rows.results.map((row) => [row.slug, row]));
};

const stateChanged = (old: StoredState | undefined, next: ReturnType<typeof decideState>, result: CheckResult) =>
  !old ||
  old.state !== next.state ||
  old.failure_streak !== next.failureStreak ||
  old.success_streak !== next.successStreak ||
  old.last_error !== result.error ||
  old.status_code !== result.statusCode;

const saveState = async (
  db: D1Database,
  result: CheckResult,
  previous: StoredState | undefined,
  decision: ReturnType<typeof decideState>,
): Promise<void> => {
  if (!stateChanged(previous, decision, result)) return;
  const changedAt = decision.transitioned ? iso() : previous?.last_changed_at ?? null;
  await db
    .prepare(
      `INSERT INTO monitor_state
       (slug, name, url, state, failure_streak, success_streak, last_changed_at, last_error, status_code, response_time_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name,
         url = excluded.url,
         state = excluded.state,
         failure_streak = excluded.failure_streak,
         success_streak = excluded.success_streak,
         last_changed_at = excluded.last_changed_at,
         last_error = excluded.last_error,
         status_code = excluded.status_code,
         response_time_ms = excluded.response_time_ms`,
    )
    .bind(
      result.slug,
      result.name,
      result.url,
      decision.state,
      decision.failureStreak,
      decision.successStreak,
      changedAt,
      result.error,
      result.statusCode,
      result.responseTimeMs,
    )
    .run();
};

export const runMonitor = async (env: Env, now = new Date()): Promise<RunSummary> => {
  const startedAt = iso(now);
  let pendingDispatch = (await getMeta(env.DB, "pending_dispatch")) === "1";

  if (pendingDispatch && env.GITHUB_TOKEN) {
    try {
      await dispatchUpptime(env);
      await deleteMeta(env.DB, "pending_dispatch");
      pendingDispatch = false;
    } catch (error) {
      console.error("Pending Upptime dispatch failed", error);
    }
  }

  const checks = dueChecks(now);
  const results = await runInBatches(checks);
  const states = await loadStates(env.DB);
  const transitions: string[] = [];
  let shouldDispatch = false;

  for (const result of results) {
    const previous = states.get(result.slug);
    const decision = decideState(previous, result);
    await saveState(env.DB, result, previous, decision);
    if (decision.transitioned) transitions.push(`${result.slug}:${previous?.state ?? "unknown"}->${decision.state}`);
    shouldDispatch ||= decision.shouldDispatch;
  }

  let dispatch: RunSummary["dispatch"] = "not-needed";
  if (!env.GITHUB_TOKEN) {
    dispatch = "not-configured";
  } else if (shouldDispatch || pendingDispatch) {
    try {
      await dispatchUpptime(env);
      await deleteMeta(env.DB, "pending_dispatch");
      dispatch = "sent";
    } catch (error) {
      console.error("Upptime dispatch failed", error);
      await setMeta(env.DB, "pending_dispatch", "1");
      dispatch = "pending";
    }
  }

  const summary: RunSummary = {
    startedAt,
    finishedAt: iso(),
    checked: results.length,
    up: results.filter((result) => result.up).length,
    down: results.filter((result) => !result.up).length,
    transitions,
    dispatch,
    results,
  };
  await setMeta(env.DB, "last_run", JSON.stringify(summary));
  console.log(JSON.stringify({ event: "monitor-run", ...summary }));
  return summary;
};

const health = async (env: Env): Promise<Response> => {
  const [lastRun, states] = await Promise.all([
    getMeta(env.DB, "last_run"),
    env.DB.prepare("SELECT * FROM monitor_state ORDER BY slug").all<StoredState>(),
  ]);
  return Response.json(
    {
      status: "ok",
      lastRun: lastRun ? JSON.parse(lastRun) : null,
      states: states.results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};

const ready = async (env: Env): Promise<Response> => {
  const readiness = evaluateReadiness(await getMeta(env.DB, "last_run"));
  return Response.json(readiness.body, {
    status: readiness.httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
};

const authorized = (request: Request, env: Env): boolean => {
  if (!env.ADMIN_TOKEN) return false;
  return request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.startsWith("/raw/")) {
      return (await proxyUpptimeData(request, env.GITHUB_TOKEN, ctx)) ?? new Response("Not found", { status: 404 });
    }
    if (request.method === "GET" && url.pathname === "/health") return health(env);
    if (request.method === "GET" && url.pathname === "/ready") return ready(env);
    if (request.method === "POST" && url.pathname === "/run" && authorized(request, env)) {
      return Response.json(await runMonitor(env));
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runMonitor(env, new Date(controller.scheduledTime)));
  },
};
