import assert from "node:assert/strict";
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
