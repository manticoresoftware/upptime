export type StableState = "unknown" | "up" | "down";

export interface StoredState {
  slug: string;
  name: string;
  url: string;
  state: StableState;
  failure_streak: number;
  success_streak: number;
  last_changed_at: string | null;
  last_error: string | null;
  status_code: number | null;
  response_time_ms: number | null;
}

export interface Observation {
  up: boolean;
  error: string | null;
  statusCode: number | null;
  responseTimeMs: number;
}

export interface StateDecision {
  state: StableState;
  failureStreak: number;
  successStreak: number;
  transitioned: boolean;
  shouldDispatch: boolean;
}

export const decideState = (
  current: Pick<StoredState, "state" | "failure_streak" | "success_streak"> | undefined,
  observation: Observation,
  failureThreshold = 2,
  recoveryThreshold = 2,
): StateDecision => {
  const previous = current?.state ?? "unknown";
  let state = previous;
  let failureStreak = current?.failure_streak ?? 0;
  let successStreak = current?.success_streak ?? 0;

  if (observation.up) {
    failureStreak = 0;
    successStreak = Math.min(recoveryThreshold, successStreak + 1);
    if (previous === "unknown" || (previous === "down" && successStreak >= recoveryThreshold)) {
      state = "up";
    }
  } else {
    successStreak = 0;
    failureStreak = Math.min(failureThreshold, failureStreak + 1);
    if (failureStreak >= failureThreshold) state = "down";
  }

  const transitioned = state !== previous;
  return {
    state,
    failureStreak,
    successStreak,
    transitioned,
    // Bootstrap success is expected and should not trigger Upptime. Bootstrap
    // failure must be dispatched so an already-broken service is discovered.
    shouldDispatch: transitioned && (previous !== "unknown" || state === "down"),
  };
};
