import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const STATE_STORE = "happy-eat-state";
const STATE_KEY = "main";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_TEXT_MODEL = "deepseek-chat";
const DEFAULT_DEEPSEEK_VISION_MODEL = "deepseek-flash";
const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_DASHSCOPE_TEXT_MODEL = "qwen-plus";
const DEFAULT_DASHSCOPE_VISION_MODEL = "qwen3-vl-plus";
const DEFAULT_DASHSCOPE_ASR_MODEL = "qwen3-asr-flash";
const MAX_JSON_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_DEEPSEEK_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_WEB_BYTES = 1024 * 1024;
const MAX_CONCURRENCY_RETRIES = 6;
const PANTRY = ["盐", "白糖", "生抽", "老抽", "食用油", "香醋", "料酒"];

export const config = {
  path: "/api/*",
};

export function createApiHandler({ store, env } = {}) {
  const resolveStore = () => store || getStore({ name: STATE_STORE, consistency: "strong" });
  const getEnv = (key, fallback = "") => {
    if (env && Object.hasOwn(env, key)) return env[key] ?? fallback;
    const netlifyValue = globalThis.Netlify?.env?.get?.(key);
    if (netlifyValue !== undefined && netlifyValue !== null) return netlifyValue;
    return process.env[key] ?? fallback;
  };

  return async function handleRequest(request, context) {
    const url = new URL(request.url);
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    const familyAccessCode = String(getEnv("FAMILY_ACCESS_CODE", ""));

    try {
      if (!familyAccessCode) {
        return json({ error: "服务端尚未配置 FAMILY_ACCESS_CODE" }, 503);
      }

      if (request.method === "POST" && pathname === "/api/session") {
        return await handleSession(request, context, resolveStore(), familyAccessCode);
      }

      const authorization = request.headers.get("authorization") || "";
      const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : request.headers.get("x-family-access-code");
      if (token !== familyAccessCode) {
        return json({ error: "需要家庭访问码" }, 401);
      }

      const activeStore = resolveStore();

      if (request.method === "GET" && pathname === "/api/app") {
        return json(buildApp(await readState(activeStore), getEnv));
      }

      if (request.method === "POST" && pathname === "/api/audio/transcriptions") {
        return await handleAudioTranscription(request, getEnv);
      }

      if (request.method === "POST" && pathname === "/api/ingredients") {
        return await handleCreateIngredient(request, activeStore, getEnv);
      }

      if (request.method === "POST" && pathname === "/api/ingredients/batch") {
        return await handleCreateIngredientsBatch(request, activeStore, getEnv);
      }

      const ingredientMatch = pathname.match(/^\/api\/ingredients\/([^/]+)$/);
      if (ingredientMatch && request.method === "PATCH") {
        return await handleUpdateIngredient(request, activeStore, getEnv, ingredientMatch[1]);
      }
      if (ingredientMatch && request.method === "DELETE") {
        const state = await mutateState(activeStore, (draft) => {
          draft.ingredients = draft.ingredients.filter((item) => String(item.id) !== ingredientMatch[1]);
        });
        return json(buildApp(state, getEnv));
      }

      if (request.method === "POST" && pathname === "/api/drafts/analyze") {
        return await handleAnalyzeDraft(request, activeStore, getEnv);
      }

      if (request.method === "POST" && pathname === "/api/recipes/generate") {
        return await handleGenerateRecipe(request, activeStore, getEnv);
      }

      const completeMatch = pathname.match(/^\/api\/recipes\/([^/]+)\/complete$/);
      if (completeMatch && request.method === "POST") {
        return await handleCompleteCooking(request, activeStore, getEnv, completeMatch[1]);
      }

      const undoMatch = pathname.match(/^\/api\/consumption-events\/([^/]+)\/undo$/);
      if (undoMatch && request.method === "POST") {
        return await handleUndoConsumption(activeStore, getEnv, undoMatch[1]);
      }

      const draftMatch = pathname.match(/^\/api\/drafts\/([^/]+)$/);
      if (draftMatch && request.method === "PATCH") {
        return await handleUpdateRecipe(request, activeStore, getEnv, draftMatch[1], "draft");
      }

      const confirmMatch = pathname.match(/^\/api\/drafts\/([^/]+)\/confirm$/);
      if (confirmMatch && request.method === "POST") {
        const state = await mutateState(activeStore, (draft) => {
          const recipe = draft.recipes.find((item) => String(item.id) === confirmMatch[1] && item.status === "draft");
          if (!recipe) throw httpError(404, "菜谱草稿不存在或已经保存");
          recipe.status = "formal";
        });
        return json({ savedRecipeId: Number(confirmMatch[1]), app: buildApp(state, getEnv) });
      }

      const recipeMatch = pathname.match(/^\/api\/recipes\/([^/]+)$/);
      if (recipeMatch && request.method === "PATCH") {
        return await handleUpdateRecipe(request, activeStore, getEnv, recipeMatch[1], "formal");
      }
      if (recipeMatch && request.method === "DELETE") {
        const state = await mutateState(activeStore, (draft) => {
          const index = draft.recipes.findIndex((item) => String(item.id) === recipeMatch[1] && item.status === "formal");
          if (index === -1) throw httpError(404, "正式菜谱不存在");
          draft.recipes.splice(index, 1);
        });
        return json(buildApp(state, getEnv));
      }

      return json({ error: "Not Found" }, 404);
    } catch (error) {
      if (!error.status || error.status >= 500) console.error(error);
      return json({ error: error.message || "服务端处理失败" }, error.status || 500);
    }
  };
}

const defaultHandler = createApiHandler();

export default async function handler(request, context) {
  return defaultHandler(request, context);
}

function json(value, status = 200) {
  return Response.json(value, { status });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readJson(request, { allowEmpty = false } = {}) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_JSON_BYTES) {
    throw httpError(413, "请求内容不能超过 12MB");
  }
  if (!request.body) {
    if (allowEmpty) return {};
    throw httpError(400, "请求内容不是有效的 JSON");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw httpError(413, "请求内容不能超过 12MB");
    }
    chunks.push(value);
  }
  if (total === 0 && allowEmpty) return {};

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw httpError(400, "请求内容不是有效的 JSON");
  }
}

async function handleSession(request, context, store, familyAccessCode) {
  const body = await readJson(request);
  const clientKey = String(
    context?.ip
    || request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("x-forwarded-for")
    || "unknown",
  ).split(",")[0].trim();
  const accepted = body?.accessCode === familyAccessCode;

  const state = await mutateState(store, (draft) => {
    const now = Date.now();
    draft.loginAttempts = (draft.loginAttempts || []).filter((item) => now - item.windowStart < 60_000);
    const attempt = draft.loginAttempts.find((item) => item.key === clientKey);
    if (attempt?.count >= 10) {
      throw httpError(429, "尝试次数过多，请稍后再试");
    }
    if (accepted) {
      draft.loginAttempts = draft.loginAttempts.filter((item) => item.key !== clientKey);
    } else if (attempt) {
      attempt.count += 1;
    } else {
      draft.loginAttempts.push({ key: clientKey, count: 1, windowStart: now });
    }
  });

  if (!accepted) {
    return json({ error: "家庭访问码不正确" }, 401);
  }
  return json({
    token: familyAccessCode,
    family: { name: state.familyName || "张家", accessMode: "家庭访问码" },
  });
}

async function handleAudioTranscription(request, getEnv) {
  const asr = resolveAsrConfig(getEnv);
  if (!asr) {
    return json({ error: "语音识别尚未配置（需配置 DEEPSEEK_API_KEY 或 DASHSCOPE_API_KEY）" }, 503);
  }
  const body = await readJson(request);
  const audioDataUrl = String(body?.audioDataUrl || "");
  const match = audioDataUrl.match(/^data:(audio\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return json({ error: "录音格式不受支持" }, 422);
  }
  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];
  const byteLength = Buffer.byteLength(base64Data, "base64");

  if (asr.provider === "deepseek") {
    if (!/^audio\/(wav|x-wav|ogg)$/i.test(mimeType)) {
      return json({ error: "DeepSeek 语音识别仅支持 WAV 或 Ogg Opus 录音格式，请刷新页面后重试" }, 422);
    }
    if (byteLength > MAX_DEEPSEEK_AUDIO_BYTES) {
      return json({ error: "录音不能超过 8MB" }, 413);
    }
    return json({ text: await transcribeAudioWithDeepSeek(mimeType, base64Data, asr) });
  }

  if (!/^audio\/(webm|ogg|mpeg|mp3|wav|x-wav|flac|aac|aiff)$/i.test(mimeType)) {
    return json({ error: "录音格式不受支持" }, 422);
  }
  if (byteLength > MAX_AUDIO_BYTES) {
    return json({ error: "录音不能超过 10MB" }, 413);
  }
  return json({ text: await transcribeAudioWithDashScope(audioDataUrl, asr) });
}

async function handleCreateIngredient(request, store, getEnv) {
  const body = await readJson(request);
  const name = normalizeIngredientName(String(body?.name || ""));
  if (!name) return json({ error: "请输入食材名称" }, 422);

  const categoryInput = String(body?.category || "").trim();
  const category = categoryInput ? normalizeCategory(categoryInput) : classifyIngredient(name);
  const stateValue = normalizeState(body?.state);

  const state = await mutateState(store, (draft) => {
    if (draft.ingredients.some((item) => item.name === name)) {
      throw httpError(409, "这个食材已经在清单里");
    }
    draft.ingredients.push({
      id: nextId(draft.ingredients),
      name,
      category,
      state: stateValue,
    });
  });

  return json(buildApp(state, getEnv));
}

async function handleCreateIngredientsBatch(request, store, getEnv) {
  const body = await readJson(request);
  const parsed = await parseIngredientInput(body?.text || "", getEnv);
  const state = parsed.length > 0
    ? await mutateState(store, (draft) => {
      for (const item of parsed) {
        const existing = draft.ingredients.find((ingredient) => ingredient.name === item.name);
        if (existing) {
          existing.category = item.category;
          if (item.state !== "none") existing.state = item.state;
        } else {
          draft.ingredients.push({
            id: nextId(draft.ingredients),
            name: item.name,
            category: item.category,
            state: item.state,
          });
        }
      }
    })
    : await readState(store);

  return json(buildApp(state, getEnv));
}

async function handleUpdateIngredient(request, store, getEnv, id) {
  const body = await readJson(request);
  const state = await mutateState(store, (draft) => {
    const ingredient = draft.ingredients.find((item) => String(item.id) === id);
    if (!ingredient) throw httpError(404, "食材不存在");

    const name = normalizeIngredientName(String(body?.name ?? ingredient.name));
    if (!name) throw httpError(422, "请输入食材名称");
    if (draft.ingredients.some((item) => item.id !== ingredient.id && item.name === name)) {
      throw httpError(409, "这个食材已经在清单里");
    }

    const categoryInput = String(body?.category ?? ingredient.category).trim();
    ingredient.name = name;
    ingredient.category = categoryInput ? normalizeCategory(categoryInput) : classifyIngredient(name);
    ingredient.state = normalizeState(body?.state ?? ingredient.state);
  });

  return json(buildApp(state, getEnv));
}

async function handleAnalyzeDraft(request, store, getEnv) {
  const body = await readJson(request);
  const sourceType = body?.sourceType || "text";
  let sourceText = String(body?.content || "");
  const imageDataUrl = String(body?.imageDataUrl || "");

  if (sourceType !== "image" && !sourceText.trim()) {
    return json({ error: "请先提供菜谱内容" }, 422);
  }
  if (sourceType === "web") sourceText = await readWebPageText(sourceText);
  if (sourceType === "image" && !imageDataUrl) {
    return json({ error: "请先选择一张菜谱图片" }, 422);
  }

  const recipe = await buildRecipeDraft(sourceType, sourceText, imageDataUrl, getEnv);
  const state = await mutateState(store, (draft) => {
    recipe.id = nextId(draft.recipes);
    draft.recipes.push(recipe);
  });
  return json({ draft: publicRecipe(recipe), app: buildApp(state, getEnv) });
}

async function handleGenerateRecipe(request, store, getEnv) {
  if (!resolveTextLlmConfig(getEnv)) {
    return json({ error: "AI 菜谱生成尚未配置" }, 503);
  }
  const body = await readJson(request, { allowEmpty: true });
  const hasSelection = Object.hasOwn(body || {}, "ingredientIds");
  if (hasSelection && !Array.isArray(body.ingredientIds)) {
    return json({ error: "食材选择无效" }, 422);
  }
  const ingredientIds = [...new Set((body?.ingredientIds || []).map(Number))];
  if (ingredientIds.length > 100 || ingredientIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return json({ error: "食材选择无效" }, 422);
  }

  const currentState = await readState(store);
  const priorityOrder = { expiring: 0, priority: 1 };
  const selected = (ingredientIds.length > 0
    ? currentState.ingredients.filter((item) => ingredientIds.includes(Number(item.id)))
    : [...currentState.ingredients]
  ).sort((a, b) => {
    const rankDiff = (priorityOrder[a.state] ?? 2) - (priorityOrder[b.state] ?? 2);
    return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name, "zh-CN");
  });

  if (selected.length === 0) return json({ error: "请先添加可用食材" }, 422);
  if (ingredientIds.length > 0 && selected.length !== ingredientIds.length) {
    return json({ error: "所选食材已不存在，请重新选择" }, 422);
  }

  const sourceText = formatAvailableIngredients(selected);
  const recipe = await buildRecipeDraft("generated", sourceText, "", getEnv, selected);
  const state = await mutateState(store, (draft) => {
    recipe.id = nextId(draft.recipes);
    draft.recipes.push(recipe);
  });
  return json({ draft: publicRecipe(recipe), app: buildApp(state, getEnv) });
}

async function handleCompleteCooking(request, store, getEnv, recipeId) {
  const body = await readJson(request);
  const consumptions = normalizeConsumptions(body?.consumptions);
  let undoId = null;
  let summary = { removed: 0, prioritized: 0 };

  const state = await mutateState(store, (draft) => {
    undoId = null;
    summary = { removed: 0, prioritized: 0 };
    const recipe = draft.recipes.find((item) => String(item.id) === recipeId && item.status === "formal");
    if (!recipe) throw httpError(404, "正式菜谱不存在");

    const requiredNames = new Set(recipe.ingredients.filter((item) => item.required).map((item) => item.name));
    if (consumptions.some((item) => !requiredNames.has(item.name))) {
      throw httpError(422, "消耗食材不在这道菜的必需清单中");
    }

    const changes = [];
    for (const consumption of consumptions) {
      if (consumption.action === "kept") continue;
      const index = draft.ingredients.findIndex((item) => item.name === consumption.name);
      if (index === -1) continue;
      const ingredient = structuredClone(draft.ingredients[index]);
      if (consumption.action === "used_up") {
        draft.ingredients.splice(index, 1);
        changes.push({ action: "used_up", before: ingredient });
        summary.removed += 1;
      } else if (ingredient.state !== "priority") {
        draft.ingredients[index].state = "priority";
        changes.push({ action: "low", before: ingredient });
        summary.prioritized += 1;
      }
    }

    if (changes.length > 0) {
      undoId = randomUUID();
      const events = Array.isArray(draft.consumptionEvents) ? draft.consumptionEvents : [];
      events.push({ id: undoId, recipeId: recipe.id, changes, undone: false, createdAt: new Date().toISOString() });
      draft.consumptionEvents = events.slice(-20);
    }
  });

  return json({ app: buildApp(state, getEnv), undoId, summary });
}

async function handleUndoConsumption(store, getEnv, eventId) {
  const state = await mutateState(store, (draft) => {
    const events = Array.isArray(draft.consumptionEvents) ? draft.consumptionEvents : [];
    const event = events.find((item) => item.id === eventId);
    if (!event) throw httpError(404, "撤销记录不存在");
    if (event.undone) throw httpError(409, "这次库存变化已经撤销");

    for (const change of event.changes) {
      const ingredient = change.before;
      if (change.action === "used_up") {
        if (!draft.ingredients.some((item) => item.name === ingredient.name)) {
          const restored = structuredClone(ingredient);
          if (draft.ingredients.some((item) => item.id === restored.id)) {
            restored.id = nextId(draft.ingredients);
          }
          draft.ingredients.push(restored);
        }
      } else {
        const current = draft.ingredients.find((item) => item.name === ingredient.name);
        if (current?.state === "priority") current.state = ingredient.state;
      }
    }
    event.undone = true;
  });

  return json({ app: buildApp(state, getEnv), undone: true });
}

async function handleUpdateRecipe(request, store, getEnv, id, status) {
  const body = await readJson(request);
  const title = String(body?.title || "").trim().slice(0, 40);
  const rawIngredients = Array.isArray(body?.ingredients) ? body.ingredients : [];
  const ingredients = rawIngredients.map((item) => {
    const sanitized = sanitizeIngredientItems([item], { includeQuantity: true })[0];
    return sanitized ? { name: sanitized.name, quantityLabel: sanitized.quantityLabel, required: Boolean(item.required) } : null;
  }).filter(Boolean);
  const rawSteps = Array.isArray(body?.steps) ? body.steps.slice(0, 12) : [];
  const steps = rawSteps.map((step) => String(step).trim()).filter(Boolean);

  if (!title || ingredients.length === 0 || ingredients.length !== rawIngredients.length
    || steps.length === 0 || steps.length !== rawSteps.length) {
    return json({ error: "请填写标题、食材和烹饪步骤" }, 422);
  }

  const state = await mutateState(store, (draft) => {
    const recipe = draft.recipes.find((item) => String(item.id) === id && item.status === status);
    if (!recipe) throw httpError(404, status === "draft" ? "菜谱草稿不存在" : "正式菜谱不存在");
    Object.assign(recipe, {
      title,
      method: normalizeMethod(body?.method),
      minutes: clampMinutes(body?.minutes),
      preferenceWarning: String(body?.preferenceWarning || "").trim().slice(0, 30),
      ingredients,
      steps,
    });
  });

  const saved = state.recipes.find((item) => String(item.id) === id);
  const app = buildApp(state, getEnv);
  if (status === "draft") {
    return json({ draft: publicRecipe(saved), app });
  }
  return json({ recipe: decorateRecipe(publicRecipe(saved), state.ingredients), app });
}

async function ensureStateEntry(store) {
  const existing = await store.getWithMetadata(STATE_KEY, { type: "json", consistency: "strong" });
  if (existing?.data) return existing;

  const seed = createSeedState();
  await store.setJSON(STATE_KEY, seed, { onlyIfNew: true });
  const initialized = await store.getWithMetadata(STATE_KEY, { type: "json", consistency: "strong" });
  if (initialized?.data) return initialized;
  return { data: seed, etag: undefined };
}

async function readState(store) {
  const entry = await ensureStateEntry(store);
  return structuredClone(entry.data);
}

async function mutateState(store, mutator) {
  for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt += 1) {
    const entry = await ensureStateEntry(store);
    const draft = structuredClone(entry.data);
    mutator(draft);
    draft.version = Number(draft.version || 0) + 1;
    draft.updatedAt = new Date().toISOString();

    const writeOptions = entry.etag ? { onlyIfMatch: entry.etag } : undefined;
    const result = await store.setJSON(STATE_KEY, draft, writeOptions);
    if (result?.modified !== false) {
      return draft;
    }
  }
  throw httpError(409, "并发更新冲突，请稍后重试");
}

function buildApp(state, getEnv) {
  const ingredients = [...(state.ingredients || [])].sort((a, b) => {
    const categoryDiff = a.category.localeCompare(b.category, "zh-CN");
    return categoryDiff !== 0 ? categoryDiff : a.name.localeCompare(b.name, "zh-CN");
  });
  const recipesDesc = [...(state.recipes || [])].sort((a, b) => Number(b.id) - Number(a.id));
  const formal = recipesDesc.filter((recipe) => recipe.status === "formal").map(publicRecipe);
  const drafts = recipesDesc.filter((recipe) => recipe.status === "draft").map(publicRecipe);
  const decorated = formal.map((recipe) => decorateRecipe(recipe, ingredients)).sort((a, b) => {
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    if (Boolean(a.preferenceWarning) !== Boolean(b.preferenceWarning)) return a.preferenceWarning ? 1 : -1;
    return a.minutes - b.minutes;
  });

  const textLlm = resolveTextLlmConfig(getEnv);
  const visionLlm = resolveVisionLlmConfig(getEnv);
  const asrConfig = resolveAsrConfig(getEnv);
  return {
    family: { name: state.familyName || "张家", accessMode: "家庭访问码" },
    ai: {
      configured: Boolean(textLlm),
      textModel: textLlm?.model || DEFAULT_DEEPSEEK_TEXT_MODEL,
      visionModel: visionLlm?.model || "",
      asrConfigured: Boolean(asrConfig),
    },
    pantry: PANTRY,
    categories: groupIngredients(ingredients),
    ingredients,
    matches: {
      ready: decorated.filter((recipe) => recipe.missing.length === 0),
      missing: decorated.filter((recipe) => recipe.missing.length > 0),
    },
    drafts,
  };
}

function publicRecipe(recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    method: recipe.method,
    minutes: recipe.minutes,
    preferenceWarning: recipe.preferenceWarning || "",
    status: recipe.status,
    sourceType: recipe.sourceType || "manual",
    sourceText: recipe.sourceText || "",
    ingredients: (recipe.ingredients || []).map((item) => ({
      name: item.name,
      quantityLabel: item.quantityLabel || "",
      required: Boolean(item.required),
    })),
    steps: (recipe.steps || []).map((step, index) => ({
      recipeId: recipe.id,
      position: index + 1,
      text: typeof step === "string" ? step : step.text,
    })),
  };
}

function decorateRecipe(recipe, ingredients) {
  const available = new Set(ingredients.map((item) => item.name));
  const pantry = new Set(PANTRY);
  const priority = new Set(
    ingredients.filter((item) => item.state === "priority" || item.state === "expiring").map((item) => item.name),
  );
  const required = recipe.ingredients.filter((item) => item.required);
  const missing = required.filter((item) => !available.has(item.name) && !pantry.has(item.name)).map((item) => item.name);
  return {
    ...recipe,
    missing,
    usesPriority: required.some((item) => priority.has(item.name)),
    substitutions: missing.flatMap((name) => substituteFor(name)),
  };
}

function groupIngredients(ingredients) {
  const groups = new Map();
  for (const ingredient of ingredients) {
    const current = groups.get(ingredient.category) || [];
    current.push(ingredient);
    groups.set(ingredient.category, current);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}

function resolveTextLlmConfig(getEnv) {
  const deepSeekKey = String(getEnv("DEEPSEEK_API_KEY", "")).trim();
  if (deepSeekKey) {
    return {
      provider: "deepseek",
      apiKey: deepSeekKey,
      baseUrl: String(getEnv("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL)).trim() || DEFAULT_DEEPSEEK_BASE_URL,
      model: String(getEnv("DEEPSEEK_TEXT_MODEL", DEFAULT_DEEPSEEK_TEXT_MODEL)).trim() || DEFAULT_DEEPSEEK_TEXT_MODEL,
    };
  }
  const dashScopeKey = String(getEnv("DASHSCOPE_API_KEY", "")).trim();
  if (dashScopeKey) {
    return {
      provider: "dashscope",
      apiKey: dashScopeKey,
      baseUrl: String(getEnv("DASHSCOPE_BASE_URL", DEFAULT_DASHSCOPE_BASE_URL)).trim() || DEFAULT_DASHSCOPE_BASE_URL,
      model: String(getEnv("DASHSCOPE_TEXT_MODEL", DEFAULT_DASHSCOPE_TEXT_MODEL)).trim() || DEFAULT_DASHSCOPE_TEXT_MODEL,
    };
  }
  return null;
}

function resolveVisionLlmConfig(getEnv) {
  const deepSeekKey = String(getEnv("DEEPSEEK_API_KEY", "")).trim();
  if (deepSeekKey) {
    return {
      provider: "deepseek",
      apiKey: deepSeekKey,
      baseUrl: String(getEnv("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL)).trim() || DEFAULT_DEEPSEEK_BASE_URL,
      model: String(getEnv("DEEPSEEK_VISION_MODEL", DEFAULT_DEEPSEEK_VISION_MODEL)).trim() || DEFAULT_DEEPSEEK_VISION_MODEL,
    };
  }
  const dashScopeKey = String(getEnv("DASHSCOPE_API_KEY", "")).trim();
  if (!dashScopeKey) return null;
  return {
    provider: "dashscope",
    apiKey: dashScopeKey,
    baseUrl: String(getEnv("DASHSCOPE_BASE_URL", DEFAULT_DASHSCOPE_BASE_URL)).trim() || DEFAULT_DASHSCOPE_BASE_URL,
    model: String(getEnv("DASHSCOPE_VISION_MODEL", DEFAULT_DASHSCOPE_VISION_MODEL)).trim() || DEFAULT_DASHSCOPE_VISION_MODEL,
  };
}

function resolveAsrConfig(getEnv) {
  const deepSeekKey = String(getEnv("DEEPSEEK_API_KEY", "")).trim();
  if (deepSeekKey) {
    return {
      provider: "deepseek",
      apiKey: deepSeekKey,
      baseUrl: String(getEnv("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL)).trim() || DEFAULT_DEEPSEEK_BASE_URL,
    };
  }
  const dashScopeKey = String(getEnv("DASHSCOPE_API_KEY", "")).trim();
  if (!dashScopeKey) return null;
  return {
    provider: "dashscope",
    apiKey: dashScopeKey,
    baseUrl: String(getEnv("DASHSCOPE_BASE_URL", DEFAULT_DASHSCOPE_BASE_URL)).trim() || DEFAULT_DASHSCOPE_BASE_URL,
    model: String(getEnv("DASHSCOPE_ASR_MODEL", DEFAULT_DASHSCOPE_ASR_MODEL)).trim() || DEFAULT_DASHSCOPE_ASR_MODEL,
  };
}

async function parseIngredientInput(text, getEnv) {
  const llm = resolveTextLlmConfig(getEnv);
  if (!llm) return parseIngredientText(text);
  const result = await callLlmJson(llm, [
    {
      role: "system",
      content: [
        "你是家庭厨房食材录入助手。",
        "从用户的自然语言中提取可用食材清单。",
        "返回且只返回 JSON，不要 Markdown。",
        "JSON 结构：{\"ingredients\":[{\"name\":\"番茄\",\"category\":\"蔬菜\",\"state\":\"none\"}]}。",
        "category 只能是：蔬菜、肉禽蛋、主食、调味、乳品、其他。",
        "state 只能是：priority、expiring、frozen、none。",
        "看到优先用掉、剩、今天用，state=priority；看到快过期、快坏，state=expiring；看到冷冻、冻，state=frozen。",
        "把同义食材归一为常见名称，例如西红柿归一为番茄，马铃薯归一为土豆，酱油按语境归一为生抽。",
        "数量和单位只用于识别食材名称，不要返回数量字段。",
      ].join("\n"),
    },
    { role: "user", content: String(text) },
  ]);
  return sanitizeIngredientItems(result.ingredients);
}

function parseIngredientText(text) {
  return String(text).replace(/冰箱里有|家里有|还有|，/g, "、").split(/[、,\n]/)
    .map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
      const state = /快过期|快坏/.test(chunk) ? "expiring"
        : /今天用|优先|剩/.test(chunk) ? "priority" : /冷冻|冻/.test(chunk) ? "frozen" : "none";
      const cleaned = chunk.replace(/快过期|快坏|今天用|优先用掉|优先|冷冻中|冷冻|冻着|剩/g, "").trim();
      const quantityMatch = cleaned.match(/([一二三四五六七八九十半\d.]+)\s*(个|颗|根|块|片|包|袋|盒|瓶|碗|斤|克|g|kg|勺|把)/i);
      const quantityLabel = quantityMatch ? quantityMatch[0] : "";
      const name = normalizeIngredientName(cleaned.replace(quantityLabel, "").replace(/[x×*]/g, "").trim());
      return { name, category: classifyIngredient(name), quantityLabel, state };
    }).filter((item) => item.name.length > 0);
}

async function buildRecipeDraft(sourceType, sourceText, imageDataUrl, getEnv, generatedIngredients = []) {
  const textLlm = resolveTextLlmConfig(getEnv);
  const visionLlm = resolveVisionLlmConfig(getEnv);
  let extracted;
  if (sourceType === "generated") {
    extracted = await generateRecipeWithLLM(sourceText, textLlm);
  } else if (imageDataUrl) {
    if (!/^data:image\/(jpeg|jpg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(imageDataUrl)) {
      throw httpError(422, "仅支持 JPG、PNG、WebP 或 GIF 格式的菜谱图片");
    }
    if (visionLlm) {
      extracted = await extractRecipeWithLLM(sourceText, imageDataUrl, visionLlm);
    } else {
      extracted = extractRecipeLocally(sourceText);
    }
  } else if (textLlm) {
    extracted = await extractRecipeWithLLM(sourceText, "", textLlm);
  } else {
    extracted = extractRecipeLocally(sourceText);
  }

  const required = sanitizeIngredientItems(extracted.requiredIngredients, { includeQuantity: true });
  let optional = sanitizeIngredientItems(extracted.optionalIngredients, { includeQuantity: true });
  if (sourceType === "generated") {
    const available = new Set(generatedIngredients.map((item) => item.name));
    if (required.length === 0 || required.some((item) => !available.has(item.name))) {
      throw httpError(502, "AI 生成了现有清单之外的必需食材，请重试");
    }
    const allowed = new Set([...available, ...PANTRY]);
    optional = optional.filter((item) => allowed.has(item.name));
  }

  const steps = Array.isArray(extracted.steps) && extracted.steps.length > 0
    ? extracted.steps.map((step) => String(step).trim()).filter(Boolean).slice(0, 8)
    : splitSteps(sourceText);
  const title = String(
    extracted.title
    || sourceText.match(/《(.+?)》/)?.[1]
    || sourceText.split(/[。\n]/)[0].slice(0, 12)
    || "新菜谱草稿",
  ).slice(0, 40);

  return {
    title,
    method: normalizeMethod(extracted.method || inferMethod(sourceText)),
    minutes: clampMinutes(extracted.minutes || inferMinutes(sourceText)),
    preferenceWarning: String(extracted.preferenceWarning || (/辣/.test(sourceText) ? "可能偏辣" : "")).slice(0, 30),
    status: "draft",
    sourceType,
    sourceText: sourceType === "image" ? String(sourceText || "图片导入").slice(0, 1000) : sourceText.slice(0, 4000),
    ingredients: [
      ...required.map((item) => ({ name: item.name, quantityLabel: item.quantityLabel, required: true })),
      ...optional.map((item) => ({ name: item.name, quantityLabel: item.quantityLabel, required: false })),
    ],
    steps,
  };
}

function formatAvailableIngredients(ingredients) {
  const stateLabels = { expiring: "快过期", priority: "优先用掉", frozen: "冷冻" };
  return ingredients
    .map((item) => `${item.name}${stateLabels[item.state] ? `（${stateLabels[item.state]}）` : ""}`)
    .join("、");
}

function normalizeConsumptions(value) {
  if (!Array.isArray(value) || value.length > 100) {
    throw httpError(422, "消耗食材格式无效");
  }
  const seen = new Set();
  return value.map((item) => {
    const name = normalizeIngredientName(String(item?.name || ""));
    const action = String(item?.action || "");
    if (!name || !["used_up", "low", "kept"].includes(action) || seen.has(name)) {
      throw httpError(422, "消耗食材格式无效");
    }
    seen.add(name);
    return { name, action };
  });
}

async function generateRecipeWithLLM(sourceText, llm) {
  const prompt = [
    "请根据家庭现有食材设计一道实际可做的中式家常菜。",
    `现有食材：${sourceText}`,
    `常备调料：${PANTRY.join("、")}。`,
    "优先使用标记为快过期或优先用掉的食材。",
    "requiredIngredients 只能使用现有食材；常备调料放入 optionalIngredients。",
    "不要把家里没有的食材列为必需食材。步骤要具体、简短并适合家庭烹饪。",
    "返回且只返回 JSON，不要 Markdown。",
    "JSON 结构：",
    "{\"title\":\"番茄炒蛋\",\"method\":\"炒\",\"minutes\":15,\"preferenceWarning\":\"\",\"requiredIngredients\":[{\"name\":\"番茄\",\"quantityLabel\":\"2个\"}],\"optionalIngredients\":[{\"name\":\"生抽\",\"quantityLabel\":\"1勺\"}],\"steps\":[\"番茄切块。\"]}",
    "method 只能是：炒、煮、蒸、煎、烤、凉拌、炖、其他。",
  ].join("\n");

  return callLlmJson(llm, [
    { role: "system", content: "你是家庭厨师，擅长利用现有食材生成简单可靠的中文菜谱。" },
    { role: "user", content: prompt },
  ]);
}

function extractRecipeLocally(sourceText) {
  const detectedNames = [
    "鸡胸肉", "猪肉末", "火腿肠", "花生米", "干辣椒", "豆瓣酱", "黑胡椒",
    "番茄", "土豆", "青椒", "洋葱", "香菜", "葱花", "鸡蛋", "虾仁",
    "培根", "米饭", "挂面", "面包片", "牛奶", "酸奶", "豆腐", "丝瓜",
    "黄瓜", "面粉", "花椒", "盐", "白糖", "生抽", "老抽", "蚝油", "食用油", "虾",
  ].filter((name) => sourceText.includes(name));
  const ingredients = detectedNames.length > 0 ? detectedNames.map((name) => {
    const quantityLabel = sourceText.match(new RegExp(
      `${name}\\s*([一二三四五六七八九十半\\d.]+\\s*(?:个|颗|根|块|片|包|袋|盒|瓶|碗|斤|克|g|kg|勺|把))`, "i",
    ))?.[1] || "";
    return { name, category: classifyIngredient(name), quantityLabel, state: "none" };
  }) : parseIngredientText(sourceText);
  const required = ingredients.slice(0, Math.max(2, Math.min(4, ingredients.length)));
  return {
    title: sourceText.match(/《(.+?)》/)?.[1] || sourceText.split(/[。\n]/)[0].slice(0, 12) || "新菜谱草稿",
    method: inferMethod(sourceText),
    minutes: inferMinutes(sourceText),
    preferenceWarning: /辣/.test(sourceText) ? "可能偏辣" : "",
    requiredIngredients: required,
    optionalIngredients: ingredients.slice(required.length),
    steps: splitSteps(sourceText),
  };
}

async function extractRecipeWithLLM(sourceText, imageDataUrl, llm) {
  const prompt = [
    "从用户提供的菜谱来源中提取结构化菜谱草稿。",
    "返回且只返回 JSON，不要 Markdown。",
    "JSON 结构：",
    "{\"title\":\"番茄鸡蛋面\",\"method\":\"煮\",\"minutes\":15,\"preferenceWarning\":\"\",\"requiredIngredients\":[{\"name\":\"番茄\",\"quantityLabel\":\"2个\"}],\"optionalIngredients\":[{\"name\":\"葱花\",\"quantityLabel\":\"\"}],\"steps\":[\"番茄切块。\"]}",
    "method 只能是：炒、煮、蒸、煎、烤、凉拌、炖、其他。",
    "requiredIngredients 只放决定能不能做这道菜的必需食材；盐、糖、油、生抽等调味品通常放 optionalIngredients，除非菜谱核心依赖它。",
    "食材 name 使用规范食材名称，例如西红柿归一为番茄，马铃薯归一为土豆。",
    "minutes 没有明确时按菜谱复杂度估计。",
    "preferenceWarning 只在明显偏辣、含香菜、儿童不友好等场景填写，否则为空字符串。",
    sourceText ? `文本来源：\n${sourceText.slice(0, 5000)}` : "图片来源：请识别图片中的菜谱文字。",
  ].join("\n");

  const messages = [
    { role: "system", content: "你是家庭菜谱结构化助手，擅长从中文菜谱文本、网页正文或图片中提取可确认的菜谱草稿。" },
    {
      role: "user",
      content: imageDataUrl ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ] : prompt,
    },
  ];

  return callLlmJson(llm, messages);
}

async function callLlmJson(llm, messages) {
  const body = {
    model: llm.model,
    messages,
    temperature: 0.1,
    ...(llm.provider === "deepseek" ? { response_format: { type: "json_object" }, max_tokens: 1500 } : {}),
  };
  const response = await fetch(`${llm.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const label = llm.provider === "deepseek" ? "DeepSeek" : "DashScope";
    throw httpError(502, formatLlmError(payload.error?.message, `${label} API 调用失败`, label));
  }
  const content = readAssistantContent(payload);
  try {
    return JSON.parse(extractJson(content));
  } catch {
    throw httpError(502, "模型返回内容不是可解析的 JSON");
  }
}

async function transcribeAudioWithDeepSeek(mimeType, base64Data, asr) {
  const root = asr.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const bytes = Buffer.from(base64Data, "base64");
  const extension = mimeType.includes("ogg") ? "ogg" : "wav";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), `speech.${extension}`);

  const response = await fetch(`${root}/v1/tools/asr`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${asr.apiKey}`,
    },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(502, formatLlmError(payload.error?.message || payload.message, "DeepSeek 语音识别调用失败", "DeepSeek"));
  }
  return String(payload?.text || "").trim();
}

async function transcribeAudioWithDashScope(audioDataUrl, asr) {
  const response = await fetch(`${asr.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${asr.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: asr.model,
      messages: [{
        role: "user",
        content: [{ type: "input_audio", input_audio: { data: audioDataUrl } }],
      }],
      stream: false,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(502, formatLlmError(payload.error?.message, "语音识别服务调用失败", "DashScope"));
  }
  return readAssistantContent(payload).trim();
}

function readAssistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part?.text || "").join("\n");
  return "";
}

function extractJson(content) {
  const text = String(content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("missing json");
  return text.slice(start, end + 1);
}

function formatLlmError(message, fallback, providerLabel = "AI") {
  const text = String(message || "");
  if (/api key|authentication|unauthorized/i.test(text)) {
    return `${providerLabel} API Key 无效或无权限，请更换有效 Key 后重试`;
  }
  return text || fallback;
}

async function readWebPageText(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw httpError(422, "请输入有效的网页地址");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || isPrivateHostname(parsed.hostname)) {
    throw httpError(422, "请输入可公开访问的 HTTP(S) 网页地址");
  }
  const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw httpError(422, `网页读取失败（HTTP ${response.status}）`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_WEB_BYTES) throw httpError(422, "网页内容不能超过 1MB");

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEB_BYTES) {
      await reader.cancel();
      throw httpError(422, "网页内容不能超过 1MB");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const html = new TextDecoder().decode(bytes);
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 4000);
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (/^(127|0|10)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^(fc|fd|fe80)/i.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function splitSteps(text) {
  const chunks = String(text).split(/(?:\d+[.、)])|[。\n]/).map((step) => step.trim()).filter((step) => step.length > 6);
  return chunks.length > 0 ? chunks.slice(0, 6)
    : ["处理食材并备好调味品。", "热锅加油，放入主要食材翻炒或炖煮。", "调味后收汁或装盘。"];
}

function inferMethod(text) {
  if (/蒸/.test(text)) return "蒸";
  if (/煮|汤/.test(text)) return "煮";
  if (/煎/.test(text)) return "煎";
  if (/烤/.test(text)) return "烤";
  if (/凉拌|拌/.test(text)) return "凉拌";
  if (/炖|红烧/.test(text)) return "炖";
  return "炒";
}

function inferMinutes(text) {
  const match = String(text).match(/(\d+)\s*分钟/);
  if (match) return Number(match[1]);
  if (/炖|红烧|排骨/.test(text)) return 60;
  if (/汤|煮/.test(text)) return 20;
  return 15;
}

function clampMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return 15;
  return Math.max(1, Math.min(240, Math.round(minutes)));
}

function normalizeMethod(method) {
  const value = String(method || "").trim();
  return ["炒", "煮", "蒸", "煎", "烤", "凉拌", "炖", "其他"].includes(value) ? value : "其他";
}

function sanitizeIngredientItems(items, { includeQuantity = false } = {}) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const name = normalizeIngredientName(String(item?.name || ""));
    if (!name) return null;
    const ingredient = {
      name,
      category: normalizeCategory(item?.category || classifyIngredient(name)),
      state: normalizeState(item?.state),
    };
    if (includeQuantity) {
      ingredient.quantityLabel = String(item?.quantityLabel || item?.quantity || "").trim().slice(0, 20);
    }
    return ingredient;
  }).filter(Boolean).slice(0, 60);
}

function normalizeCategory(category) {
  const value = String(category || "").trim();
  return ["蔬菜", "肉禽蛋", "主食", "调味", "乳品", "其他"].includes(value) ? value : "其他";
}

function normalizeState(state) {
  const value = String(state || "").trim();
  return ["priority", "expiring", "frozen", "none"].includes(value) ? value : "none";
}

function normalizeIngredientName(rawName) {
  const name = rawName.replace(/[：:，,。；;]/g, "").trim();
  const aliases = new Map([
    ["西红柿", "番茄"],
    ["马铃薯", "土豆"],
    ["青葱", "葱花"],
    ["葱", "葱花"],
    ["酱油", "生抽"],
    ["油", "食用油"],
    ["糖", "白糖"],
    ["花生", "花生米"],
  ]);
  return aliases.get(name) || name;
}

function classifyIngredient(name) {
  if (/番茄|土豆|青椒|洋葱|香菜|葱|胡萝卜|冬笋|豆腐|白菜|黄瓜|丝瓜|生姜|蒜/.test(name)) return "蔬菜";
  if (/鸡|蛋|猪|牛|鱼|虾|排骨|肉|培根|火腿/.test(name)) return "肉禽蛋";
  if (/米饭|挂面|面包|面粉|土豆粉|米线/.test(name)) return "主食";
  if (/盐|糖|生抽|老抽|醋|油|料酒|胡椒|豆瓣酱|辣椒|花椒|香油/.test(name)) return "调味";
  if (/奶|酸奶|芝士|黄油/.test(name)) return "乳品";
  return "其他";
}

function substituteFor(name) {
  const substitutes = {
    青椒: ["可用彩椒或尖椒替代青椒"],
    鸡胸肉: ["可用鸡腿肉替代鸡胸肉"],
    香菜: ["不吃香菜时可省略或用葱花替代"],
    豆腐: ["可用千张或豆皮替代豆腐"],
  };
  return substitutes[name] || [];
}

function nextId(items) {
  return items.reduce((maximum, item) => Math.max(maximum, Number(item.id) || 0), 0) + 1;
}

function createSeedState() {
  const seedIngredients = [
    ["番茄", "蔬菜", "expiring"],
    ["土豆", "蔬菜", "priority"],
    ["青椒", "蔬菜", "none"],
    ["洋葱", "蔬菜", "priority"],
    ["香菜", "蔬菜", "none"],
    ["葱花", "蔬菜", "none"],
    ["鸡胸肉", "肉禽蛋", "frozen"],
    ["鸡蛋", "肉禽蛋", "none"],
    ["猪肉末", "肉禽蛋", "frozen"],
    ["虾仁", "肉禽蛋", "frozen"],
    ["培根", "肉禽蛋", "frozen"],
    ["火腿肠", "肉禽蛋", "none"],
    ["米饭", "主食", "priority"],
    ["挂面", "主食", "none"],
    ["面包片", "主食", "none"],
    ["牛奶", "乳品", "priority"],
    ["酸奶", "乳品", "none"],
    ["生抽", "调味", "none"],
    ["老抽", "调味", "none"],
    ["蚝油", "调味", "none"],
    ["盐", "调味", "none"],
    ["白糖", "调味", "none"],
    ["食用油", "调味", "none"],
    ["黑胡椒", "调味", "none"],
  ].map(([name, category, state], index) => ({ id: index + 1, name, category, state }));

  const seedRecipes = [
    {
      title: "番茄炒蛋",
      method: "炒",
      minutes: 15,
      preferenceWarning: "",
      ingredients: [
        { name: "番茄", quantityLabel: "2 个", required: true },
        { name: "鸡蛋", quantityLabel: "2 个", required: true },
        { name: "葱花", quantityLabel: "", required: false },
        { name: "盐", quantityLabel: "", required: false },
      ],
      steps: ["番茄切块，鸡蛋打散备用。", "热锅加油，先炒鸡蛋并盛出。", "锅中再加少许油，放入番茄炒出汁。", "倒回鸡蛋，加入盐和葱花翻匀。"],
    },
    {
      title: "土豆丝炒青椒",
      method: "炒",
      minutes: 15,
      preferenceWarning: "",
      ingredients: [
        { name: "土豆", quantityLabel: "1 个", required: true },
        { name: "青椒", quantityLabel: "1 个", required: true },
        { name: "生抽", quantityLabel: "", required: false },
      ],
      steps: ["土豆和青椒切丝。", "土豆丝冲洗后沥干。", "热锅加油，先炒土豆丝。", "加入青椒和生抽快速翻炒。"],
    },
    {
      title: "洋葱炒鸡胸肉",
      method: "炒",
      minutes: 20,
      preferenceWarning: "",
      ingredients: [
        { name: "洋葱", quantityLabel: "半个", required: true },
        { name: "鸡胸肉", quantityLabel: "1 块", required: true },
        { name: "黑胡椒", quantityLabel: "", required: false },
      ],
      steps: ["鸡胸肉切片，洋葱切丝。", "鸡胸肉用生抽和黑胡椒抓匀。", "热锅煎炒鸡胸肉至变色。", "加入洋葱炒软后调味。"],
    },
    {
      title: "香菜拌鸡丝",
      method: "凉拌",
      minutes: 10,
      preferenceWarning: "含香菜",
      ingredients: [
        { name: "香菜", quantityLabel: "1 把", required: true },
        { name: "鸡胸肉", quantityLabel: "1 块", required: true },
        { name: "生抽", quantityLabel: "", required: false },
        { name: "香醋", quantityLabel: "", required: false },
      ],
      steps: ["鸡胸肉煮熟后撕成丝。", "香菜切段。", "加入生抽和香醋拌匀。"],
    },
    {
      title: "鸡蛋葱花饼",
      method: "煎",
      minutes: 20,
      preferenceWarning: "",
      ingredients: [
        { name: "鸡蛋", quantityLabel: "2 个", required: true },
        { name: "葱花", quantityLabel: "", required: true },
        { name: "面粉", quantityLabel: "100g", required: true },
      ],
      steps: ["鸡蛋、面粉和水调成面糊。", "加入葱花和盐。", "平底锅刷油，小火煎至两面金黄。"],
    },
    {
      title: "番茄鸡蛋汤",
      method: "煮",
      minutes: 15,
      preferenceWarning: "",
      ingredients: [
        { name: "番茄", quantityLabel: "1 个", required: true },
        { name: "鸡蛋", quantityLabel: "1 个", required: true },
        { name: "葱花", quantityLabel: "", required: false },
      ],
      steps: ["番茄切块。", "锅中加水煮开，放入番茄。", "淋入蛋液，调味后撒葱花。"],
    },
    {
      title: "宫保鸡丁",
      method: "炒",
      minutes: 25,
      preferenceWarning: "可能偏辣",
      ingredients: [
        { name: "鸡胸肉", quantityLabel: "1 块", required: true },
        { name: "花生米", quantityLabel: "", required: true },
        { name: "黄瓜", quantityLabel: "", required: true },
        { name: "干辣椒", quantityLabel: "", required: false },
      ],
      steps: ["鸡胸肉切丁腌制。", "调好宫保汁。", "鸡丁滑炒后加入配菜。", "倒入料汁收浓。"],
    },
    {
      title: "麻婆豆腐",
      method: "炖",
      minutes: 20,
      preferenceWarning: "偏辣",
      ingredients: [
        { name: "豆腐", quantityLabel: "1 盒", required: true },
        { name: "猪肉末", quantityLabel: "100g", required: true },
        { name: "豆瓣酱", quantityLabel: "", required: true },
        { name: "花椒", quantityLabel: "", required: false },
      ],
      steps: ["豆腐切块焯水。", "炒香肉末和豆瓣酱。", "加入豆腐和水小火煮。", "勾芡后撒花椒粉。"],
    },
  ].map((recipe, index) => ({
    ...recipe,
    id: index + 1,
    status: "formal",
    sourceType: "manual",
    sourceText: "",
  }));

  return {
    version: 1,
    familyName: "张家",
    ingredients: seedIngredients,
    recipes: seedRecipes,
    consumptionEvents: [],
    loginAttempts: [],
    updatedAt: new Date().toISOString(),
  };
}
