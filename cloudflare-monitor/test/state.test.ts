import { describe, expect, it } from "vitest";
import { decideState, type Observation, type StoredState } from "../src/state";

const up: Observation = { up: true, error: null, statusCode: 200, responseTimeMs: 10 };
const down: Observation = { up: false, error: "timeout", statusCode: null, responseTimeMs: 10_000 };

const state = (overrides: Partial<StoredState> = {}): StoredState => ({
  slug: "example",
  name: "Example",
  url: "https://example.com",
  state: "up",
  failure_streak: 0,
  success_streak: 2,
  last_changed_at: null,
  last_error: null,
  status_code: 200,
  response_time_ms: 10,
  ...overrides,
});

describe("state transitions", () => {
  it("bootstraps a healthy check without dispatching", () => {
    expect(decideState(undefined, up)).toMatchObject({ state: "up", transitioned: true, shouldDispatch: false });
  });

  it("requires two consecutive failures", () => {
    const first = decideState(state(), down);
    expect(first).toMatchObject({ state: "up", failureStreak: 1, shouldDispatch: false });
    const second = decideState(state({ failure_streak: 1, success_streak: 0 }), down);
    expect(second).toMatchObject({ state: "down", failureStreak: 2, shouldDispatch: true });
  });

  it("requires two consecutive successes to recover", () => {
    const first = decideState(state({ state: "down", failure_streak: 2, success_streak: 0 }), up);
    expect(first).toMatchObject({ state: "down", successStreak: 1, shouldDispatch: false });
    const second = decideState(state({ state: "down", failure_streak: 0, success_streak: 1 }), up);
    expect(second).toMatchObject({ state: "up", successStreak: 2, shouldDispatch: true });
  });

  it("dispatches an outage found during bootstrap", () => {
    const first = decideState(undefined, down);
    const second = decideState(
      state({ state: "unknown", failure_streak: first.failureStreak, success_streak: 0 }),
      down,
    );
    expect(second).toMatchObject({ state: "down", shouldDispatch: true });
  });
});
