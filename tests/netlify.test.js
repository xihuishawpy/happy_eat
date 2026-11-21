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
