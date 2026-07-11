const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_TEXT_MODEL = "qwen-plus";
const DEFAULT_VISION_MODEL = "qwen3-vl-plus";
const MAX_JSON_BYTES = 12 * 1024 * 1024;
const MAX_WEB_BYTES = 1024 * 1024;
const PANTRY = ["盐", "白糖", "生抽", "老抽", "食用油", "香醋", "料酒"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

    if (!pathname.startsWith("/api")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (request.method === "POST" && pathname === "/api/session") {
        const clientKey = request.headers.get("cf-connecting-ip") || "unknown";
        const { success } = await env.LOGIN_RATE_LIMITER.limit({ key: clientKey });
        if (!success) return json({ error: "尝试次数过多，请稍后再试" }, 429);

        const body = await readJson(request);
        if (body?.accessCode !== env.FAMILY_ACCESS_CODE) {
          return json({ error: "家庭访问码不正确" }, 401);
        }
        return json({
          token: env.FAMILY_ACCESS_CODE,
          family: { name: "张家", accessMode: "家庭访问码" },
        });
      }

      const authorization = request.headers.get("authorization") || "";
      const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : request.headers.get("x-family-access-code");
      if (token !== env.FAMILY_ACCESS_CODE) {
        return json({ error: "需要家庭访问码" }, 401);
      }

      if (request.method === "GET" && pathname === "/api/app") {
        return json(await readAppState(env));
      }

      if (request.method === "POST" && pathname === "/api/ingredients") {
        return await createIngredient(request, env);
      }

      if (request.method === "POST" && pathname === "/api/ingredients/batch") {
        return await createIngredientsBatch(request, env);
      }

      const ingredientMatch = pathname.match(/^\/api\/ingredients\/([^/]+)$/);
      if (ingredientMatch && request.method === "PATCH") {
        return await updateIngredient(request, env, ingredientMatch[1]);
      }
      if (ingredientMatch && request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM ingredients WHERE id = ?").bind(ingredientMatch[1]).run();
        return json(await readAppState(env));
      }

      if (request.method === "POST" && pathname === "/api/drafts/analyze") {
        return await analyzeDraft(request, env);
      }

      const draftMatch = pathname.match(/^\/api\/drafts\/([^/]+)$/);
      if (draftMatch && request.method === "PATCH") {
        return await updateRecipe(request, env, draftMatch[1], "draft");
      }

      const confirmMatch = pathname.match(/^\/api\/drafts\/([^/]+)\/confirm$/);
      if (confirmMatch && request.method === "POST") {
        return await confirmDraft(env, confirmMatch[1]);
      }

      const recipeMatch = pathname.match(/^\/api\/recipes\/([^/]+)$/);
      if (recipeMatch && request.method === "PATCH") {
        return await updateRecipe(request, env, recipeMatch[1], "formal");
      }
      if (recipeMatch && request.method === "DELETE") {
        const result = await env.DB.prepare("DELETE FROM recipes WHERE id = ? AND status = 'formal'")
          .bind(recipeMatch[1]).run();
        if (result.meta.changes === 0) return json({ error: "正式菜谱不存在" }, 404);
        return json(await readAppState(env));
      }

      return json({ error: "Not Found" }, 404);
    } catch (error) {
      if (!error.status || error.status >= 500) console.error(error);
      return json({ error: error.message || "服务端处理失败" }, error.status || 500);
    }
  },
};

function json(value, status = 200) {
  return Response.json(value, { status });
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_JSON_BYTES) {
    const error = new Error("请求内容不能超过 12MB");
    error.status = 413;
    throw error;
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
      const error = new Error("请求内容不能超过 12MB");
      error.status = 413;
      throw error;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    const error = new Error("请求内容不是有效的 JSON");
    error.status = 400;
    throw error;
  }
}

async function createIngredient(request, env) {
  const body = await readJson(request);
  const name = normalizeIngredientName(String(body?.name || ""));
  if (!name) return json({ error: "请输入食材名称" }, 422);

  const categoryInput = String(body?.category || "").trim();
  const category = categoryInput ? normalizeCategory(categoryInput) : classifyIngredient(name);
  const state = normalizeState(body?.state);
  const result = await env.DB.prepare(`
    INSERT INTO ingredients (name, category, state) VALUES (?, ?, ?)
    ON CONFLICT(name) DO NOTHING
  `)
    .bind(name, category, state).run();
  if (result.meta.changes === 0) return json({ error: "这个食材已经在清单里" }, 409);
  return json(await readAppState(env));
}

async function createIngredientsBatch(request, env) {
  const body = await readJson(request);
  const parsed = await parseIngredientInput(body?.text || "", env);
  if (parsed.length > 0) {
    const sql = `
      INSERT INTO ingredients (name, category, state)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        category = excluded.category,
        state = CASE WHEN excluded.state = 'none' THEN ingredients.state ELSE excluded.state END
    `;
    await env.DB.batch(parsed.map((item) => env.DB.prepare(sql).bind(item.name, item.category, item.state)));
  }
  return json(await readAppState(env));
}

async function updateIngredient(request, env, id) {
  const ingredient = await env.DB.prepare("SELECT * FROM ingredients WHERE id = ?").bind(id).first();
  if (!ingredient) return json({ error: "食材不存在" }, 404);

  const body = await readJson(request);
  const name = normalizeIngredientName(String(body?.name ?? ingredient.name));
  if (!name) return json({ error: "请输入食材名称" }, 422);

  const categoryInput = String(body?.category ?? ingredient.category).trim();
  const category = categoryInput ? normalizeCategory(categoryInput) : classifyIngredient(name);
  const state = normalizeState(body?.state ?? ingredient.state);
  const result = await env.DB.prepare(`
    UPDATE ingredients SET name = ?, category = ?, state = ?
    WHERE id = ? AND NOT EXISTS (SELECT 1 FROM ingredients WHERE name = ? AND id != ?)
  `).bind(name, category, state, id, name, id).run();
  if (result.meta.changes === 0) {
    const duplicate = await env.DB.prepare("SELECT id FROM ingredients WHERE name = ? AND id != ?")
      .bind(name, id).first();
    return json({ error: duplicate ? "这个食材已经在清单里" : "食材不存在" }, duplicate ? 409 : 404);
  }
  return json(await readAppState(env));
}

async function analyzeDraft(request, env) {
  const body = await readJson(request);
  const sourceType = body?.sourceType || "text";
  let sourceText = body?.content || "";
  const imageDataUrl = body?.imageDataUrl || "";

  if (sourceType !== "image" && !String(sourceText).trim()) {
    return json({ error: "请先提供菜谱内容" }, 422);
  }
  if (sourceType === "web") sourceText = await readWebPageText(sourceText);
  if (sourceType === "image" && !imageDataUrl) {
    return json({ error: "请先选择一张菜谱图片" }, 422);
  }

  const draft = await createRecipeDraft(sourceType, sourceText, imageDataUrl, env);
  return json({ draft, app: await readAppState(env) });
}

async function updateRecipe(request, env, id, status) {
  const body = await readJson(request);
  const title = String(body?.title || "").trim().slice(0, 40);
  const rawIngredients = Array.isArray(body?.ingredients) ? body.ingredients : [];
  const ingredients = rawIngredients.map((item) => {
    const sanitized = sanitizeIngredientItems([item], { includeQuantity: true })[0];
    return sanitized ? { ...sanitized, required: Boolean(item.required) } : null;
  }).filter(Boolean);
  const rawSteps = Array.isArray(body?.steps) ? body.steps.slice(0, 12) : [];
  const steps = rawSteps.map((step) => String(step).trim()).filter(Boolean);

  if (!title || ingredients.length === 0 || ingredients.length !== rawIngredients.length
    || steps.length === 0 || steps.length !== rawSteps.length) {
    return json({ error: "请填写标题、食材和烹饪步骤" }, 422);
  }

  const statements = [
    env.DB.prepare(`
      UPDATE recipes SET title = ?, method = ?, minutes = ?, preference_warning = ?
      WHERE id = ? AND status = ?
    `).bind(title, normalizeMethod(body?.method), clampMinutes(body?.minutes),
      String(body?.preferenceWarning || "").trim().slice(0, 30), id, status),
    env.DB.prepare(`
      DELETE FROM recipe_ingredients
      WHERE recipe_id = ? AND EXISTS (SELECT 1 FROM recipes WHERE id = ? AND status = ?)
    `).bind(id, id, status),
    env.DB.prepare(`
      DELETE FROM recipe_steps
      WHERE recipe_id = ? AND EXISTS (SELECT 1 FROM recipes WHERE id = ? AND status = ?)
    `).bind(id, id, status),
    env.DB.prepare(`
      INSERT INTO recipe_ingredients (recipe_id, name, quantity_label, required)
      SELECT ?, item.value ->> '$.name', item.value ->> '$.quantityLabel', item.value ->> '$.required'
      FROM json_each(?) AS item
      WHERE EXISTS (SELECT 1 FROM recipes WHERE id = ? AND status = ?)
    `).bind(id, JSON.stringify(ingredients.map((item) => ({
      name: item.name,
      quantityLabel: item.quantityLabel,
      required: item.required ? 1 : 0,
    }))), id, status),
    env.DB.prepare(`
      INSERT INTO recipe_steps (recipe_id, position, text)
      SELECT ?, CAST(step.key AS INTEGER) + 1, step.value
      FROM json_each(?) AS step
      WHERE EXISTS (SELECT 1 FROM recipes WHERE id = ? AND status = ?)
    `).bind(id, JSON.stringify(steps), id, status),
  ];
  const results = await env.DB.batch(statements);
  if (results[0].meta.changes === 0) {
    return json({ error: status === "draft" ? "菜谱草稿不存在" : "正式菜谱不存在" }, 404);
  }

  const app = await readAppState(env);
  const recipeId = Number(id);
  if (status === "draft") {
    return json({ draft: app.drafts.find((item) => item.id === recipeId), app });
  }
  const savedRecipe = [...app.matches.ready, ...app.matches.missing].find((item) => item.id === recipeId);
  return json({ recipe: savedRecipe, app });
}

async function confirmDraft(env, id) {
  const result = await env.DB.prepare(
    "UPDATE recipes SET status = 'formal' WHERE id = ? AND status = 'draft'",
  ).bind(id).run();
  if (result.meta.changes === 0) {
    return json({ error: "菜谱草稿不存在或已经保存" }, 404);
  }
  return json({ savedRecipeId: Number(id), app: await readAppState(env) });
}

async function readAppState(env) {
  const [ingredientResult, recipeResult, recipeIngredientResult, stepResult] = await env.DB.batch([
    env.DB.prepare("SELECT id, name, category, state FROM ingredients ORDER BY category, name"),
    env.DB.prepare("SELECT * FROM recipes ORDER BY id DESC"),
    env.DB.prepare(`
      SELECT recipe_id AS recipeId, name, quantity_label AS quantityLabel, required
      FROM recipe_ingredients ORDER BY id
    `),
    env.DB.prepare(`
      SELECT recipe_id AS recipeId, position, text FROM recipe_steps ORDER BY recipe_id, position
    `),
  ]);
  const ingredients = ingredientResult.results;
  const recipes = recipeResult.results;
  const ingredientsByRecipe = new Map();
  const stepsByRecipe = new Map();

  for (const item of recipeIngredientResult.results) {
    const current = ingredientsByRecipe.get(item.recipeId) || [];
    current.push({ ...item, required: Boolean(item.required) });
    ingredientsByRecipe.set(item.recipeId, current);
  }
  for (const step of stepResult.results) {
    const current = stepsByRecipe.get(step.recipeId) || [];
    current.push(step);
    stepsByRecipe.set(step.recipeId, current);
  }

  const formalRecipes = recipes.filter((recipe) => recipe.status === "formal")
    .map((recipe) => toRecipe(recipe, ingredientsByRecipe, stepsByRecipe));
  const drafts = recipes.filter((recipe) => recipe.status === "draft")
    .map((recipe) => toRecipe(recipe, ingredientsByRecipe, stepsByRecipe));
  return {
    family: { name: "张家", accessMode: "家庭访问码" },
    ai: {
      configured: Boolean(env.DASHSCOPE_API_KEY),
      textModel: env.DASHSCOPE_TEXT_MODEL || DEFAULT_TEXT_MODEL,
      visionModel: env.DASHSCOPE_VISION_MODEL || DEFAULT_VISION_MODEL,
    },
    pantry: PANTRY,
    categories: groupIngredients(ingredients),
    ingredients,
    matches: buildMatches(ingredients, formalRecipes),
    drafts,
  };
}

function toRecipe(recipe, ingredientsByRecipe, stepsByRecipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    method: recipe.method,
    minutes: recipe.minutes,
    preferenceWarning: recipe.preference_warning,
    status: recipe.status,
    sourceType: recipe.source_type,
    sourceText: recipe.source_text,
    ingredients: ingredientsByRecipe.get(recipe.id) || [],
    steps: stepsByRecipe.get(recipe.id) || [],
  };
}

function buildMatches(ingredients, recipes) {
  const available = new Set(ingredients.map((item) => item.name));
  const pantry = new Set(PANTRY);
  const priority = new Set(ingredients.filter((item) => item.state === "priority" || item.state === "expiring")
    .map((item) => item.name));
  const decorated = recipes.map((recipe) => {
    const required = recipe.ingredients.filter((item) => item.required);
    const missing = required.filter((item) => !available.has(item.name) && !pantry.has(item.name))
      .map((item) => item.name);
    return {
      ...recipe,
      missing,
      usesPriority: required.some((item) => priority.has(item.name)),
      substitutions: missing.flatMap((name) => substituteFor(name)),
    };
  }).sort((a, b) => {
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    if (Boolean(a.preferenceWarning) !== Boolean(b.preferenceWarning)) return a.preferenceWarning ? 1 : -1;
    return a.minutes - b.minutes;
  });
  return {
    ready: decorated.filter((recipe) => recipe.missing.length === 0),
    missing: decorated.filter((recipe) => recipe.missing.length > 0),
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

async function parseIngredientInput(text, env) {
  if (!env.DASHSCOPE_API_KEY) return parseIngredientText(text);
  const result = await callDashScopeJson({
    model: env.DASHSCOPE_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    messages: [
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
      { role: "user", content: text },
    ],
  }, env);
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

async function createRecipeDraft(sourceType, sourceText, imageDataUrl, env) {
  const extracted = env.DASHSCOPE_API_KEY
    ? await extractRecipeWithLLM(sourceType, sourceText, imageDataUrl, env)
    : extractRecipeLocally(sourceText);
  const required = sanitizeIngredientItems(extracted.requiredIngredients, { includeQuantity: true });
  const optional = sanitizeIngredientItems(extracted.optionalIngredients, { includeQuantity: true });
  const steps = Array.isArray(extracted.steps) && extracted.steps.length > 0
    ? extracted.steps.map((step) => String(step).trim()).filter(Boolean).slice(0, 8)
    : splitSteps(sourceText);
  const title = String(extracted.title || sourceText.match(/《(.+?)》/)?.[1]
    || sourceText.split(/[。\n]/)[0].slice(0, 12) || "新菜谱草稿").slice(0, 40);
  const method = normalizeMethod(extracted.method || inferMethod(sourceText));
  const minutes = clampMinutes(extracted.minutes || inferMinutes(sourceText));
  const preferenceWarning = String(extracted.preferenceWarning || (/辣/.test(sourceText) ? "可能偏辣" : "")).slice(0, 30);
  const storedSource = sourceType === "image" ? String(sourceText || "图片导入").slice(0, 1000) : sourceText.slice(0, 4000);
  const recipe = await env.DB.prepare(`
    INSERT INTO recipes (title, method, minutes, preference_warning, status, source_type, source_text)
    VALUES (?, ?, ?, ?, 'draft', ?, ?) RETURNING id
  `).bind(title, method, minutes, preferenceWarning, sourceType, storedSource).first();
  const ingredients = [
    ...required.map((item) => ({ ...item, required: 1 })),
    ...optional.map((item) => ({ ...item, required: 0 })),
  ];
  const statements = [
    env.DB.prepare(`
      INSERT INTO recipe_ingredients (recipe_id, name, quantity_label, required)
      SELECT ?, item.value ->> '$.name', item.value ->> '$.quantityLabel', item.value ->> '$.required'
      FROM json_each(?) AS item
    `).bind(recipe.id, JSON.stringify(ingredients)),
    env.DB.prepare(`
      INSERT INTO recipe_steps (recipe_id, position, text)
      SELECT ?, CAST(step.key AS INTEGER) + 1, step.value FROM json_each(?) AS step
    `).bind(recipe.id, JSON.stringify(steps)),
  ];
  await env.DB.batch(statements);
  return (await readAppState(env)).drafts.find((draft) => draft.id === recipe.id);
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

async function extractRecipeWithLLM(sourceType, sourceText, imageDataUrl, env) {
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
  return callDashScopeJson({
    model: imageDataUrl ? env.DASHSCOPE_VISION_MODEL || DEFAULT_VISION_MODEL : env.DASHSCOPE_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    messages,
  }, env);
}

function splitSteps(text) {
  const chunks = text.split(/(?:\d+[.、])|[。\n]/).map((step) => step.trim()).filter((step) => step.length > 6);
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
  const match = text.match(/(\d+)\s*分钟/);
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

async function readWebPageText(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    const error = new Error("请输入有效的网页地址");
    error.status = 422;
    throw error;
  }
  if (!["http:", "https:"].includes(parsed.protocol) || isPrivateHostname(parsed.hostname)) {
    const error = new Error("请输入可公开访问的 HTTP(S) 网页地址");
    error.status = 422;
    throw error;
  }
  const response = await fetch(parsed, { redirect: "error" });
  if (!response.ok) throw new Error(`网页读取失败（HTTP ${response.status}）`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_WEB_BYTES) {
    const error = new Error("网页内容不能超过 1MB");
    error.status = 422;
    throw error;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEB_BYTES) {
      await reader.cancel();
      const error = new Error("网页内容不能超过 1MB");
      error.status = 422;
      throw error;
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
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (/^(127|0)\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
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
    ["西红柿", "番茄"], ["马铃薯", "土豆"], ["青葱", "葱花"], ["葱", "葱花"],
    ["酱油", "生抽"], ["油", "食用油"], ["糖", "白糖"], ["花生", "花生米"],
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

async function callDashScopeJson({ model, messages }, env) {
  const baseUrl = env.DASHSCOPE_BASE_URL || DEFAULT_BASE_URL;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.1 }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(formatDashScopeError(payload.error?.message));
  const content = readAssistantContent(payload);
  try {
    return JSON.parse(extractJson(content));
  } catch {
    throw new Error("千问返回内容不是可解析的 JSON");
  }
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

function formatDashScopeError(message) {
  const text = String(message || "");
  if (/api key/i.test(text)) return "DashScope API Key 无效或无权限，请更换有效 Key 后重试";
  return text || "千问 API 调用失败";
}
