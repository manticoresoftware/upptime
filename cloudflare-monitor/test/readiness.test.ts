import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "../src/readiness";

describe("Worker readiness", () => {
  it("is unavailable before the first cron run", () => {
    expect(evaluateReadiness(null)).toEqual({
      httpStatus: 503,
      body: { status: "starting", lastRunAt: null, ageSeconds: null },
    });
  });

  it("is healthy when the cron heartbeat is recent", () => {
    const now = Date.parse("2026-08-17T15:03:00Z");
    const result = evaluateReadiness(JSON.stringify({ finishedAt: "2026-08-17T15:02:00Z" }), now);
    expect(result).toEqual({
      httpStatus: 200,
      body: { status: "ok", lastRunAt: "2026-08-17T15:02:00Z", ageSeconds: 60 },
    });
  });

  it("is unavailable when the cron heartbeat is stale", () => {
    const now = Date.parse("2026-08-17T15:10:00Z");
    const result = evaluateReadiness(JSON.stringify({ finishedAt: "2026-08-17T15:02:00Z" }), now);
    expect(result).toEqual({
      httpStatus: 503,
      body: { status: "stale", lastRunAt: "2026-08-17T15:02:00Z", ageSeconds: 480 },
    });
  });

  it("fails closed for malformed heartbeat data", () => {
    expect(evaluateReadiness("{}", 0).httpStatus).toBe(503);
    expect(evaluateReadiness("not json", 0).httpStatus).toBe(503);
  });
});
