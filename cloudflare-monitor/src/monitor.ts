import type { MonitorCheck } from "./checks";

export interface CheckResult {
  slug: string;
  name: string;
  url: string;
  up: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  error: string | null;
  attempts: number;
}

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const readUntil = async (response: Response, needle: string, maxBytes: number): Promise<boolean> => {
  if (!response.body) return false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (text.includes(needle)) return true;
      // Keep enough text to catch a marker split between chunks without retaining
      // the entire response in Worker memory.
      if (text.length > needle.length + 16_384) text = text.slice(-(needle.length + 16_384));
    }
    text += decoder.decode();
    return text.includes(needle);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
};

const expectedStatus = (check: MonitorCheck, status: number): boolean =>
  check.expectedStatus?.includes(status) ?? (status >= 200 && status < 300);

export const checkOnce = async (check: MonitorCheck, fetcher: Fetcher = fetch): Promise<CheckResult> => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), check.timeoutMs ?? 10_000);

  try {
    const response = await fetcher(check.url, {
      method: check.method ?? "GET",
      headers: {
        "User-Agent": "manticoresoftware/upptime-cloudflare-monitor",
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        ...check.headers,
      },
      body: check.body,
      redirect: "manual",
      signal: controller.signal,
    });
    const responseTimeMs = Date.now() - started;

    if (!expectedStatus(check, response.status)) {
      return {
        slug: check.slug,
        name: check.name,
        url: check.url,
        up: false,
        statusCode: response.status,
        responseTimeMs,
        error: `unexpected HTTP ${response.status}`,
        attempts: 1,
      };
    }

    if (check.locationStartsWith) {
      const location = response.headers.get("location") ?? "";
      if (!location.startsWith(check.locationStartsWith)) {
        return {
          slug: check.slug,
          name: check.name,
          url: check.url,
          up: false,
          statusCode: response.status,
          responseTimeMs,
          error: "unexpected redirect target",
          attempts: 1,
        };
      }
    }

    if (check.bodyContains) {
      const found = await readUntil(response, check.bodyContains, check.maxBodyBytes ?? 128 * 1024);
      if (!found) {
        return {
          slug: check.slug,
          name: check.name,
          url: check.url,
          up: false,
          statusCode: response.status,
          responseTimeMs,
          error: "expected response text missing",
          attempts: 1,
        };
      }
    }

    return {
      slug: check.slug,
      name: check.name,
      url: check.url,
      up: true,
      statusCode: response.status,
      responseTimeMs,
      error: null,
      attempts: 1,
    };
  } catch (error) {
    return {
      slug: check.slug,
      name: check.name,
      url: check.url,
      up: false,
      statusCode: null,
      responseTimeMs: Date.now() - started,
      error: controller.signal.aborted ? "request timed out" : error instanceof Error ? error.message : String(error),
      attempts: 1,
    };
  } finally {
    clearTimeout(timer);
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const checkWithRetry = async (
  check: MonitorCheck,
  fetcher: Fetcher = fetch,
  retryDelayMs = 1_500,
): Promise<CheckResult> => {
  const first = await checkOnce(check, fetcher);
  if (first.up) return first;
  if (retryDelayMs > 0) await sleep(retryDelayMs);
  const second = await checkOnce(check, fetcher);
  return { ...second, attempts: 2 };
};

export const runInBatches = async (
  checks: MonitorCheck[],
  batchSize = 6,
  run: (check: MonitorCheck) => Promise<CheckResult> = (check) => checkWithRetry(check),
): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];
  for (let index = 0; index < checks.length; index += batchSize) {
    results.push(...(await Promise.all(checks.slice(index, index + batchSize).map(run))));
  }
  return results;
};
