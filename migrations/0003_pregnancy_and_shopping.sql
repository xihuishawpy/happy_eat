ALTER TABLE ingredients ADD COLUMN pregnancy_level TEXT NOT NULL DEFAULT '';
ALTER TABLE ingredients ADD COLUMN pregnancy_note TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS app_state_kv (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
