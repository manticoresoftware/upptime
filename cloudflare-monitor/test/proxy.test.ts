import { describe, expect, it } from "vitest";
import { parseProxyPath } from "../src/proxy";

describe("status data proxy allowlist", () => {
  it("allows only the master summary", () => {
    expect(parseProxyPath("/raw/manticoresoftware/upptime/master/history/summary.json")).toEqual({
      contentPath: "history/summary.json",
      cacheSeconds: 60,
    });
    expect(parseProxyPath("/raw/manticoresoftware/upptime/other/history/summary.json")).toBeNull();
  });

  it("allows generated response-time graphs", () => {
    expect(
      parseProxyPath("/raw/manticoresoftware/upptime/master/graphs/catalog-demo/response-time-week.png"),
    ).toEqual({ contentPath: "graphs/catalog-demo/response-time-week.png", cacheSeconds: 300 });
    expect(parseProxyPath("/raw/manticoresoftware/upptime/master/graphs/catalog-demo/response-time.png")).toEqual({
      contentPath: "graphs/catalog-demo/response-time.png",
      cacheSeconds: 300,
    });
  });

  it("rejects arbitrary repository files and traversal", () => {
    const rejected = [
      "/raw/manticoresoftware/upptime/master/.upptimerc.yml",
      "/raw/manticoresoftware/upptime/master/history/manual.yml",
      "/raw/manticoresoftware/upptime/master/graphs/../.upptimerc.yml",
      "/raw/other/repo/master/history/summary.json",
    ];
    for (const path of rejected) expect(parseProxyPath(path)).toBeNull();
  });
});
