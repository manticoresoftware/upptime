export interface ProxyTarget {
  contentPath: string;
  cacheSeconds: number;
}

const SUMMARY = "history/summary.json";
const GRAPH = /^graphs\/[a-z0-9-]+\/response-time(?:-(?:day|week|month|year))?\.png$/;

export const parseProxyPath = (pathname: string): ProxyTarget | null => {
  const prefix = "/raw/manticoresoftware/upptime/master/";
  if (!pathname.startsWith(prefix)) return null;
  const contentPath = pathname.slice(prefix.length);
  if (contentPath === SUMMARY) return { contentPath, cacheSeconds: 60 };
  if (GRAPH.test(contentPath)) return { contentPath, cacheSeconds: 300 };
  return null;
};

export const normalizedCacheKey = (request: Request): Request => {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return new Request(url.toString(), { method: "GET" });
};

const responseHeaders = (upstream: Response, target: ProxyTarget): Headers => {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": `public, max-age=${target.cacheSeconds}, stale-while-revalidate=300`,
    "Content-Type": target.contentPath.endsWith(".png") ? "image/png" : "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  const etag = upstream.headers.get("etag");
  if (etag) headers.set("ETag", etag);
  return headers;
};

export const proxyUpptimeData = async (
  request: Request,
  githubToken: string | undefined,
  ctx: ExecutionContext,
): Promise<Response | null> => {
  const target = parseProxyPath(new URL(request.url).pathname);
  if (!target) return null;
  if (!githubToken) return Response.json({ status: "unavailable" }, { status: 503 });

  const cache = (caches as CacheStorage & { default: Cache }).default;
  const cacheKey = normalizedCacheKey(request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const encodedPath = target.contentPath.split("/").map(encodeURIComponent).join("/");
  const upstream = await fetch(
    `https://api.github.com/repos/manticoresoftware/upptime/contents/${encodedPath}?ref=master`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "manticoresoftware/upptime-cloudflare-monitor",
      },
    },
  );
  if (!upstream.ok) {
    console.error("GitHub status-data proxy failed", { path: target.contentPath, status: upstream.status });
    return Response.json({ status: "upstream-error" }, { status: 502 });
  }

  const response = new Response(upstream.body, {
    status: 200,
    headers: responseHeaders(upstream, target),
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
