import {
  buildLocalMealSuggestions,
  defaultFamilySettings,
  evaluateIngredientPregnancy,
  normalizePregnancyLevel,
  sanitizeSuggestedMeal,
} from "./pregnancy.js";

const PANTRY_SET = new Set(["盐", "白糖", "生抽", "老抽", "食用油", "香醋", "料酒"]);

const EXISTING_CUISINE_ANGLES = [
  "做法层次建议：一道煎/焖/炖/蒸主菜 + 一道爽口炒菜或拌菜，拉开口感与火候。",
  "做法层次建议：一道暖胃汤煲或烩菜 + 一道干香小炒/香煎菜，一润一香更有食欲。",
  "做法层次建议：借鉴粤式清鲜思路（白灼/清蒸/上汤/蚝油焖）搭配家常快手炒菜。",
  "做法层次建议：善用番茄酸甜、菌菇提鲜或葱姜爆香做风味变化，避免两道菜味道雷同。",
  "做法层次建议：借鉴江南温润家常做法（炖煮/滑炒/蒸蛋/烩菜）搭配清爽时蔬，好消化不油腻。",
  "做法层次建议：尝试不同切法与火候（如烘蛋/滑蛋/炖蛋、香煎/葱烧、蒜蓉/上汤），跳出最普通的清炒套路。",
];

const SHOPPING_INSPIRATION_THEMES = [
  "本轮采买灵感方向：优先考虑排骨/瘦肉搭配冬瓜、玉米、山药或莲藕做暖胃炖煮/汤菜，再配一道脆嫩绿叶菜。",
  "本轮采买灵感方向：优先考虑牛肉/牛腩/肥牛搭配菌菇、胡萝卜、番茄或西芹，补铁高蛋白，搭配清爽素菜。",
  "本轮采买灵感方向：优先考虑低汞水产（鲈鱼/鳕鱼/带鱼/黄鱼/鲫鱼/大虾轮换）清蒸或香煎，搭配豆制品或时令青菜。",
  "本轮采买灵感方向：优先考虑鸡腿肉/鸡翅/鸡胸搭配香菇、口蘑、板栗、土豆或彩椒焖烧，搭配蒜蓉或白灼青菜。",
  "本轮采买灵感方向：优先考虑豆腐/腐竹/千张与鲜虾/蛤蜊/肉末做鲜甜烩菜或蒸菜，解腻开胃，适合日常轻负担餐桌。",
  "本轮采买灵感方向：优先考虑江南/粤式清润风味（如丝瓜肉片、山药木耳、上汤时蔬、冬瓜丸子/滑肉），柔和不腻。",
  "本轮采买灵感方向：优先考虑五彩时蔬与蛋类/禽肉的创意组合（如口蘑滑鸡、芦笋炒肉、蒸水蛋、荷塘小炒），颜色丰富有食欲。",
  "本轮采买灵感方向：优先考虑酸甜开胃或菌菇鲜香系家常菜（如番茄烩、菌菇焖、葱烧豆腐），少油少辣却很下饭。",
];

function pickInspiration(pool, seed) {
  if (!Array.isArray(pool) || pool.length === 0) return "";
  const idx = Number.isInteger(seed)
    ? Math.abs(seed) % pool.length
    : Math.floor(Math.random() * pool.length);
  return pool[idx];
}

export function buildSingleIngredientPregnancyMessages(name) {
  return [
    {
      role: "system",
      content: [
        "你是严谨的中文孕期饮食营养助手。",
        "请判断指定食材在孕期是否适合食用，返回且只返回 JSON，不要 Markdown。",
        "JSON 结构：{\"pregnancyLevel\":\"safe\",\"pregnancyNote\":\"一句话说明与烹饪注意\"}。",
        "pregnancyLevel 只能是：safe（孕期适合正常吃）、caution（需限量/注意做法或偏凉辛辣高糖）、avoid（生食/酒精/高汞/明确高风险建议避免）。",
        "pregnancyNote 控制在 40 字以内，客观克制，不做夸大恐吓，必要时提醒彻底做熟或控制用量。",
      ].join("\n"),
    },
    { role: "user", content: `食材：${name}` },
  ];
}

export function normalizeLlmPregnancyEvaluation(result, fallbackName) {
  const level = normalizePregnancyLevel(result?.pregnancyLevel);
  const note = String(result?.pregnancyNote || "").trim().slice(0, 80);
  if (level && level !== "unknown") {
    return evaluateIngredientPregnancy(fallbackName, { pregnancyLevel: level, pregnancyNote: note });
  }
  return evaluateIngredientPregnancy(fallbackName);
}

export function buildMealPlanMessages({
  mode = "use_existing",
  ingredients = [],
  formalRecipes = [],
  settings = defaultFamilySettings(),
  dishCount = 2,
  includeStaple = true,
  mealsCount = 1,
  style = "",
  maxMinutes = 0,
  excludeTitles = [],
  shoppingMode = "top_up",
  focusIngredients = [],
  diversitySeed,
}) {
  const count = Math.max(1, Math.min(4, Number(dishCount) || 2));
  const totalDishes = mode === "shopping_plan" ? Math.min(6, count * Math.max(1, Math.min(3, Number(mealsCount) || 1))) : count;
  const stateLabels = { expiring: "快过期", priority: "优先用掉", frozen: "冷冻" };
  const safeIngredients = ingredients.filter((item) => {
    if (!settings.pregnancyMode) return true;
    return evaluateIngredientPregnancy(item.name, item).level !== "avoid";
  });

  const ingText = safeIngredients.length > 0
    ? safeIngredients
        .map((item) => `${item.name}${stateLabels[item.state] ? `(${stateLabels[item.state]})` : ""}`)
        .join("、")
    : "目前家中基本没有可用新鲜食材";

  const focusList = (Array.isArray(focusIngredients) ? focusIngredients : [])
    .map((n) => String(n || "").trim())
    .filter(Boolean);
  const focusLine = focusList.length > 0
    ? `家庭特别指定本次想用掉的食材：${focusList.join("、")}（请尽量围绕这些食材出菜）。`
    : "";

  const excludeList = (Array.isArray(excludeTitles) ? excludeTitles : [])
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .slice(0, 24);
  const excludeText = excludeList.length > 0
    ? `【严格去重】以下菜名近期已经推荐过或刚吃过，本次严禁重复出现，也不要只改一两个字出雷同菜：${excludeList.join("、")}。`
    : "";
  const existingTitles = formalRecipes.slice(0, 12).map((r) => r.title).join("、");
  const pregnancyRules = settings.pregnancyMode
    ? [
        "【孕期饮食守护已开启】所有推荐菜谱必须适合孕妇食用：",
        "- 严禁使用生食/半熟蛋/酒精/高汞鱼/皮蛋/明确禁忌食材；",
        "- 尽量清淡营养、荤素搭配、少油少盐、不偏辣；",
        "- 肉蛋海鲜与豆角等步骤里必须明确写清彻底做熟；",
        "- 每道菜请提供简短的 pregnancyTip（孕期食用小贴士）。",
      ].join("\n")
    : "注重家常营养均衡与好操作。";

  const extraNote = settings.dietaryNotes ? `家庭额外饮食备注：${settings.dietaryNotes}。` : "";
  const styleLine = style ? `本顿口味/风格偏好：${style}。` : "";
  const timeLine = maxMinutes > 0 ? `单道菜尽量控制在 ${maxMinutes} 分钟内完成。` : "";
  const methodVarietyRule = count >= 2
    ? "【多样性硬要求】同一顿的几道菜请采用**不同的烹饪技法**（例如煎/蒸/炖/煮汤 + 炒/凉拌，不要两道菜全都是简单清炒），也不要总是重复最俗套的「番茄炒蛋、清炒时蔬」组合，请尽量给出让人有食欲的新鲜家常做法。"
    : "【多样性要求】请优先给出有新意、让人有食欲的家常做法，不要总是落回最俗套的单一清炒。";

  if (mode === "use_existing") {
    const angleHint = pickInspiration(EXISTING_CUISINE_ANGLES, diversitySeed);
    const prompt = [
      `请根据家庭现有食材，规划一顿有新鲜感的家常饭：共 ${count} 道菜${includeStaple ? " + 1 份主食建议" : ""}（一般为荤素搭配，省心好做）。`,
      `现有可用食材：${ingText}`,
      focusLine,
      `常备调味品：${[...PANTRY_SET].join("、")}。`,
      "优先消耗标注为「快过期」或「优先用掉」的食材。",
      "每道菜的 requiredIngredients 必须只使用上面列出的现有食材（不要凭空编造家里没有的主料），常备调料放 optionalIngredients。",
      methodVarietyRule,
      angleHint,
      pregnancyRules,
      extraNote,
      styleLine,
      timeLine,
      excludeText,
      existingTitles ? `家中菜谱库已有以下菜名，除非现有食材实在组合有限，否则优先推荐**不一样的新菜或新做法**换换口味：${existingTitles}。` : "",
      "返回且只返回 JSON，不要 Markdown。",
      "JSON 结构（以下字符串均为字段格式占位符，请根据实际食材原创，切勿照抄）：",
      JSON.stringify({
        title: "本顿菜单标题",
        summary: "一句话总结这顿搭配亮点与口感层次",
        staple: "匹配这顿菜的主食建议（可变换米饭/杂粮饭/粥/面/馒头等）",
        meals: [
          {
            title: "具体菜名",
            method: "炒",
            minutes: 15,
            reason: "简短推荐理由",
            pregnancyTip: "孕期烹饪小贴士",
            preferenceWarning: "",
            requiredIngredients: [{ name: "现有主料1", quantityLabel: "适量" }],
            optionalIngredients: [{ name: "常备调料", quantityLabel: "少许" }],
            steps: ["具体步骤1。", "具体步骤2。", "具体步骤3。"],
          },
        ],
      }),
      "method 只能是：炒、煮、蒸、煎、烤、凉拌、炖、其他。每道菜 3~6 个具体、简短可照做的步骤。",
    ]
      .filter(Boolean)
      .join("\n");

    return [
      { role: "system", content: "你是富有创意又接地气的中式家庭膳食规划师与厨师，擅长用有限的冰箱现有食材变换煎、蒸、炖、烩、汤、炒等不同技法，让家里每天吃得不重样。" },
      { role: "user", content: prompt },
    ];
  }

  // mode === "shopping_plan"
  const shoppingTheme = pickInspiration(SHOPPING_INSPIRATION_THEMES, diversitySeed);
  const modeDesc =
    shoppingMode === "fresh"
      ? `家里基本没菜了或准备重新采购，请从零规划 ${mealsCount} 顿不重样的家常饭（总共 ${totalDishes} 道菜${includeStaple ? " + 主食" : ""}，每顿约 ${count} 道菜，荤素均衡、食材尽量复用不浪费）。`
      : `请尽量结合家里现有食材，只顺路补买少量关键食材，规划 ${mealsCount} 顿有新意的家常饭（总共 ${totalDishes} 道菜${includeStaple ? " + 主食" : ""}）。`;

  const prompt = [
    modeDesc,
    `家里目前已有食材：${ingText}`,
    `常备调味品（家里默认有，不需要买）：${[...PANTRY_SET].join("、")}。`,
    methodVarietyRule,
    shoppingTheme,
    "【食材轮换要求】规划买菜时请主动丰富肉类、低汞鱼虾、豆制品与时令蔬菜的种类，不要每次都重复「西蓝花炒虾仁、清蒸鲈鱼、蒜蓉油麦菜」等固定老套路。",
    pregnancyRules,
    extraNote,
    styleLine,
    timeLine,
    excludeText,
    existingTitles ? `家里平时常做的旧菜谱有：${existingTitles}；请尽量推荐一些不同口味的新家常菜带来新鲜感。` : "",
    "请同时输出：1）推荐菜单 meals（每道菜含完整可照做的 ingredients 和 steps）；2）合并去重后的 shoppingItems 买菜清单（只列家里没有、需要去买的食材，给出实用采购量与用途菜名）。",
    "返回且只返回 JSON，不要 Markdown。",
    "JSON 结构（以下字符串均为字段格式占位符，请原创具体菜谱，切勿照抄）：",
    JSON.stringify({
      title: "买菜与菜单方案标题",
      summary: "一句话说明采买与营养搭配亮点",
      staple: "主食搭配建议",
      meals: [
        {
          title: "具体菜名",
          method: "炖",
          minutes: 25,
          reason: "推荐理由",
          pregnancyTip: "孕期烹饪小贴士",
          preferenceWarning: "",
          requiredIngredients: [{ name: "待买或现有主料1", quantityLabel: "300g" }],
          optionalIngredients: [{ name: "常备调料", quantityLabel: "少许" }],
          steps: ["具体步骤1。", "具体步骤2。", "具体步骤3。"],
        },
      ],
      shoppingItems: [
        { name: "待买食材名", category: "蔬菜", quantityLabel: "1份", forDishes: ["具体菜名"] },
      ],
    }),
    "category 只能是：蔬菜、肉禽蛋、主食、调味、乳品、其他。method 只能是：炒、煮、蒸、煎、烤、凉拌、炖、其他。",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: "你是富有创意的中式家庭买菜与膳食规划师，擅长在不同肉类、水产、豆制品和时令蔬果之间轮换搭配，帮助家庭告别「吃来吃去就那几道菜」的烦恼。" },
    { role: "user", content: prompt },
  ];
}

export function sanitizeLlmMealPlan(raw, params) {
  const {
    mode = "use_existing",
    ingredients = [],
    formalRecipes = [],
    settings = defaultFamilySettings(),
    dishCount = 2,
    includeStaple = true,
    mealsCount = 1,
    excludeTitles = [],
    shoppingMode = "top_up",
    focusIngredients = [],
  } = params;

  const availableSet = new Set(ingredients.map((item) => item.name));
  const ingMap = new Map(ingredients.map((item) => [item.name, item]));
  const rawMeals = Array.isArray(raw?.meals) ? raw.meals : [];
  let meals = rawMeals.map((m) => sanitizeSuggestedMeal(m)).filter(Boolean);

  if (mode === "use_existing") {
    // Filter out dishes that invented unavailable required ingredients if we have enough valid ones
    const strictlyValid = meals.filter((meal) =>
      meal.ingredients
        .filter((i) => i.required)
        .every((i) => availableSet.has(i.name) || PANTRY_SET.has(i.name)),
    );
    if (strictlyValid.length > 0) {
      meals = strictlyValid;
    }
  }

  if (meals.length === 0) {
    return buildLocalMealSuggestions({
      mode,
      ingredients,
      formalRecipes,
      settings,
      dishCount,
      includeStaple,
      mealsCount,
      excludeTitles,
      shoppingMode,
      focusIngredients,
    });
  }

  // Build deduplicated shopping items for shopping_plan
  const shoppingItems = [];
  if (mode === "shopping_plan") {
    const seen = new Set();
    const candidates = Array.isArray(raw?.shoppingItems) ? raw.shoppingItems : [];

    for (const item of candidates) {
      const name = String(item?.name || "").trim().slice(0, 40);
      if (!name || seen.has(name) || availableSet.has(name) || PANTRY_SET.has(name)) continue;
      seen.add(name);
      const preg = evaluateIngredientPregnancy(name, ingMap.get(name));
      shoppingItems.push({
        id: `shop-${shoppingItems.length + 1}-${name}`,
        name,
        category: ["蔬菜", "肉禽蛋", "主食", "调味", "乳品", "其他"].includes(item?.category)
          ? item.category
          : guessCategory(name),
        quantityLabel: String(item?.quantityLabel || item?.quantity || "适量").trim().slice(0, 20),
        checked: false,
        forDishes: Array.isArray(item?.forDishes)
          ? item.forDishes.map((d) => String(d || "").trim()).filter(Boolean).slice(0, 6)
          : [],
        pregnancyLevel: preg.level,
        pregnancyNote: preg.note,
      });
    }

    // Also make sure any missing required ingredient in meals is represented in shoppingItems
    for (const meal of meals) {
      for (const ing of meal.ingredients) {
        if (!ing.required || availableSet.has(ing.name) || PANTRY_SET.has(ing.name)) continue;
        const existing = shoppingItems.find((s) => s.name === ing.name);
        if (existing) {
          if (!existing.forDishes.includes(meal.title)) existing.forDishes.push(meal.title);
        } else {
          const preg = evaluateIngredientPregnancy(ing.name, ingMap.get(ing.name));
          shoppingItems.push({
            id: `shop-${shoppingItems.length + 1}-${ing.name}`,
            name: ing.name,
            category: guessCategory(ing.name),
            quantityLabel: ing.quantityLabel || "适量",
            checked: false,
            forDishes: [meal.title],
            pregnancyLevel: preg.level,
            pregnancyNote: preg.note,
          });
        }
      }
    }
  }

  return {
    mode,
    title: String(raw?.title || (mode === "shopping_plan" ? "买菜与菜单方案" : `今日推荐 · ${meals.length} 道菜`)).trim().slice(0, 50),
    summary: String(raw?.summary || "").trim().slice(0, 160),
    staple: includeStaple ? String(raw?.staple || "蒸米饭或杂粮饭").trim().slice(0, 60) : "",
    meals: meals.slice(0, 6),
    shoppingItems: shoppingItems.slice(0, 40),
    generatedBy: "ai",
  };
}

function guessCategory(name) {
  if (/番茄|土豆|青椒|洋葱|香菜|葱|胡萝卜|冬笋|豆腐|白菜|黄瓜|丝瓜|生姜|蒜|西蓝花|西兰花|油麦菜|菠菜|青菜|菜/.test(name)) return "蔬菜";
  if (/鸡|蛋|猪|牛|鱼|虾|排骨|肉|培根|火腿/.test(name)) return "肉禽蛋";
  if (/米|面|面包|馒头|饺子|年糕/.test(name)) return "主食";
  if (/盐|糖|生抽|老抽|醋|油|料酒|胡椒|酱|辣椒|花椒|香油/.test(name)) return "调味";
  if (/奶|酸奶|芝士|黄油/.test(name)) return "乳品";
  return "其他";
}
