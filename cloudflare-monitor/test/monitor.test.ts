import { describe, expect, it } from "vitest";
import { checkOnce, checkWithRetry, runInBatches } from "../src/monitor";
import type { MonitorCheck } from "../src/checks";

const check: MonitorCheck = {
  slug: "example",
  name: "Example",
  url: "https://example.com",
  bodyContains: "expected marker",
};

describe("HTTP monitoring", () => {
  it("accepts the expected status and response marker", async () => {
    const result = await checkOnce(check, async () => new Response("before expected marker after", { status: 200 }));
    expect(result).toMatchObject({ up: true, statusCode: 200, attempts: 1 });
  });

  it("rejects an unexpected status", async () => {
    const result = await checkOnce(check, async () => new Response("expected marker", { status: 503 }));
    expect(result).toMatchObject({ up: false, statusCode: 503, error: "unexpected HTTP 503" });
  });

  it("rejects a successful response without its marker", async () => {
    const result = await checkOnce(check, async () => new Response("wrong application", { status: 200 }));
    expect(result).toMatchObject({ up: false, error: "expected response text missing" });
  });

  it("validates Slack-style redirect targets", async () => {
    const redirectCheck: MonitorCheck = {
      ...check,
      bodyContains: undefined,
      expectedStatus: [302],
      locationStartsWith: "https://join.slack.com/t/manticore-community/",
    };
    const good = await checkOnce(
      redirectCheck,
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://join.slack.com/t/manticore-community/shared_invite/abc" },
        }),
    );
    const bad = await checkOnce(
      redirectCheck,
      async () => new Response(null, { status: 302, headers: { Location: "https://example.com/" } }),
    );
    expect(good.up).toBe(true);
    expect(bad).toMatchObject({ up: false, error: "unexpected redirect target" });
  });

  it("retries a failed observation once", async () => {
    let calls = 0;
    const result = await checkWithRetry(
      check,
      async () => new Response(++calls === 1 ? "bad" : "expected marker", { status: 200 }),
      0,
    );
    expect(result).toMatchObject({ up: true, attempts: 2 });
    expect(calls).toBe(2);
  });

  it("limits each outbound batch to six checks", async () => {
    let active = 0;
    let maxActive = 0;
    const checks = Array.from({ length: 14 }, (_, index) => ({ ...check, slug: `check-${index}` }));
    const results = await runInBatches(checks, 6, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        slug: item.slug,
        name: item.name,
        url: item.url,
        up: true,
        statusCode: 200,
        responseTimeMs: 5,
        error: null,
        attempts: 1,
      };
    });
    expect(results).toHaveLength(14);
    expect(maxActive).toBe(6);
  });
});
