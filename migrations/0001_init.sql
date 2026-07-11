CREATE TABLE ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  quantity_label TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'none'
);

CREATE TABLE recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  method TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  preference_warning TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'formal',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  quantity_label TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE recipe_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX recipe_ingredients_recipe_id_idx ON recipe_ingredients(recipe_id);
CREATE INDEX recipe_steps_recipe_id_position_idx ON recipe_steps(recipe_id, position);
CREATE INDEX recipes_status_id_idx ON recipes(status, id DESC);
