CREATE TABLE consumption_events (
  id TEXT PRIMARY KEY,
  recipe_id INTEGER NOT NULL,
  changes_json TEXT NOT NULL,
  undone INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX consumption_events_created_at_idx ON consumption_events(created_at DESC);
