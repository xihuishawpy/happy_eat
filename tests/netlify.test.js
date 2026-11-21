import assert from "node:assert/strict";
import test from "node:test";
import { createApiHandler } from "../netlify/functions/api.mjs";

test("Netlify Function supports auth, seed initialization, and CRUD mutations", async () => {
  const store = new MemoryBlobStore();
  const handler = createApiHandler({
    store,
    env: { FAMILY_ACCESS_CODE: "test-family", DASHSCOPE_API_KEY: "" },
  });

  const denied = await callApi(handler, "/api/app", { auth: false });
  assert.equal(denied.status, 401);

  const session = await callApi(handler, "/api/session", {
    method: "POST",
    auth: false,
    body: { accessCode: "test-family" },
  });
  assert.equal(session.status, 200);
  assert.equal(session.payload.token, "test-family");

  const app = await callApi(handler, "/api/app/");
  assert.equal(app.status, 200);
  assert.equal(app.payload.matches.ready.some((item) => item.title === "番茄炒蛋"), true);

  const created = await callApi(handler, "/api/ingredients", {
    method: "POST",
    body: { name: "冬瓜", category: "蔬菜", state: "priority" },
  });
  assert.equal(created.status, 200);
  const ingredient = created.payload.ingredients.find((item) => item.name === "冬瓜");
  assert.equal(ingredient.state, "priority");
  assert.equal(Object.hasOwn(ingredient, "quantityLabel"), false);

  const duplicate = await callApi(handler, "/api/ingredients", {
    method: "POST",
    body: { name: "冬瓜", category: "蔬菜" },
  });
  assert.equal(duplicate.status, 409);

  const updated = await callApi(handler, `/api/ingredients/${ingredient.id}`, {
    method: "PATCH",
    body: { name: "南瓜", category: "蔬菜", state: "frozen" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.ingredients.some((item) => item.name === "南瓜" && item.state === "frozen"), true);

  const batched = await callApi(handler, "/api/ingredients/batch", {
    method: "POST",
    body: { text: "冰箱里有西红柿2个快过期、豆腐1盒" },
  });
  assert.equal(batched.status, 200);
  assert.equal(batched.payload.ingredients.some((item) => item.name === "豆腐"), true);

  const analyzed = await callApi(handler, "/api/drafts/analyze", {
    method: "POST",
    body: { sourceType: "text", content: "《丝瓜炒蛋》丝瓜1根、鸡蛋2个。1.丝瓜切滚刀块。2.热锅炒鸡蛋后放丝瓜炒熟。" },
  });
  assert.equal(analyzed.status, 200);
  const draftId = analyzed.payload.draft.id;

  const editedDraft = await callApi(handler, `/api/drafts/${draftId}`, {
    method: "PATCH",
    body: {
      title: "清炒丝瓜蛋",
      method: "炒",
      minutes: 10,
      preferenceWarning: "",
      ingredients: [
        { name: "丝瓜", quantityLabel: "1根", required: true },
        { name: "鸡蛋", quantityLabel: "2个", required: true },
      ],
      steps: ["丝瓜切块。", "鸡蛋与丝瓜同炒出锅。"],
    },
  });
  assert.equal(editedDraft.status, 200);
  assert.equal(editedDraft.payload.draft.title, "清炒丝瓜蛋");

  const confirmed = await callApi(handler, `/api/drafts/${draftId}/confirm`, { method: "POST" });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.payload.savedRecipeId, draftId);

  const removed = await callApi(handler, `/api/recipes/${draftId}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.equal(
    [...removed.payload.matches.ready, ...removed.payload.matches.missing].some((item) => item.id === draftId),
    false,
  );
});

test("Netlify draft deletion persists, retries conflicts, and protects formal recipes", async () => {
  const store = new MemoryBlobStore();
  const handler = createApiHandler({ store, env: { FAMILY_ACCESS_CODE: "test-family", DASHSCOPE_API_KEY: "" } });
  const analyzed = await callApi(handler, "/api/drafts/analyze", {
    method: "POST",
    body: { sourceType: "text", content: "《丝瓜炒蛋》丝瓜1根、鸡蛋2个。1.丝瓜切块。2.鸡蛋与丝瓜炒熟。" },
  });
  const draftId = analyzed.payload.draft.id;
  const before = analyzed.payload.app;
  const formalId = before.matches.ready[0].id;
  assert.equal((await callApi(handler, `/api/drafts/${formalId}`, { method: "DELETE" })).status, 404);
  assert.equal((await callApi(handler, `/api/drafts/${draftId}`, { method: "DELETE", auth: false })).status, 401);
  store.failFirstMatchCount = 1;
  const removed = await callApi(handler, `/api/drafts/${draftId}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.equal(removed.payload.drafts.some((item) => item.id === draftId), false);
  const reloaded = await callApi(handler, "/api/app");
  assert.deepEqual(reloaded.payload.drafts, []);
  assert.deepEqual(reloaded.payload.matches, before.matches);
  assert.deepEqual(reloaded.payload.ingredients, before.ingredients);
  assert.equal((await callApi(handler, `/api/drafts/${draftId}`, { method: "DELETE" })).status, 404);
  assert.equal((await callApi(handler, `/api/drafts/${draftId}/confirm`, { method: "POST" })).status, 404);
});

test("Netlify Function enforces rate limits, SSRF, and missing config boundaries", async () => {
  const store = new MemoryBlobStore();
  const unconfigured = createApiHandler({ store, env: { FAMILY_ACCESS_CODE: "" } });
  const missingCode = await callApi(unconfigured, "/api/app");
  assert.equal(missingCode.status, 503);

  const handler = createApiHandler({
    store,
    env: { FAMILY_ACCESS_CODE: "test-family", DASHSCOPE_API_KEY: "" },
  });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const failed = await callApi(handler, "/api/session", {
      method: "POST",
      auth: false,
      body: { accessCode: "wrong" },
    });
    assert.equal(failed.status, 401);
  }
  const limited = await callApi(handler, "/api/session", {
    method: "POST",
    auth: false,
    body: { accessCode: "wrong" },
  });
  assert.equal(limited.status, 429);

  const ssrf = await callApi(handler, "/api/drafts/analyze", {
    method: "POST",
    body: { sourceType: "web", content: "http://127.0.0.1/secret" },
  });
  assert.equal(ssrf.status, 422);

  const unavailableGen = await callApi(handler, "/api/recipes/generate", {
    method: "POST",
    body: { ingredientIds: [1] },
  });
  assert.equal(unavailableGen.status, 503);

  const unavailableAsr = await callApi(handler, "/api/audio/transcriptions", {
    method: "POST",
    body: { audioDataUrl: "data:audio/wav;base64,UklGRg==" },
  });
  assert.equal(unavailableAsr.status, 503);
});

test("Netlify Function supports cooking completion, undo, AI generation, and ASR", async () => {
  const store = new MemoryBlobStore();
  const handler = createApiHandler({
    store,
    env: {
      FAMILY_ACCESS_CODE: "test-family",
      DASHSCOPE_API_KEY: "test-key",
      DASHSCOPE_TEXT_MODEL: "test-text",
      DASHSCOPE_ASR_MODEL: "test-asr",
    },
  });

  const initial = await callApi(handler, "/api/app");
  const recipe = initial.payload.matches.ready.find((item) => item.title === "番茄炒蛋");
  const completed = await callApi(handler, `/api/recipes/${recipe.id}/complete`, {
    method: "POST",
    body: {
      consumptions: [
        { name: "番茄", action: "used_up" },
        { name: "鸡蛋", action: "low" },
      ],
    },
  });
  assert.equal(completed.status, 200);
  assert.deepEqual(completed.payload.summary, { removed: 1, prioritized: 1 });
  assert.equal(completed.payload.app.ingredients.some((item) => item.name === "番茄"), false);
  assert.equal(completed.payload.app.ingredients.find((item) => item.name === "鸡蛋").state, "priority");

  const undone = await callApi(handler, `/api/consumption-events/${completed.payload.undoId}/undo`, {
    method: "POST",
  });
  assert.equal(undone.status, 200);
  assert.equal(undone.payload.app.ingredients.find((item) => item.name === "番茄").state, "expiring");
  assert.equal(undone.payload.app.ingredients.find((item) => item.name === "鸡蛋").state, "none");

  const repeatedUndo = await callApi(handler, `/api/consumption-events/${completed.payload.undoId}/undo`, {
    method: "POST",
  });
  assert.equal(repeatedUndo.status, 409);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const payload = JSON.parse(init.body);
      if (payload.model === "test-asr") {
        return Response.json({ choices: [{ message: { content: "冰箱里有番茄两个、鸡蛋三个" } }] });
      }
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "快手番茄蛋",
              method: "炒",
              minutes: 10,
              preferenceWarning: "",
              requiredIngredients: [
                { name: "番茄", quantityLabel: "2个" },
                { name: "鸡蛋", quantityLabel: "2个" },
              ],
              optionalIngredients: [{ name: "生抽", quantityLabel: "1勺" }],
              steps: ["番茄切块。", "鸡蛋炒散加入番茄炒匀。"],
            }),
          },
        }],
      });
    };

    const transcript = await callApi(handler, "/api/audio/transcriptions", {
      method: "POST",
      body: { audioDataUrl: "data:audio/wav;base64,UklGRg==" },
    });
    assert.equal(transcript.status, 200);
    assert.equal(transcript.payload.text, "冰箱里有番茄两个、鸡蛋三个");

    const tomato = undone.payload.app.ingredients.find((item) => item.name === "番茄");
    const egg = undone.payload.app.ingredients.find((item) => item.name === "鸡蛋");
    const generated = await callApi(handler, "/api/recipes/generate", {
      method: "POST",
      body: { ingredientIds: [tomato.id, egg.id] },
    });
    assert.equal(generated.status, 200);
    assert.equal(generated.payload.draft.title, "快手番茄蛋");
    assert.equal(generated.payload.draft.sourceType, "generated");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Netlify Function supports DeepSeek text, multimodal vision (deepseek-flash), and ASR (/v1/tools/asr)", async () => {
  const store = new MemoryBlobStore();
  const handler = createApiHandler({
    store,
    env: {
      FAMILY_ACCESS_CODE: "test-family",
      DEEPSEEK_API_KEY: "ds-test-key",
    },
  });

  const app = await callApi(handler, "/api/app");
  assert.equal(app.status, 200);
  assert.equal(app.payload.ai.configured, true);
  assert.equal(app.payload.ai.textModel, "deepseek-chat");
  assert.equal(app.payload.ai.visionModel, "deepseek-flash");
  assert.equal(app.payload.ai.asrConfigured, true);

  // Reject unsupported audio container for DeepSeek ASR
  const badAudio = await callApi(handler, "/api/audio/transcriptions", {
    method: "POST",
    body: { audioDataUrl: "data:audio/webm;base64,GkXfoA==" },
  });
  assert.equal(badAudio.status, 422);

  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      const urlStr = String(url);
      calls.push({ url: urlStr, init });

      if (urlStr.endsWith("/v1/tools/asr")) {
        assert.equal(init.headers.Authorization, "Bearer ds-test-key");
        assert.equal(init.body instanceof FormData, true);
        const uploaded = init.body.get("file");
        assert.equal(uploaded instanceof Blob, true);
        return Response.json({ request_id: "req-1", text: "番茄炒蛋，两个番茄三个鸡蛋，热锅翻炒", duration_ms: 2100 });
      }

      const payload = JSON.parse(init.body);
      if (payload.model === "deepseek-flash") {
        const userParts = payload.messages[1].content;
        assert.equal(Array.isArray(userParts), true);
        assert.equal(userParts[1].type, "image_url");
        return Response.json({
          choices: [{
            message: {
              content: JSON.stringify({
                title: "拍照识别番茄炒蛋",
                method: "炒",
                minutes: 12,
                preferenceWarning: "",
                requiredIngredients: [
                  { name: "番茄", quantityLabel: "2个" },
                  { name: "鸡蛋", quantityLabel: "3个" },
                ],
                optionalIngredients: [{ name: "葱花", quantityLabel: "少许" }],
                steps: ["番茄切块，鸡蛋打散。", "先炒蛋再炒番茄拌匀。"],
              }),
            },
          }],
        });
      }

      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "DeepSeek番茄蛋",
              method: "炒",
              minutes: 10,
              preferenceWarning: "",
              requiredIngredients: [
                { name: "番茄", quantityLabel: "2个" },
                { name: "鸡蛋", quantityLabel: "2个" },
              ],
              optionalIngredients: [{ name: "生抽", quantityLabel: "1勺" }],
              steps: ["番茄切块。", "鸡蛋炒熟后加入番茄翻炒。"],
            }),
          },
        }],
      });
    };

    // 1. DeepSeek ASR transcription (WAV)
    const transcript = await callApi(handler, "/api/audio/transcriptions", {
      method: "POST",
      body: { audioDataUrl: "data:audio/wav;base64,UklGRg==" },
    });
    assert.equal(transcript.status, 200);
    assert.equal(transcript.payload.text, "番茄炒蛋，两个番茄三个鸡蛋，热锅翻炒");
    assert.equal(calls.at(-1).url, "https://api.deepseek.com/v1/tools/asr");

    // 2. DeepSeek Vision recipe OCR (deepseek-flash)
    const visionDraft = await callApi(handler, "/api/drafts/analyze", {
      method: "POST",
      body: { sourceType: "image", imageDataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" },
    });
    assert.equal(visionDraft.status, 200);
    assert.equal(visionDraft.payload.draft.title, "拍照识别番茄炒蛋");
    assert.equal(calls.at(-1).url, "https://api.deepseek.com/chat/completions");
    assert.equal(JSON.parse(calls.at(-1).init.body).model, "deepseek-flash");

    // 3. DeepSeek Text recipe generation (deepseek-chat)
    const tomato = app.payload.ingredients.find((item) => item.name === "番茄");
    const egg = app.payload.ingredients.find((item) => item.name === "鸡蛋");
    const generated = await callApi(handler, "/api/recipes/generate", {
      method: "POST",
      body: { ingredientIds: [tomato.id, egg.id] },
    });
    assert.equal(generated.status, 200);
    assert.equal(calls.at(-1).url, "https://api.deepseek.com/chat/completions");
    const genBody = JSON.parse(calls.at(-1).init.body);
    assert.equal(genBody.model, "deepseek-chat");
    assert.deepEqual(genBody.response_format, { type: "json_object" });
    assert.equal(generated.payload.draft.title, "DeepSeek番茄蛋");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Netlify Function retries optimistic concurrency conflicts", async () => {
  const store = new MemoryBlobStore({ failFirstMatchCount: 1 });
  const handler = createApiHandler({
    store,
    env: { FAMILY_ACCESS_CODE: "test-family", DASHSCOPE_API_KEY: "" },
  });

  const created = await callApi(handler, "/api/ingredients", {
    method: "POST",
    body: { name: "西兰花", category: "蔬菜" },
  });
  assert.equal(created.status, 200);
  assert.equal(created.payload.ingredients.some((item) => item.name === "西兰花"), true);
});

test("Netlify Function supports pregnancy safety, settings, manual recipes, meal planner, and shopping commit", async () => {
  const store = new MemoryBlobStore();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const userPrompt = String(body.messages.at(-1)?.content || "");
    if (userPrompt.includes("shoppingItems")) {
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "下顿 2 道菜 + 主食买菜方案",
              summary: "孕期营养均衡，补铁补叶酸",
              staple: "杂粮米饭",
              meals: [
                {
                  title: "蒜蓉油麦菜",
                  method: "炒",
                  minutes: 10,
                  reason: "清爽绿叶菜",
                  pregnancyTip: "清洗干净炒熟",
                  requiredIngredients: [{ name: "油麦菜", quantityLabel: "1把" }],
                  optionalIngredients: [{ name: "盐", quantityLabel: "少许" }],
                  steps: ["油麦菜洗净切段。", "大火快炒2分钟调味。"],
                },
                {
                  title: "清蒸鲈鱼",
                  method: "蒸",
                  minutes: 18,
                  reason: "优质蛋白低汞",
                  pregnancyTip: "务必彻底蒸熟",
                  requiredIngredients: [{ name: "鲈鱼", quantityLabel: "1条" }],
                  optionalIngredients: [{ name: "生抽", quantityLabel: "2勺" }],
                  steps: ["鲈鱼改刀抹盐。", "水开蒸10分钟焖2分钟。"],
                },
              ],
              shoppingItems: [
                { name: "油麦菜", category: "蔬菜", quantityLabel: "1把", forDishes: ["蒜蓉油麦菜"] },
                { name: "鲈鱼", category: "肉禽蛋", quantityLabel: "1条", forDishes: ["清蒸鲈鱼"] },
              ],
            }),
          },
        }],
      });
    }
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            pregnancyLevel: "caution",
            pregnancyNote: "冷门食材示例：孕期建议少量熟食",
          }),
        },
      }],
    });
  };

  try {
    const handler = createApiHandler({
      store,
      env: { FAMILY_ACCESS_CODE: "test-family", DEEPSEEK_API_KEY: "ds-key" },
    });

    // Known avoid ingredient uses curated rule immediately
    const avoidAdd = await callApi(handler, "/api/ingredients", {
      method: "POST",
      body: { name: "溏心蛋", category: "肉禽蛋" },
    });
    assert.equal(avoidAdd.status, 200);
    assert.equal(avoidAdd.payload.addedIngredients[0].pregnancyLevel, "avoid");

    // Unknown exotic ingredient falls back to DeepSeek evaluation
    const unknownAdd = await callApi(handler, "/api/ingredients", {
      method: "POST",
      body: { name: "冰草嫩芽", category: "蔬菜" },
    });
    assert.equal(unknownAdd.status, 200);
    assert.equal(unknownAdd.payload.addedIngredients[0].pregnancyLevel, "caution");
    assert.equal(unknownAdd.payload.addedIngredients[0].pregnancyNote.includes("冷门食材"), true);

    // Update settings
    const settingsRes = await callApi(handler, "/api/settings", {
      method: "PATCH",
      body: { pregnancyMode: true, dietaryNotes: "孕晚期控糖" },
    });
    assert.equal(settingsRes.status, 200);
    assert.equal(settingsRes.payload.settings.dietaryNotes, "孕晚期控糖");

    // Manual recipe creation
    const manualRes = await callApi(handler, "/api/recipes", {
      method: "POST",
      body: {
        title: "清蒸鸡胸肉",
        method: "蒸",
        minutes: 15,
        ingredients: [{ name: "鸡胸肉", quantityLabel: "1块", required: true }],
        steps: ["鸡胸肉切片蒸15分钟。"],
      },
    });
    assert.equal(manualRes.status, 200);
    assert.equal(manualRes.payload.recipe.title, "清蒸鸡胸肉");

    // AI shopping plan suggestion
    const planRes = await callApi(handler, "/api/meal-plan/suggest", {
      method: "POST",
      body: { mode: "shopping_plan", dishCount: 2, mealsCount: 1, shoppingMode: "fresh" },
    });
    assert.equal(planRes.status, 200);
    assert.equal(planRes.payload.plan.generatedBy, "ai");
    assert.equal(planRes.payload.plan.shoppingItems.length, 2);

    // Save & commit shopping list
    const savePlan = await callApi(handler, "/api/shopping-plan", {
      method: "PUT",
      body: {
        ...planRes.payload.plan,
        items: planRes.payload.plan.shoppingItems.map((item) => ({ ...item, checked: true })),
      },
    });
    assert.equal(savePlan.status, 200);
    const commitRes = await callApi(handler, "/api/shopping-plan/commit", {
      method: "POST",
      body: { saveMeals: true },
    });
    assert.equal(commitRes.status, 200);
    assert.equal(commitRes.payload.addedIngredients.length, 2);
    assert.equal(commitRes.payload.savedRecipeIds.length, 2);
    assert.equal(commitRes.payload.shoppingPlan, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function callApi(handler, pathname, options = {}) {
  const response = await handler(new Request(`https://happy-eat.netlify.app${pathname}`, {
    method: options.method || "GET",
    headers: {
      ...(options.auth === false ? {} : { Authorization: "Bearer test-family" }),
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  }), { ip: options.ip || "203.0.113.10" });
  return { status: response.status, payload: await response.json() };
}

class MemoryBlobStore {
  constructor({ failFirstMatchCount = 0 } = {}) {
    this.entries = new Map();
    this.version = 0;
    this.failFirstMatchCount = failFirstMatchCount;
  }

  async getWithMetadata(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    return { data: structuredClone(entry.data), etag: entry.etag, metadata: {} };
  }

  async setJSON(key, data, options = {}) {
    const existing = this.entries.get(key);
    if (options.onlyIfNew && existing) {
      return { modified: false };
    }
    if (options.onlyIfMatch) {
      if (this.failFirstMatchCount > 0) {
        this.failFirstMatchCount -= 1;
        return { modified: false };
      }
      if (!existing || existing.etag !== options.onlyIfMatch) {
        return { modified: false };
      }
    }
    this.version += 1;
    const etag = `etag-${this.version}`;
    this.entries.set(key, { data: structuredClone(data), etag });
    return { modified: true, etag };
  }
}
