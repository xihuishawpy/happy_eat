import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "../worker/index.js";

test("Cloudflare Worker supports auth, app routes, and production mutations", async () => {
  const database = createDatabase();
  const env = createEnv(database);

  try {
    const denied = await callWorker(env, "/api/app", { auth: false });
    assert.equal(denied.status, 401);

    const session = await callWorker(env, "/api/session", {
      method: "POST",
      auth: false,
      body: { accessCode: "test-family" },
    });
    assert.equal(session.status, 200);

    const app = await callWorker(env, "/api/app/");
    assert.equal(app.status, 200);
    assert.equal(app.payload.matches.ready[0].title, "番茄炒蛋");

    const created = await callWorker(env, "/api/ingredients", {
      method: "POST",
      body: { name: "冬瓜", category: "蔬菜", state: "priority" },
    });
    const ingredient = created.payload.ingredients.find((item) => item.name === "冬瓜");
    assert.equal(created.status, 200);
    assert.equal(ingredient.state, "priority");

    const duplicate = await callWorker(env, "/api/ingredients", {
      method: "POST",
      body: { name: "冬瓜", category: "蔬菜" },
    });
    assert.equal(duplicate.status, 409);

    const conflictingRename = await callWorker(env, `/api/ingredients/${ingredient.id}`, {
      method: "PATCH",
      body: { name: "番茄", category: "蔬菜" },
    });
    assert.equal(conflictingRename.status, 409);

    const updated = await callWorker(env, `/api/ingredients/${ingredient.id}`, {
      method: "PATCH",
      body: { name: "南瓜", category: "蔬菜", state: "frozen" },
    });
    assert.equal(updated.payload.ingredients.some((item) => item.name === "南瓜"), true);

    const recipe = updated.payload.matches.ready[0];
    const saved = await callWorker(env, `/api/recipes/${recipe.id}`, {
      method: "PATCH",
      body: {
        title: "家常番茄炒蛋",
        method: "炒",
        minutes: 12,
        preferenceWarning: "",
        ingredients: [
          { name: "番茄", quantityLabel: "2个", required: true },
          { name: "鸡蛋", quantityLabel: "3个", required: true },
        ],
        steps: ["番茄切块。", "鸡蛋炒熟后加入番茄。"],
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.payload.recipe.title, "家常番茄炒蛋");

    const removed = await callWorker(env, `/api/recipes/${recipe.id}`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    assert.equal(removed.payload.matches.ready.length + removed.payload.matches.missing.length, 0);

    const nonNumericDelete = await callWorker(env, "/api/ingredients/not-a-number", { method: "DELETE" });
    assert.equal(nonNumericDelete.status, 200);
  } finally {
    database.close();
  }
});

test("Cloudflare Worker enforces public request boundaries", async () => {
  const database = createDatabase();
  const env = createEnv(database);

  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await callWorker(env, "/api/session", {
        method: "POST",
        auth: false,
        body: { accessCode: "wrong" },
      });
      assert.equal(response.status, 401);
    }
    const limited = await callWorker(env, "/api/session", {
      method: "POST",
      auth: false,
      body: { accessCode: "wrong" },
    });
    assert.equal(limited.status, 429);

    const oversized = await worker.fetch(new Request("https://example.test/api/ingredients", {
      method: "POST",
      headers: { Authorization: "Bearer test-family", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(12 * 1024 * 1024) }),
    }), env);
    assert.equal(oversized.status, 413);

    const privateWebPage = await callWorker(env, "/api/drafts/analyze", {
      method: "POST",
      body: { sourceType: "web", content: "http://127.0.0.1/recipe" },
    });
    assert.equal(privateWebPage.status, 422);
  } finally {
    database.close();
  }
});

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(fs.readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  database.exec(`
    INSERT INTO ingredients (name, category, state) VALUES ('番茄', '蔬菜', 'none'), ('鸡蛋', '肉禽蛋', 'none');
    INSERT INTO recipes (title, method, minutes, status) VALUES ('番茄炒蛋', '炒', 15, 'formal');
    INSERT INTO recipe_ingredients (recipe_id, name, quantity_label, required)
      VALUES (1, '番茄', '2个', 1), (1, '鸡蛋', '2个', 1);
    INSERT INTO recipe_steps (recipe_id, position, text) VALUES (1, 1, '炒熟。');
  `);
  return database;
}

function createEnv(database) {
  let attempts = 0;
  return {
    DB: new D1Database(database),
    FAMILY_ACCESS_CODE: "test-family",
    DASHSCOPE_API_KEY: "",
    LOGIN_RATE_LIMITER: {
      async limit() {
        attempts += 1;
        return { success: attempts <= 10 };
      },
    },
    ASSETS: { fetch: () => new Response("asset") },
  };
}

async function callWorker(env, pathname, options = {}) {
  const response = await worker.fetch(new Request(`https://example.test${pathname}`, {
    method: options.method || "GET",
    headers: {
      ...(options.auth === false ? {} : { Authorization: "Bearer test-family" }),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }), env);
  return { status: response.status, payload: await response.json() };
}

class D1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1PreparedStatement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.execute());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class D1PreparedStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1PreparedStatement(this.database, this.sql, values);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    return mutationResult(this.database.prepare(this.sql).run(...this.values));
  }

  execute() {
    if (/^\s*(SELECT|PRAGMA)/i.test(this.sql)) {
      return { results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } };
    }
    return mutationResult(this.database.prepare(this.sql).run(...this.values));
  }
}

function mutationResult(result) {
  return { results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
}
