import cloudbase from "@cloudbase/node-sdk";
import express from "express";

const STATE_COLLECTION = "happy_eat_state";
const STATE_DOCUMENT = "main";
const PANTRY = ["盐", "白糖", "生抽", "老抽", "食用油", "香醋", "料酒"];
const app = express();
const cloudbaseApp = cloudbase.init({ env: process.env.CLOUDBASE_ENV_ID });
const database = cloudbaseApp.database();
const aiModel = cloudbaseApp.ai().createModel("cloudbase");

app.set("trust proxy", true);
app.use(express.json({ limit: "12mb" }));

app.post("/api/session", route(async (req, res) => {
  const clientKey = String(req.headers["x-forwarded-for"] || req.ip || "unknown").split(",")[0].trim();
  const accepted = req.body?.accessCode === process.env.FAMILY_ACCESS_CODE;
  const state = await mutateState((draft) => {
    const now = Date.now();
    draft.loginAttempts = (draft.loginAttempts || []).filter((item) => now - item.windowStart < 60_000);
    const attempt = draft.loginAttempts.find((item) => item.key === clientKey);
    if (attempt?.count >= 10) throw httpError(429, "尝试次数过多，请稍后再试");
    if (accepted) {
      draft.loginAttempts = draft.loginAttempts.filter((item) => item.key !== clientKey);
    } else if (attempt) {
      attempt.count += 1;
    } else {
      draft.loginAttempts.push({ key: clientKey, count: 1, windowStart: now });
    }
  });
  if (!accepted) return res.status(401).json({ error: "家庭访问码不正确" });
  res.json({
    token: process.env.FAMILY_ACCESS_CODE,
    family: { name: state.familyName || "张家", accessMode: "家庭访问码" },
  });
}));

app.use("/api", (req, res, next) => {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : req.headers["x-family-access-code"];
  if (token !== process.env.FAMILY_ACCESS_CODE) return res.status(401).json({ error: "需要家庭访问码" });
  next();
});

app.get("/api/app", route(async (_req, res) => {
  res.json(buildApp(await readState()));
}));

app.post("/api/ingredients", route(async (req, res) => {
  const name = normalizeIngredientName(String(req.body?.name || ""));
  if (!name) throw httpError(422, "请输入食材名称");
  const state = await mutateState((draft) => {
    if (draft.ingredients.some((item) => item.name === name)) throw httpError(409, "这个食材已经在清单里");
    const categoryInput = String(req.body?.category || "").trim();
    draft.ingredients.push({
      id: nextId(draft.ingredients),
      name,
      category: categoryInput ? normalizeCategory(categoryInput) : classifyIngredient(name),
      state: normalizeState(req.body?.state),
    });
  });
  res.json(buildApp(state));
}));

app.post("/api/ingredients/batch", route(async (req, res) => {
  const parsed = await parseIngredientInput(req.body?.text || "");
  const state = await mutateState((draft) => {
    for (const item of parsed) {
      const existing = draft.ingredients.find((ingredient) => ingredient.name === item.name);
      if (existing) {
        existing.category = item.category;
        if (item.state !== "none") existing.state = item.state;
      } else {
        draft.ingredients.push({ ...item, id: nextId(draft.ingredients) });
      }
    }
  });
  res.json(buildApp(state));
}));

app.patch("/api/ingredients/:id", route(async (req, res) => {
  const state = await mutateState((draft) => {
    const ingredient = draft.ingredients.find((item) => String(item.id) === req.params.id);
    if (!ingredient) throw httpError(404, "食材不存在");
    const name = normalizeIngredientName(String(req.body?.name ?? ingredient.name));
    if (!name) throw httpError(422, "请输入食材名称");
    if (draft.ingredients.some((item) => item.id !== ingredient.id && item.name === name)) {
      throw httpError(409, "这个食材已经在清单里");
    }
    const categoryInput = String(req.body?.category ?? ingredient.category).trim();
    ingredient.name = name;
    ingredient.category = categoryInput ? normalizeCategory(categoryInput) : classifyIngredient(name);
    ingredient.state = normalizeState(req.body?.state ?? ingredient.state);
  });
  res.json(buildApp(state));
}));

app.delete("/api/ingredients/:id", route(async (req, res) => {
  const state = await mutateState((draft) => {
    draft.ingredients = draft.ingredients.filter((item) => String(item.id) !== req.params.id);
  });
  res.json(buildApp(state));
}));

app.post("/api/drafts/analyze", route(async (req, res) => {
  const sourceType = req.body?.sourceType || "text";
  let sourceText = String(req.body?.content || "");
  const imageDataUrl = req.body?.imageDataUrl || "";
  if (sourceType !== "image" && !sourceText.trim()) throw httpError(422, "请先提供菜谱内容");
  if (sourceType === "web") sourceText = await readWebPageText(sourceText);
  if (sourceType === "image" && !imageDataUrl) throw httpError(422, "请先选择一张菜谱图片");
  const recipe = await createRecipe(sourceType, sourceText, imageDataUrl);
  const state = await mutateState((draft) => {
    recipe.id = nextId(draft.recipes);
    draft.recipes.push(recipe);
  });
  res.json({ draft: publicRecipe(recipe), app: buildApp(state) });
}));

app.patch("/api/drafts/:id", route(async (req, res) => {
  const state = await updateRecipe(req.params.id, "draft", req.body);
  const draft = state.recipes.find((item) => String(item.id) === req.params.id);
  res.json({ draft: publicRecipe(draft), app: buildApp(state) });
}));

app.post("/api/drafts/:id/confirm", route(async (req, res) => {
  const state = await mutateState((draft) => {
    const recipe = draft.recipes.find((item) => String(item.id) === req.params.id && item.status === "draft");
    if (!recipe) throw httpError(404, "菜谱草稿不存在或已经保存");
    recipe.status = "formal";
  });
  res.json({ savedRecipeId: Number(req.params.id), app: buildApp(state) });
}));

app.patch("/api/recipes/:id", route(async (req, res) => {
  const state = await updateRecipe(req.params.id, "formal", req.body);
  const recipe = state.recipes.find((item) => String(item.id) === req.params.id);
  res.json({ recipe: decorateRecipe(publicRecipe(recipe), state.ingredients), app: buildApp(state) });
}));

app.delete("/api/recipes/:id", route(async (req, res) => {
  const state = await mutateState((draft) => {
    const index = draft.recipes.findIndex((item) => String(item.id) === req.params.id && item.status === "formal");
    if (index === -1) throw httpError(404, "正式菜谱不存在");
    draft.recipes.splice(index, 1);
  });
  res.json(buildApp(state));
}));

app.use((_req, res) => res.status(404).json({ error: "Not Found" }));
app.use((error, _req, res, _next) => {
  if (!error.status || error.status >= 500) console.error(error);
  res.status(error.status || 500).json({ error: error.message || "服务端处理失败" });
});

app.listen(9000, "0.0.0.0", () => console.log("Happy Eat API listening on port 9000"));

function route(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

async function readState(reference = database.collection(STATE_COLLECTION).doc(STATE_DOCUMENT)) {
  const result = await reference.get();
  const state = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!state) throw httpError(503, "CloudBase 数据尚未初始化");
  return structuredClone(state);
}

async function mutateState(mutator) {
  return database.runTransaction(async (transaction) => {
    const reference = transaction.collection(STATE_COLLECTION).doc(STATE_DOCUMENT);
    const state = await readState(reference);
    await mutator(state);
    state.version = Number(state.version || 0) + 1;
    state.updatedAt = new Date().toISOString();
    const { _id, ...storedState } = state;
    await reference.set(storedState);
    return state;
  });
}

async function updateRecipe(id, status, body) {
  const title = String(body?.title || "").trim().slice(0, 40);
  const rawIngredients = Array.isArray(body?.ingredients) ? body.ingredients : [];
  const ingredients = rawIngredients.map((item) => {
    const sanitized = sanitizeIngredients([item], true)[0];
    return sanitized ? { name: sanitized.name, quantityLabel: sanitized.quantityLabel, required: Boolean(item.required) } : null;
  }).filter(Boolean);
  const rawSteps = Array.isArray(body?.steps) ? body.steps.slice(0, 12) : [];
  const steps = rawSteps.map((step) => String(step).trim()).filter(Boolean);
  if (!title || !ingredients.length || ingredients.length !== rawIngredients.length
    || !steps.length || steps.length !== rawSteps.length) {
    throw httpError(422, "请填写标题、食材和烹饪步骤");
  }
  return mutateState((draft) => {
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
}

function buildApp(state) {
  const formal = state.recipes.filter((recipe) => recipe.status === "formal").map(publicRecipe);
  const drafts = state.recipes.filter((recipe) => recipe.status === "draft").map(publicRecipe);
  const decorated = formal.map((recipe) => decorateRecipe(recipe, state.ingredients)).sort((a, b) => {
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    if (Boolean(a.preferenceWarning) !== Boolean(b.preferenceWarning)) return a.preferenceWarning ? 1 : -1;
    return a.minutes - b.minutes;
  });
  return {
    family: { name: state.familyName || "张家", accessMode: "家庭访问码" },
    ai: {
      configured: true,
      textModel: process.env.CLOUDBASE_TEXT_MODEL || "deepseek-v4-flash",
      visionModel: process.env.CLOUDBASE_VISION_MODEL || "qwen3.5-plus",
    },
    pantry: PANTRY,
    categories: groupIngredients(state.ingredients),
    ingredients: state.ingredients,
    matches: {
      ready: decorated.filter((recipe) => recipe.missing.length === 0),
      missing: decorated.filter((recipe) => recipe.missing.length > 0),
    },
    drafts,
  };
}

function publicRecipe(recipe) {
  return {
    ...recipe,
    steps: recipe.steps.map((text, index) => ({ recipeId: recipe.id, position: index + 1, text })),
  };
}

function decorateRecipe(recipe, ingredients) {
  const available = new Set(ingredients.map((item) => item.name));
  const priority = new Set(ingredients.filter((item) => ["priority", "expiring"].includes(item.state)).map((item) => item.name));
  const missing = recipe.ingredients.filter((item) => item.required && !available.has(item.name) && !PANTRY.includes(item.name))
    .map((item) => item.name);
  return {
    ...recipe,
    missing,
    usesPriority: recipe.ingredients.some((item) => item.required && priority.has(item.name)),
    substitutions: missing.flatMap(substituteFor),
  };
}

function groupIngredients(ingredients) {
  const groups = new Map();
  for (const ingredient of ingredients) {
    const items = groups.get(ingredient.category) || [];
    items.push(ingredient);
    groups.set(ingredient.category, items);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}

async function parseIngredientInput(text) {
  const result = await callCloudBaseJson({
    model: process.env.CLOUDBASE_TEXT_MODEL || "deepseek-v4-flash",
    messages: [
      { role: "system", content: "从用户文字提取食材。只返回 JSON：{\"ingredients\":[{\"name\":\"番茄\",\"category\":\"蔬菜\",\"state\":\"none\"}]}。category 只能是蔬菜、肉禽蛋、主食、调味、乳品、其他；state 只能是 priority、expiring、frozen、none。" },
      { role: "user", content: String(text) },
    ],
  });
  return sanitizeIngredients(result.ingredients);
}

function parseIngredientText(text) {
  return String(text).replace(/冰箱里有|家里有|还有|，/g, "、").split(/[、,\n]/)
    .map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
      const state = /快过期|快坏/.test(chunk) ? "expiring"
        : /今天用|优先|剩/.test(chunk) ? "priority" : /冷冻|冻/.test(chunk) ? "frozen" : "none";
      const cleaned = chunk.replace(/快过期|快坏|今天用|优先用掉|优先|冷冻中|冷冻|冻着|剩/g, "").trim();
      const name = normalizeIngredientName(cleaned.replace(/[一二三四五六七八九十半\d.]+\s*(个|颗|根|块|片|包|袋|盒|瓶|碗|斤|克|g|kg|勺|把)/i, "").trim());
      return { name, category: classifyIngredient(name), state };
    }).filter((item) => item.name);
}

async function createRecipe(sourceType, sourceText, imageDataUrl) {
  const extracted = await extractRecipeWithLLM(sourceText, imageDataUrl);
  const required = sanitizeIngredients(extracted.requiredIngredients, true).map((item) => ({ ...item, required: true }));
  const optional = sanitizeIngredients(extracted.optionalIngredients, true).map((item) => ({ ...item, required: false }));
  const steps = Array.isArray(extracted.steps) && extracted.steps.length
    ? extracted.steps.map((step) => String(step).trim()).filter(Boolean).slice(0, 8)
    : splitSteps(sourceText);
  return {
    title: String(extracted.title || sourceText.split(/[。\n]/)[0] || "新菜谱草稿").slice(0, 40),
    method: normalizeMethod(extracted.method || inferMethod(sourceText)),
    minutes: clampMinutes(extracted.minutes || inferMinutes(sourceText)),
    preferenceWarning: String(extracted.preferenceWarning || "").slice(0, 30),
    status: "draft",
    sourceType,
    sourceText: sourceType === "image" ? "图片导入" : sourceText.slice(0, 4000),
    ingredients: [...required, ...optional],
    steps,
  };
}

function extractRecipeLocally(text) {
  const ingredients = parseIngredientText(text);
  const requiredCount = Math.max(1, Math.min(4, ingredients.length));
  return {
    title: text.split(/[。\n]/)[0].slice(0, 12) || "新菜谱草稿",
    method: inferMethod(text),
    minutes: inferMinutes(text),
    preferenceWarning: /辣/.test(text) ? "可能偏辣" : "",
    requiredIngredients: ingredients.slice(0, requiredCount),
    optionalIngredients: ingredients.slice(requiredCount),
    steps: splitSteps(text),
  };
}

async function extractRecipeWithLLM(sourceText, imageDataUrl) {
  const prompt = [
    "提取结构化中文菜谱草稿，只返回 JSON。",
    "结构：{\"title\":\"番茄炒蛋\",\"method\":\"炒\",\"minutes\":15,\"preferenceWarning\":\"\",\"requiredIngredients\":[{\"name\":\"番茄\",\"quantityLabel\":\"2个\"}],\"optionalIngredients\":[],\"steps\":[\"番茄切块。\"]}",
    "method 只能是炒、煮、蒸、煎、烤、凉拌、炖、其他。调味品通常放 optionalIngredients。",
    sourceText ? `来源：\n${sourceText.slice(0, 5000)}` : "请识别图片中的菜谱。",
  ].join("\n");
  return callCloudBaseJson({
    model: imageDataUrl ? process.env.CLOUDBASE_VISION_MODEL || "qwen3.5-plus" : process.env.CLOUDBASE_TEXT_MODEL || "deepseek-v4-flash",
    messages: [{
      role: "user",
      content: imageDataUrl ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ] : prompt,
    }],
  });
}

async function readWebPageText(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw httpError(422, "请输入有效的网页地址");
  }
  if (!["http:", "https:"].includes(url.protocol) || isPrivateHostname(url.hostname)) {
    throw httpError(422, "请输入可公开访问的 HTTP(S) 网页地址");
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw httpError(422, `网页读取失败（HTTP ${response.status}）`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 1024 * 1024) throw httpError(422, "网页内容不能超过 1MB");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    total += chunk.byteLength;
    if (total > 1024 * 1024) {
      await reader.cancel();
      throw httpError(422, "网页内容不能超过 1MB");
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes).replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);
}

async function callCloudBaseJson({ model, messages }) {
  const result = await aiModel.generateText({ model, messages, temperature: 0.1, enable_thinking: false });
  if (result.error) throw new Error(String(result.error?.message || result.error));
  const text = String(result.text || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("AI 返回内容不是可解析的 JSON");
  return JSON.parse(text.slice(start, end + 1));
}

function sanitizeIngredients(items, includeQuantity = false) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const name = normalizeIngredientName(String(item?.name || ""));
    if (!name) return null;
    const result = { name, category: normalizeCategory(item?.category || classifyIngredient(name)), state: normalizeState(item?.state) };
    if (includeQuantity) result.quantityLabel = String(item?.quantityLabel || item?.quantity || "").trim().slice(0, 20);
    return result;
  }).filter(Boolean).slice(0, 60);
}

function normalizeIngredientName(rawName) {
  const name = rawName.replace(/[，,。；;]/g, "").trim();
  return new Map([["西红柿", "番茄"], ["马铃薯", "土豆"], ["青葱", "葱花"], ["葱", "葱花"], ["酱油", "生抽"], ["油", "食用油"], ["糖", "白糖"], ["花生", "花生米"]]).get(name) || name;
}

function classifyIngredient(name) {
  if (/番茄|土豆|青椒|洋葱|香菜|葱|胡萝卜|冬笋|豆腐|白菜|黄瓜|丝瓜|生姜|蒜/.test(name)) return "蔬菜";
  if (/鸡|蛋|猪|牛|鱼|虾|肉|排骨|培根|火腿/.test(name)) return "肉禽蛋";
  if (/米饭|挂面|面包|面粉|米线/.test(name)) return "主食";
  if (/盐|糖|生抽|老抽|醋|油|料酒|胡椒|豆瓣酱|辣椒|花椒|香油/.test(name)) return "调味";
  if (/奶|酸奶|芝士|黄油/.test(name)) return "乳品";
  return "其他";
}

function normalizeCategory(value) {
  return ["蔬菜", "肉禽蛋", "主食", "调味", "乳品", "其他"].includes(String(value).trim()) ? String(value).trim() : "其他";
}

function normalizeState(value) {
  return ["priority", "expiring", "frozen", "none"].includes(String(value).trim()) ? String(value).trim() : "none";
}

function normalizeMethod(value) {
  return ["炒", "煮", "蒸", "煎", "烤", "凉拌", "炖", "其他"].includes(String(value).trim()) ? String(value).trim() : "其他";
}

function inferMethod(text) {
  return ["蒸", "煮", "煎", "烤", "凉拌", "炖", "炒"].find((method) => String(text).includes(method)) || "炒";
}

function inferMinutes(text) {
  const match = String(text).match(/(\d+)\s*分钟/);
  return match ? Number(match[1]) : /炖|红烧|排骨/.test(text) ? 60 : 15;
}

function clampMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) ? Math.max(1, Math.min(240, Math.round(minutes))) : 15;
}

function splitSteps(text) {
  const steps = String(text).split(/(?:\d+[.、)])|[。\n]/).map((step) => step.trim()).filter((step) => step.length > 6);
  return steps.length ? steps.slice(0, 8) : ["处理食材并备好调味品。", "加热后放入主要食材烹饪。", "调味后装盘。"];
}

function substituteFor(name) {
  return ({
    青椒: ["可用彩椒或尖椒替代青椒"],
    鸡胸肉: ["可用鸡腿肉替代鸡胸肉"],
    香菜: ["不吃香菜时可省略或用葱花替代"],
    豆腐: ["可用千张或豆皮替代豆腐"],
  })[name] || [];
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (/^(127|0|10)\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function nextId(items) {
  return items.reduce((maximum, item) => Math.max(maximum, Number(item.id) || 0), 0) + 1;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
