import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { api, startTestServer } from "./helpers/server.js";

test("家庭访问码 protects family-space API", async () => {
  const server = await startTestServer();

  try {
    const denied = await fetch(`${server.baseUrl}/api/app`);
    assert.equal(denied.status, 401);

    const accepted = await fetch(`${server.baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode: server.accessCode }),
    });
    const payload = await accepted.json();

    assert.equal(accepted.status, 200);
    assert.equal(payload.token, server.accessCode);
  } finally {
    await server.stop();
  }
});

test("食材清单更新 changes 可做菜谱 and 待补食材菜谱", async () => {
  const server = await startTestServer();

  try {
    const cleared = await api(server, "/api/ingredients/batch", {
      method: "POST",
      body: { text: "豆腐、豆瓣酱、花生、黄瓜、干辣椒" },
    });

    assert.equal(cleared.response.status, 200);
    assert.equal(cleared.payload.ingredients.some((item) => item.name === "豆腐"), true);

    const readyTitles = cleared.payload.matches.ready.map((recipe) => recipe.title);
    const missingTitles = cleared.payload.matches.missing.map((recipe) => recipe.title);

    assert.equal(readyTitles.includes("麻婆豆腐"), true);
    assert.equal(readyTitles.includes("宫保鸡丁"), true);
    assert.equal(missingTitles.includes("麻婆豆腐"), false);
  } finally {
    await server.stop();
  }
});

test("食材状态 can be updated and ingredients can be removed", async () => {
  const server = await startTestServer();

  try {
    const created = await api(server, "/api/ingredients", {
      method: "POST",
      body: {
        name: "冬瓜",
        category: "蔬菜",
        quantityLabel: "半个",
        state: "priority",
      },
    });
    assert.equal(created.response.status, 200);

    const winterMelon = created.payload.ingredients.find((item) => item.name === "冬瓜");
    assert.deepEqual(
      {
        category: winterMelon.category,
        state: winterMelon.state,
      },
      {
        category: "蔬菜",
        state: "priority",
      },
    );
    assert.equal(Object.hasOwn(winterMelon, "quantityLabel"), false);

    const updated = await api(server, `/api/ingredients/${winterMelon.id}`, {
      method: "PATCH",
      body: {
        name: "贝贝南瓜",
        category: "其他",
        quantityLabel: "1个",
        state: "frozen",
      },
    });
    assert.equal(updated.response.status, 200);
    assert.deepEqual(
      updated.payload.ingredients.find((item) => item.id === winterMelon.id),
      {
        id: winterMelon.id,
        name: "贝贝南瓜",
        category: "其他",
        state: "frozen",
      },
    );

    const removed = await api(server, `/api/ingredients/${winterMelon.id}`, {
      method: "DELETE",
    });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload.ingredients.some((item) => item.id === winterMelon.id), false);
  } finally {
    await server.stop();
  }
});

test("菜谱导入 creates 草稿 and confirming it makes it a 正式菜谱", async () => {
  const server = await startTestServer();

  try {
    const empty = await api(server, "/api/drafts/analyze", {
      method: "POST",
      body: { sourceType: "text", content: "" },
    });
    assert.equal(empty.response.status, 422);

    const initial = await api(server, "/api/app");
    const seededRecipe = [...initial.payload.matches.ready, ...initial.payload.matches.missing]
      .find((recipe) => recipe.title === "番茄炒蛋");
    assert.equal(seededRecipe.ingredients.some((item) => item.quantityLabel), true);

    const analyzed = await api(server, "/api/drafts/analyze", {
      method: "POST",
      body: {
        sourceType: "text",
        content: "丝瓜鸡蛋豆腐虾。丝瓜2根、鸡蛋1个。先翻炒丝瓜，再煎鸡蛋，加开水，下豆腐和虾，加少许盐和生抽，煮 3-5 分钟即可。",
      },
    });

    assert.equal(analyzed.response.status, 200);
    assert.equal(analyzed.payload.draft.status, "draft");
    assert.equal(analyzed.payload.draft.ingredients.some((item) => item.name === "丝瓜"), true);
    assert.equal(analyzed.payload.draft.ingredients.some((item) => item.quantityLabel === "2根"), true);

    const updated = await api(server, `/api/drafts/${analyzed.payload.draft.id}`, {
      method: "PATCH",
      body: {
        title: "丝瓜鲜虾汤",
        method: "煮",
        minutes: 18,
        preferenceWarning: "",
        ingredients: [
          { name: "丝瓜", quantityLabel: "3根", required: true },
          { name: "虾", quantityLabel: "200克", required: true },
        ],
        steps: ["丝瓜切块。", "加水煮熟后放入鲜虾。"],
      },
    });

    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload.draft.title, "丝瓜鲜虾汤");
    assert.equal(updated.payload.draft.minutes, 18);
    assert.equal(updated.payload.draft.ingredients.some((item) => item.quantityLabel === "3根"), true);
    assert.equal(
      [...updated.payload.app.matches.ready, ...updated.payload.app.matches.missing]
        .some((recipe) => recipe.id === analyzed.payload.draft.id),
      false,
    );

    const confirmed = await api(server, `/api/drafts/${analyzed.payload.draft.id}/confirm`, {
      method: "POST",
    });

    assert.equal(confirmed.response.status, 200);
    assert.equal(confirmed.payload.savedRecipeId, analyzed.payload.draft.id);
    assert.equal(confirmed.payload.app.drafts.some((draft) => draft.id === analyzed.payload.draft.id), false);

    const savedRecipe = [...confirmed.payload.app.matches.ready, ...confirmed.payload.app.matches.missing]
      .find((recipe) => recipe.id === analyzed.payload.draft.id);

    assert.equal(savedRecipe.status, "formal");
    assert.equal(savedRecipe.title, "丝瓜鲜虾汤");
    assert.equal(savedRecipe.ingredients.some((item) => item.quantityLabel === "3根"), true);
    assert.equal(savedRecipe.steps.length > 0, true);
  } finally {
    await server.stop();
  }
});

test("LLM can generate a recipe draft from available ingredients", async () => {
  let requestBody;
  let responseRecipe = {
    title: "番茄炒蛋",
    method: "炒",
    minutes: 15,
    preferenceWarning: "",
    requiredIngredients: [
      { name: "番茄", quantityLabel: "2个" },
      { name: "鸡蛋", quantityLabel: "2个" },
    ],
    optionalIngredients: [{ name: "生抽", quantityLabel: "1勺" }],
    steps: ["番茄切块，鸡蛋打散。", "鸡蛋炒熟后加入番茄。"],
  };
  const llm = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify(responseRecipe),
          },
        }],
      }));
    });
  });
  llm.listen(0, "127.0.0.1");
  await once(llm, "listening");

  const server = await startTestServer({
    env: {
      DASHSCOPE_API_KEY: "test-key",
      DASHSCOPE_BASE_URL: `http://127.0.0.1:${llm.address().port}`,
      DASHSCOPE_TEXT_MODEL: "test-model",
    },
  });

  try {
    const generated = await api(server, "/api/recipes/generate", { method: "POST" });

    assert.equal(generated.response.status, 200);
    assert.equal(generated.payload.draft.title, "番茄炒蛋");
    assert.equal(generated.payload.draft.sourceType, "generated");
    assert.equal(generated.payload.draft.status, "draft");
    assert.equal(generated.payload.draft.ingredients.some((item) => item.name === "番茄"), true);
    assert.equal(requestBody.model, "test-model");
    assert.match(requestBody.messages[1].content, /现有食材/);

    responseRecipe = { ...responseRecipe, requiredIngredients: [{ name: "牛肉", quantityLabel: "200克" }] };
    const hallucinated = await api(server, "/api/recipes/generate", { method: "POST" });
    assert.equal(hallucinated.response.status, 502);
    assert.equal((await api(server, "/api/app")).payload.drafts.length, 1);
  } finally {
    await server.stop();
    llm.close();
    await once(llm, "close");
  }
});

test("正式菜谱 can be edited and deleted", async () => {
  const server = await startTestServer();

  try {
    const initial = await api(server, "/api/app");
    const recipe = [...initial.payload.matches.ready, ...initial.payload.matches.missing]
      .find((item) => item.title === "番茄炒蛋");

    const updated = await api(server, `/api/recipes/${recipe.id}`, {
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

    assert.equal(updated.response.status, 200);
    const saved = [...updated.payload.app.matches.ready, ...updated.payload.app.matches.missing]
      .find((item) => item.id === recipe.id);
    assert.equal(saved.title, "家常番茄炒蛋");
    assert.equal(saved.minutes, 12);
    assert.equal(saved.ingredients.some((item) => item.quantityLabel === "3个"), true);

    const removed = await api(server, `/api/recipes/${recipe.id}`, { method: "DELETE" });
    assert.equal(removed.response.status, 200);
    assert.equal(
      [...removed.payload.matches.ready, ...removed.payload.matches.missing]
        .some((item) => item.id === recipe.id),
      false,
    );

    const database = new DatabaseSync(server.databasePath);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM recipe_ingredients WHERE recipe_id = ?").get(recipe.id).count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM recipe_steps WHERE recipe_id = ?").get(recipe.id).count, 0);
    database.close();
  } finally {
    await server.stop();
  }
});
