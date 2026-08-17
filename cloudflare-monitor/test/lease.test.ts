import { describe, expect, it } from "vitest";
import { runMonitor, type Env } from "../src/index";

describe("monitor run lease", () => {
  it("uses wall-clock time even when the scheduled event is delayed", async () => {
    let bound: unknown[] = [];
    const db = {
      prepare: (sql: string) => {
        expect(sql).toContain("INSERT INTO monitor_meta");
        return {
          bind: (...values: unknown[]) => {
            bound = values;
            return {
              run: async () => ({ meta: { changes: 0 } }),
            };
          },
        };
      },
    } as unknown as D1Database;
    const env: Env = {
      DB: db,
      GITHUB_OWNER: "manticoresoftware",
      GITHUB_REPO: "upptime",
    };
    const delayedScheduledTime = new Date("2020-01-01T00:00:00.000Z");
    const before = Date.now();

    const result = await runMonitor(env, delayedScheduledTime);

    const after = Date.now();
    const acquiredAt = Date.parse(bound[1] as string);
    expect(result.skipped).toBe("already-running");
    expect(result.startedAt).toBe(delayedScheduledTime.toISOString());
    expect(acquiredAt).toBeGreaterThanOrEqual(before);
    expect(acquiredAt).toBeLessThanOrEqual(after);
    expect(acquiredAt).not.toBe(delayedScheduledTime.getTime());
  });
});
