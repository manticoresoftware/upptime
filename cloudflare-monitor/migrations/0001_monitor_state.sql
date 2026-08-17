CREATE TABLE monitor_state (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('unknown', 'up', 'down')),
  failure_streak INTEGER NOT NULL DEFAULT 0,
  success_streak INTEGER NOT NULL DEFAULT 0,
  last_changed_at TEXT,
  last_error TEXT,
  status_code INTEGER,
  response_time_ms INTEGER
);

CREATE TABLE monitor_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
