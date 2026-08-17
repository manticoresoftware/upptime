export interface MonitorCheck {
  slug: string;
  name: string;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  expectedStatus?: number[];
  bodyContains?: string;
  locationStartsWith?: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  everyMinutes?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BODY_BYTES = 128 * 1024;

const page = (
  slug: string,
  name: string,
  url: string,
  bodyContains: string,
  overrides: Partial<MonitorCheck> = {},
): MonitorCheck => ({
  slug,
  name,
  url,
  bodyContains,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
  ...overrides,
});

export const CHECKS: MonitorCheck[] = [
  {
    slug: "slack-community",
    name: "Slack Community",
    url: "https://slack.manticoresearch.com",
    expectedStatus: [302],
    locationStartsWith: "https://join.slack.com/t/manticore-community/",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  page("manual", "Manual", "https://manual.manticoresearch.com/", "Manticore Search Manual"),
  page("manual-dev", "Manual (dev)", "https://manual.manticoresearch.com/dev/", "Manticore Search Manual"),
  page("playground", "Playground", "https://play.manticoresearch.com/", "Try Manticore Search online"),
  page(
    "did-you-mean-playground",
    "Did You Mean Playground",
    "https://play.manticoresearch.com/didyoumean/",
    "Did you mean?",
  ),
  page(
    "mysql-playground",
    "MySQL Playground",
    "https://play.manticoresearch.com/mysql/",
    "Indexing data from MySQL example",
  ),
  page("package-repository", "Package Repository", "https://repo.manticoresearch.com", "GPG-KEY-manticore"),
  page("community-forum", "Community Forum", "https://forum.manticoresearch.com", "<title>Manticore</title>"),
  page(
    "documentation",
    "Documentation",
    "https://docs.manticoresearch.com/latest/html/",
    "Manticore Search latest documentation",
  ),
  page("chat", "Chat", "https://chat.manticoresearch.com", "Manticore Shop Demo"),
  page("facet-demo", "Facet Demo", "https://facet.manticoresearch.com", "Flexible Faceted Search"),
  page(
    "image-search-demo",
    "Image Search Demo",
    "https://image.manticoresearch.com",
    "Manticore Reverse Image Search",
  ),
  page(
    "github",
    "GitHub",
    "https://github.manticoresearch.com",
    "Manticore Github Issue Search Demo",
  ),
  page("catalog-demo", "Catalog Demo", "https://catalog.manticoresearch.com", "Manticore Catalog Demo"),
  page(
    "facet-demo-search",
    "Facet Demo Search",
    "https://facet.manticoresearch.com/healthz",
    '"title":"Northstar Velocity Runner"',
    { everyMinutes: 5, maxBodyBytes: 16 * 1024 },
  ),
  page(
    "catalog-search",
    "Catalog Search",
    "https://catalog.manticoresearch.com/?q=Tigris&limit=20&page=1",
    "Tigris and Euphrates",
    { everyMinutes: 5 },
  ),
  page(
    "catalog-autocomplete",
    "Catalog Autocomplete",
    "https://catalog.manticoresearch.com/api/autocomplete?term=Tigris&limit=5",
    '"suggestion": "tigris"',
    { everyMinutes: 5, maxBodyBytes: 16 * 1024 },
  ),
];
