export interface Readiness {
  httpStatus: 200 | 503;
  body: {
    status: "ok" | "starting" | "stale";
    lastRunAt: string | null;
    ageSeconds: number | null;
  };
}

export const evaluateReadiness = (
  lastRunJson: string | null,
  nowMs = Date.now(),
  maxAgeMs = 3 * 60_000,
): Readiness => {
  if (!lastRunJson) {
    return { httpStatus: 503, body: { status: "starting", lastRunAt: null, ageSeconds: null } };
  }

  try {
    const lastRun = JSON.parse(lastRunJson) as { finishedAt?: unknown };
    if (typeof lastRun.finishedAt !== "string") throw new Error("missing finishedAt");
    const finishedAtMs = Date.parse(lastRun.finishedAt);
    if (!Number.isFinite(finishedAtMs)) throw new Error("invalid finishedAt");
    const ageMs = Math.max(0, nowMs - finishedAtMs);
    return {
      httpStatus: ageMs <= maxAgeMs ? 200 : 503,
      body: {
        status: ageMs <= maxAgeMs ? "ok" : "stale",
        lastRunAt: lastRun.finishedAt,
        ageSeconds: Math.round(ageMs / 1_000),
      },
    };
  } catch {
    return { httpStatus: 503, body: { status: "stale", lastRunAt: null, ageSeconds: null } };
  }
};
