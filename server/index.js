import express from "express";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

loadDotEnv(path.join(root, ".env"));

const port = Number(process.env.PORT || 5173);
const accessCode = process.env.FAMILY_ACCESS_CODE || "happy-eat";
const databasePath = path.resolve(root, process.env.DATABASE_PATH || "data/happy-eat.sqlite");
const dashScopeApiKey = process.env.DASHSCOPE_API_KEY || "";
const dashScopeBaseUrl = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const dashScopeTextModel = process.env.DASHSCOPE_TEXT_MODEL || "qwen-plus";
const dashScopeVisionModel = process.env.DASHSCOPE_VISION_MODEL || "qwen3-vl-plus";
const llmConfigured = Boolean(dashScopeApiKey);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    quantity_label TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'none'
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    method TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    preference_warning TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'formal',
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_text TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    quantity_label TEXT NOT NULL DEFAULT '',
    required INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS recipe_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
  );
`);

seedDatabase();

const app = express();
app.use(express.json({ limit: "12mb" }));

app.post("/api/session", (req, res) => {
  if (req.body?.accessCode !== accessCode) {
    return res.status(401).json({ error: "家庭访问码不正确" });
  }

  res.json({
    token: accessCode,
    family: {
      name: "张家",
      accessMode: "家庭访问码",
    },
  });
});

app.use("/api", (req, res, next) => {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.get("x-family-access-code");

  if (token !== accessCode) {
    return res.status(401).json({ error: "需要家庭访问码" });
  }

  next();
});

app.get("/api/app", (req, res) => {
  res.json(readAppState());
});

app.post("/api/ingredients", (req, res) => {
  const name = normalizeIngredientName(String(req.body?.name || ""));

  if (!name) {
    return res.status(422).json({ error: "请输入食材名称" });
  }

  if (db.prepare("SELECT id FROM ingredients WHERE name = ?").get(name)) {
    return res.status(409).json({ error: "这个食材已经在清单里" });
  }

  const categoryInput = String(req.body?.category || "").trim();
  const category = categoryInput ? normalizeCategory(categoryInput) : classifyIngredient(name);
  const state = normalizeState(req.body?.state);

  db.prepare(`
    INSERT INTO ingredients (name, category, state)
    VALUES (?, ?, ?)
  `).run(name, category, state);

  res.json(readAppState());
});

app.post("/api/ingredients/batch", async (req, res) => {
  const parsed = await parseIngredientInput(req.body?.text || "");
  const insert = db.prepare(`
    INSERT INTO ingredients (name, category, state)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      category = excluded.category,
      state = CASE
        WHEN excluded.state = 'none' THEN ingredients.state
        ELSE excluded.state
      END
  `);

  runInTransaction(() => {
    for (const item of parsed) {
      insert.run(item.name, item.category, item.state);
    }
  });
  res.json(readAppState());
});

app.patch("/api/ingredients/:id", (req, res) => {
  const ingredient = db.prepare("SELECT * FROM ingredients WHERE id = ?").get(req.params.id);

  if (!ingredient) {
    return res.status(404).json({ error: "食材不存在" });
  }

  const name = normalizeIngredientName(String(req.body?.name ?? ingredient.name));

  if (!name) {
    return res.status(422).json({ error: "请输入食材名称" });
  }

  if (db.prepare("SELECT id FROM ingredients WHERE name = ? AND id != ?").get(name, req.params.id)) {
    return res.status(409).json({ error: "这个食材已经在清单里" });
  }

  const categoryInput = String(req.body?.category ?? ingredient.category).trim();
  const category = categoryInput ? normalizeCategory(categoryInput) : classifyIngredient(name);
  const state = normalizeState(req.body?.state ?? ingredient.state);

  db.prepare(`
    UPDATE ingredients
    SET name = ?, category = ?, state = ?
    WHERE id = ?
  `).run(name, category, state, req.params.id);

  res.json(readAppState());
});

app.delete("/api/ingredients/:id", (req, res) => {
  db.prepare("DELETE FROM ingredients WHERE id = ?").run(req.params.id);
  res.json(readAppState());
});

app.post("/api/drafts/analyze", async (req, res) => {
  const sourceType = req.body?.sourceType || "text";
  let sourceText = req.body?.content || "";
  const imageDataUrl = req.body?.imageDataUrl || "";

  if (sourceType !== "image" && !String(sourceText).trim()) {
    return res.status(422).json({ error: "请先提供菜谱内容" });
  }

  if (sourceType === "web") {
    sourceText = await readWebPageText(sourceText);
  }

  if (sourceType === "image" && !imageDataUrl) {
    return res.status(422).json({ error: "请先选择一张菜谱图片" });
  }

  const draft = await createRecipeDraft(sourceType, sourceText, imageDataUrl);
  res.json({ draft, app: readAppState() });
});

app.patch("/api/drafts/:id", (req, res) => updateRecipe(req, res, "draft"));

app.patch("/api/recipes/:id", (req, res) => updateRecipe(req, res, "formal"));

app.post("/api/drafts/:id/confirm", (req, res) => {
  const result = db.prepare("UPDATE recipes SET status = 'formal' WHERE id = ? AND status = 'draft'").run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "菜谱草稿不存在或已经保存" });
  }

  res.json({
    savedRecipeId: Number(req.params.id),
    app: readAppState(),
  });
});

app.delete("/api/recipes/:id", (req, res) => {
  const result = db.prepare("DELETE FROM recipes WHERE id = ? AND status = 'formal'").run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "正式菜谱不存在" });
  }

  res.json(readAppState());
});

function updateRecipe(req, res, status) {
  const recipe = db.prepare("SELECT id FROM recipes WHERE id = ? AND status = ?").get(req.params.id, status);

  if (!recipe) {
    return res.status(404).json({ error: status === "draft" ? "菜谱草稿不存在" : "正式菜谱不存在" });
  }

  const title = String(req.body?.title || "").trim().slice(0, 40);
  const rawIngredients = Array.isArray(req.body?.ingredients) ? req.body.ingredients : [];
  const ingredients = rawIngredients
    .map((item) => {
      const sanitized = sanitizeIngredientItems([item], { includeQuantity: true })[0];
      return sanitized ? { ...sanitized, required: Boolean(item.required) } : null;
    })
    .filter(Boolean);
  const rawSteps = Array.isArray(req.body?.steps) ? req.body.steps.slice(0, 12) : [];
  const steps = rawSteps.map((step) => String(step).trim()).filter(Boolean);

  if (
    !title
    || ingredients.length === 0
    || ingredients.length !== rawIngredients.length
    || steps.length === 0
    || steps.length !== rawSteps.length
  ) {
    return res.status(422).json({ error: "请填写标题、食材和烹饪步骤" });
  }

  const insertIngredient = db.prepare("INSERT INTO recipe_ingredients (recipe_id, name, quantity_label, required) VALUES (?, ?, ?, ?)");
  const insertStep = db.prepare("INSERT INTO recipe_steps (recipe_id, position, text) VALUES (?, ?, ?)");

  runInTransaction(() => {
    db.prepare(`
      UPDATE recipes
      SET title = ?, method = ?, minutes = ?, preference_warning = ?
      WHERE id = ? AND status = ?
    `).run(
      title,
      normalizeMethod(req.body?.method),
      clampMinutes(req.body?.minutes),
      String(req.body?.preferenceWarning || "").trim().slice(0, 30),
      req.params.id,
      status,
    );
    db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").run(req.params.id);
    db.prepare("DELETE FROM recipe_steps WHERE recipe_id = ?").run(req.params.id);
    ingredients.forEach((item) => insertIngredient.run(req.params.id, item.name, item.quantityLabel, item.required ? 1 : 0));
    steps.forEach((step, index) => insertStep.run(req.params.id, index + 1, step));
  });

  const appState = readAppState();
  if (status === "draft") {
    return res.json({ draft: appState.drafts.find((item) => item.id === recipe.id), app: appState });
  }

  const savedRecipe = [...appState.matches.ready, ...appState.matches.missing]
    .find((item) => item.id === recipe.id);
  return res.json({ recipe: savedRecipe, app: appState });
}

app.use("/api", (err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "服务端处理失败" });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(root, "dist", "index.html"));
  });
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`Happy Eat running at http://localhost:${port}`);
  if (!process.env.FAMILY_ACCESS_CODE) {
    console.log("Using development family access code: happy-eat");
  }
});

function readAppState() {
  const ingredients = db.prepare("SELECT id, name, category, state FROM ingredients ORDER BY category, name").all();
  const recipes = db.prepare("SELECT * FROM recipes ORDER BY id DESC").all();
  const recipeIds = recipes.map((recipe) => recipe.id);
  const ingredientsByRecipe = new Map();
  const stepsByRecipe = new Map();

  if (recipeIds.length > 0) {
    const placeholders = recipeIds.map(() => "?").join(",");

    for (const item of db.prepare(`
      SELECT recipe_id AS recipeId, name, quantity_label AS quantityLabel, required
      FROM recipe_ingredients
      WHERE recipe_id IN (${placeholders})
      ORDER BY id
    `).all(...recipeIds)) {
      const current = ingredientsByRecipe.get(item.recipeId) || [];
      current.push({ ...item, required: Boolean(item.required) });
      ingredientsByRecipe.set(item.recipeId, current);
    }

    for (const step of db.prepare(`
      SELECT recipe_id AS recipeId, position, text
      FROM recipe_steps
      WHERE recipe_id IN (${placeholders})
      ORDER BY position
    `).all(...recipeIds)) {
      const current = stepsByRecipe.get(step.recipeId) || [];
      current.push(step);
      stepsByRecipe.set(step.recipeId, current);
    }
  }

  const formalRecipes = recipes.filter((recipe) => recipe.status === "formal").map((recipe) => toRecipe(recipe, ingredientsByRecipe, stepsByRecipe));
  const drafts = recipes.filter((recipe) => recipe.status === "draft").map((recipe) => toRecipe(recipe, ingredientsByRecipe, stepsByRecipe));

  return {
    family: {
      name: "张家",
      accessMode: "家庭访问码",
    },
    ai: {
      configured: llmConfigured,
      textModel: dashScopeTextModel,
      visionModel: dashScopeVisionModel,
    },
    pantry: ["盐", "白糖", "生抽", "老抽", "食用油", "香醋", "料酒"],
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
  const pantry = new Set(["盐", "白糖", "生抽", "老抽", "食用油", "香醋", "料酒"]);
  const priority = new Set(ingredients.filter((item) => item.state === "priority" || item.state === "expiring").map((item) => item.name));

  const decorated = recipes.map((recipe) => {
    const required = recipe.ingredients.filter((item) => item.required);
    const missing = required.filter((item) => !available.has(item.name) && !pantry.has(item.name)).map((item) => item.name);
    const usesPriority = required.some((item) => priority.has(item.name));

    return {
      ...recipe,
      missing,
      usesPriority,
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

async function parseIngredientInput(text) {
  if (!llmConfigured) {
    return parseIngredientText(text);
  }

  const result = await callDashScopeJson({
    model: dashScopeTextModel,
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
      {
        role: "user",
        content: text,
      },
    ],
  });

  return sanitizeIngredientItems(result.ingredients);
}

function parseIngredientText(text) {
  return text
    .replace(/冰箱里有|家里有|还有|，/g, "、")
    .split(/[、,\n]/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const state = /快过期|快坏/.test(chunk) ? "expiring" : /今天用|优先|剩/.test(chunk) ? "priority" : /冷冻|冻/.test(chunk) ? "frozen" : "none";
      const cleaned = chunk.replace(/快过期|快坏|今天用|优先用掉|优先|冷冻中|冷冻|冻着|剩/g, "").trim();
      const quantityMatch = cleaned.match(/([一二三四五六七八九十半\d.]+)\s*(个|颗|根|块|片|包|袋|盒|瓶|碗|斤|克|g|kg|勺|把)/i);
      const quantityLabel = quantityMatch ? quantityMatch[0] : "";
      const name = normalizeIngredientName(cleaned.replace(quantityLabel, "").replace(/[x×*]/g, "").trim());

      return {
        name,
        category: classifyIngredient(name),
        quantityLabel,
        state,
      };
    })
    .filter((item) => item.name.length > 0);
}

async function createRecipeDraft(sourceType, sourceText, imageDataUrl = "") {
  const extracted = llmConfigured
    ? await extractRecipeWithLLM(sourceType, sourceText, imageDataUrl)
    : extractRecipeLocally(sourceText);
  const required = sanitizeIngredientItems(extracted.requiredIngredients, { includeQuantity: true });
  const optional = sanitizeIngredientItems(extracted.optionalIngredients, { includeQuantity: true });
  const steps = Array.isArray(extracted.steps) && extracted.steps.length > 0
    ? extracted.steps.map((step) => String(step).trim()).filter(Boolean).slice(0, 8)
    : splitSteps(sourceText);
  const title = String(extracted.title || sourceText.match(/《(.+?)》/)?.[1] || sourceText.split(/[。\n]/)[0].slice(0, 12) || "新菜谱草稿").slice(0, 40);
  const method = normalizeMethod(extracted.method || inferMethod(sourceText));
  const minutes = clampMinutes(extracted.minutes || inferMinutes(sourceText));
  const preferenceWarning = String(extracted.preferenceWarning || (/辣/.test(sourceText) ? "可能偏辣" : "")).slice(0, 30);

  const insertRecipe = db.prepare(`
    INSERT INTO recipes (title, method, minutes, preference_warning, status, source_type, source_text)
    VALUES (?, ?, ?, ?, 'draft', ?, ?)
  `);
  const storedSource = sourceType === "image" ? String(sourceText || "图片导入").slice(0, 1000) : sourceText.slice(0, 4000);
  const recipeId = insertRecipe.run(title, method, minutes, preferenceWarning, sourceType, storedSource).lastInsertRowid;
  const insertIngredient = db.prepare("INSERT INTO recipe_ingredients (recipe_id, name, quantity_label, required) VALUES (?, ?, ?, ?)");
  const insertStep = db.prepare("INSERT INTO recipe_steps (recipe_id, position, text) VALUES (?, ?, ?)");

  runInTransaction(() => {
    for (const item of required) {
      insertIngredient.run(recipeId, item.name, item.quantityLabel, 1);
    }
    for (const item of optional) {
      insertIngredient.run(recipeId, item.name, item.quantityLabel, 0);
    }
    steps.forEach((step, index) => insertStep.run(recipeId, index + 1, step));
  });

  return readAppState().drafts.find((draft) => draft.id === recipeId);
}

function extractRecipeLocally(sourceText) {
  const detectedNames = [
    "鸡胸肉", "猪肉末", "火腿肠", "花生米", "干辣椒", "豆瓣酱", "黑胡椒",
    "番茄", "土豆", "青椒", "洋葱", "香菜", "葱花", "鸡蛋", "虾仁",
    "培根", "米饭", "挂面", "面包片", "牛奶", "酸奶", "豆腐", "丝瓜",
    "黄瓜", "面粉", "花椒", "盐", "白糖", "生抽", "老抽", "蚝油",
    "食用油", "虾",
  ].filter((name) => sourceText.includes(name));
  const ingredients = detectedNames.length > 0
    ? detectedNames.map((name) => {
        const quantityLabel = sourceText.match(new RegExp(`${name}\\s*([一二三四五六七八九十半\\d.]+\\s*(?:个|颗|根|块|片|包|袋|盒|瓶|碗|斤|克|g|kg|勺|把))`, "i"))?.[1] || "";
        return {
          name,
          category: classifyIngredient(name),
          quantityLabel,
          state: "none",
        };
      })
    : parseIngredientText(sourceText);
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

async function extractRecipeWithLLM(sourceType, sourceText, imageDataUrl) {
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
    {
      role: "system",
      content: "你是家庭菜谱结构化助手，擅长从中文菜谱文本、网页正文或图片中提取可确认的菜谱草稿。",
    },
    {
      role: "user",
      content: imageDataUrl
        ? [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ]
        : prompt,
    },
  ];

  return callDashScopeJson({
    model: imageDataUrl ? dashScopeVisionModel : dashScopeTextModel,
    messages,
  });
}

function splitSteps(text) {
  const chunks = text
    .split(/(?:\d+[.、])|[。\n]/)
    .map((step) => step.trim())
    .filter((step) => step.length > 6);

  if (chunks.length > 0) {
    return chunks.slice(0, 6);
  }

  return ["处理食材并备好调味品。", "热锅加油，放入主要食材翻炒或炖煮。", "调味后收汁或装盘。"];
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
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("invalid protocol");
    }
    const response = await fetch(parsed, { redirect: "follow" });
    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 4000);
  } catch {
    return url;
  }
}

function sanitizeIngredientItems(items, { includeQuantity = false } = {}) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
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
    })
    .filter(Boolean)
    .slice(0, 60);
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

async function callDashScopeJson({ model, messages }) {
  const response = await fetch(`${dashScopeBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dashScopeApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(formatDashScopeError(payload.error?.message));
  }

  const content = readAssistantContent(payload);

  try {
    return JSON.parse(extractJson(content));
  } catch {
    throw new Error("千问返回内容不是可解析的 JSON");
  }
}

function readAssistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text || "")
      .join("\n");
  }

  return "";
}

function extractJson(content) {
  const text = String(content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("missing json");
  }

  return text.slice(start, end + 1);
}

function formatDashScopeError(message) {
  const text = String(message || "");

  if (/api key/i.test(text)) {
    return "DashScope API Key 无效或无权限，请更换有效 Key 后重试";
  }

  return text || "千问 API 调用失败";
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function seedDatabase() {
  const existingIngredients = db.prepare("SELECT COUNT(*) AS count FROM ingredients").get().count;
  const existingRecipes = db.prepare("SELECT COUNT(*) AS count FROM recipes").get().count;

  if (existingIngredients > 0 || existingRecipes > 0) {
    return;
  }

  const insertIngredient = db.prepare("INSERT INTO ingredients (name, category, quantity_label, state) VALUES (?, ?, ?, ?)");
  const insertRecipe = db.prepare("INSERT INTO recipes (title, method, minutes, preference_warning, status) VALUES (?, ?, ?, ?, 'formal')");
  const insertRecipeIngredient = db.prepare("INSERT INTO recipe_ingredients (recipe_id, name, quantity_label, required) VALUES (?, ?, ?, ?)");
  const insertStep = db.prepare("INSERT INTO recipe_steps (recipe_id, position, text) VALUES (?, ?, ?)");

  const ingredients = [
    ["番茄", "蔬菜", "2 个", "expiring"],
    ["土豆", "蔬菜", "1 个", "priority"],
    ["青椒", "蔬菜", "2 个", "none"],
    ["洋葱", "蔬菜", "半个", "priority"],
    ["香菜", "蔬菜", "1 把", "none"],
    ["葱花", "蔬菜", "", "none"],
    ["鸡胸肉", "肉禽蛋", "2 块", "frozen"],
    ["鸡蛋", "肉禽蛋", "6 个", "none"],
    ["猪肉末", "肉禽蛋", "200g", "frozen"],
    ["虾仁", "肉禽蛋", "200g", "frozen"],
    ["培根", "肉禽蛋", "100g", "frozen"],
    ["火腿肠", "肉禽蛋", "2 根", "none"],
    ["米饭", "主食", "1 碗", "priority"],
    ["挂面", "主食", "1 包", "none"],
    ["面包片", "主食", "6 片", "none"],
    ["牛奶", "乳品", "1 盒", "priority"],
    ["酸奶", "乳品", "2 杯", "none"],
    ["生抽", "调味", "", "none"],
    ["老抽", "调味", "", "none"],
    ["蚝油", "调味", "", "none"],
    ["盐", "调味", "", "none"],
    ["白糖", "调味", "", "none"],
    ["食用油", "调味", "", "none"],
    ["黑胡椒", "调味", "", "none"],
  ];

  const recipes = [
    {
      title: "番茄炒蛋",
      method: "炒",
      minutes: 15,
      ingredients: [["番茄", "2 个", 1], ["鸡蛋", "2 个", 1], ["葱花", "", 0], ["盐", "", 0]],
      steps: ["番茄切块，鸡蛋打散备用。", "热锅加油，先炒鸡蛋并盛出。", "锅中再加少许油，放入番茄炒出汁。", "倒回鸡蛋，加入盐和葱花翻匀。"],
    },
    {
      title: "土豆丝炒青椒",
      method: "炒",
      minutes: 15,
      ingredients: [["土豆", "1 个", 1], ["青椒", "1 个", 1], ["生抽", "", 0]],
      steps: ["土豆和青椒切丝。", "土豆丝冲洗后沥干。", "热锅加油，先炒土豆丝。", "加入青椒和生抽快速翻炒。"],
    },
    {
      title: "洋葱炒鸡胸肉",
      method: "炒",
      minutes: 20,
      ingredients: [["洋葱", "半个", 1], ["鸡胸肉", "1 块", 1], ["黑胡椒", "", 0]],
      steps: ["鸡胸肉切片，洋葱切丝。", "鸡胸肉用生抽和黑胡椒抓匀。", "热锅煎炒鸡胸肉至变色。", "加入洋葱炒软后调味。"],
    },
    {
      title: "香菜拌鸡丝",
      method: "凉拌",
      minutes: 10,
      preferenceWarning: "含香菜",
      ingredients: [["香菜", "1 把", 1], ["鸡胸肉", "1 块", 1], ["生抽", "", 0], ["香醋", "", 0]],
      steps: ["鸡胸肉煮熟后撕成丝。", "香菜切段。", "加入生抽和香醋拌匀。"],
    },
    {
      title: "鸡蛋葱花饼",
      method: "煎",
      minutes: 20,
      ingredients: [["鸡蛋", "2 个", 1], ["葱花", "", 1], ["面粉", "100g", 1]],
      steps: ["鸡蛋、面粉和水调成面糊。", "加入葱花和盐。", "平底锅刷油，小火煎至两面金黄。"],
    },
    {
      title: "番茄鸡蛋汤",
      method: "煮",
      minutes: 15,
      ingredients: [["番茄", "1 个", 1], ["鸡蛋", "1 个", 1], ["葱花", "", 0]],
      steps: ["番茄切块。", "锅中加水煮开，放入番茄。", "淋入蛋液，调味后撒葱花。"],
    },
    {
      title: "宫保鸡丁",
      method: "炒",
      minutes: 25,
      preferenceWarning: "可能偏辣",
      ingredients: [["鸡胸肉", "1 块", 1], ["花生米", "", 1], ["黄瓜", "", 1], ["干辣椒", "", 0]],
      steps: ["鸡胸肉切丁腌制。", "调好宫保汁。", "鸡丁滑炒后加入配菜。", "倒入料汁收浓。"],
    },
    {
      title: "麻婆豆腐",
      method: "炖",
      minutes: 20,
      preferenceWarning: "偏辣",
      ingredients: [["豆腐", "1 盒", 1], ["猪肉末", "100g", 1], ["豆瓣酱", "", 1], ["花椒", "", 0]],
      steps: ["豆腐切块焯水。", "炒香肉末和豆瓣酱。", "加入豆腐和水小火煮。", "勾芡后撒花椒粉。"],
    },
  ];

  runInTransaction(() => {
    for (const ingredient of ingredients) {
      insertIngredient.run(...ingredient);
    }

    for (const recipe of recipes) {
      const recipeId = insertRecipe.run(recipe.title, recipe.method, recipe.minutes, recipe.preferenceWarning || "").lastInsertRowid;
      recipe.ingredients.forEach((ingredient) => insertRecipeIngredient.run(recipeId, ...ingredient));
      recipe.steps.forEach((step, index) => insertStep.run(recipeId, index + 1, step));
    }
  });
}

function runInTransaction(callback) {
  db.exec("BEGIN");
  try {
    callback();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
