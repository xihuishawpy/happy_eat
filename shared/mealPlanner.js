import {
  buildLocalMealSuggestions,
  defaultFamilySettings,
  evaluateIngredientPregnancy,
  normalizePregnancyLevel,
  sanitizeSuggestedMeal,
} from "./pregnancy.js";

const PANTRY_SET = new Set(["盐", "白糖", "生抽", "老抽", "食用油", "香醋", "料酒"]);

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

  const excludeText = excludeTitles.length > 0 ? `请避免重复推荐以下菜名：${excludeTitles.slice(0, 10).join("、")}。` : "";
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

  if (mode === "use_existing") {
    const prompt = [
      `请根据家庭现有食材，规划一顿家常饭：共 ${count} 道菜${includeStaple ? " + 1 份主食建议" : ""}（一般为荤素搭配，省心好做）。`,
      `现有可用食材：${ingText}`,
      `常备调味品：${[...PANTRY_SET].join("、")}。`,
      "优先消耗标注为「快过期」或「优先用掉」的食材。",
      "每道菜的 requiredIngredients 必须只使用上面列出的现有食材（不要凭空编造家里没有的主料），常备调料放 optionalIngredients。",
      pregnancyRules,
      extraNote,
      styleLine,
      timeLine,
      excludeText,
      existingTitles ? `参考自家已有菜谱风格（可推新菜也可给变体）：${existingTitles}` : "",
      "返回且只返回 JSON，不要 Markdown。",
      "JSON 结构：",
      JSON.stringify({
        title: "今晚 2 道菜 + 主食推荐",
        summary: "一句话总结这顿搭配亮点",
        staple: "蒸米饭或杂粮饭",
        meals: [
          {
            title: "番茄炒蛋",
            method: "炒",
            minutes: 15,
            reason: "顺手用掉快过期的番茄，酸甜开胃",
            pregnancyTip: "鸡蛋炒至完全熟透，少油清淡",
            preferenceWarning: "",
            requiredIngredients: [{ name: "番茄", quantityLabel: "2个" }],
            optionalIngredients: [{ name: "盐", quantityLabel: "少许" }],
            steps: ["步骤1。", "步骤2。"],
          },
        ],
      }),
      "method 只能是：炒、煮、蒸、煎、烤、凉拌、炖、其他。每道菜 3~6 个具体、简短可照做的步骤。",
    ]
      .filter(Boolean)
      .join("\n");

    return [
      { role: "system", content: "你是贴心的中式家庭膳食规划师与厨师，擅长用现有食材搭配零负担、可直接开做的家常菜。" },
      { role: "user", content: prompt },
    ];
  }

  // mode === "shopping_plan"
  const modeDesc =
    shoppingMode === "fresh"
      ? `家里基本没菜了或准备重新采购，请从零规划 ${mealsCount} 顿家常饭（总共 ${totalDishes} 道菜${includeStaple ? " + 主食" : ""}，每顿约 ${count} 道菜，荤素均衡、食材尽量复用不浪费）。`
      : `请尽量结合家里现有食材，只顺路补买少量关键食材，规划 ${mealsCount} 顿家常饭（总共 ${totalDishes} 道菜${includeStaple ? " + 主食" : ""}）。`;

  const prompt = [
    modeDesc,
    `家里目前已有食材：${ingText}`,
    `常备调味品（家里默认有，不需要买）：${[...PANTRY_SET].join("、")}。`,
    pregnancyRules,
    extraNote,
    styleLine,
    timeLine,
    excludeText,
    "请同时输出：1）推荐菜单 meals（每道菜含完整可照做的 ingredients 和 steps）；2）合并去重后的 shoppingItems 买菜清单（只列家里没有、需要去买的食材，给出实用采购量与用途菜名）。",
    "返回且只返回 JSON，不要 Markdown。",
    "JSON 结构：",
    JSON.stringify({
      title: "下顿 2 道菜 + 主食买菜方案",
      summary: "一句话说明采买与营养亮点",
      staple: "杂粮米饭",
      meals: [
        {
          title: "西蓝花炒虾仁",
          method: "炒",
          minutes: 15,
          reason: "高蛋白补叶酸，15分钟快手",
          pregnancyTip: "虾仁与西蓝花务必彻底炒熟",
          preferenceWarning: "",
          requiredIngredients: [{ name: "西蓝花", quantityLabel: "1颗" }, { name: "虾仁", quantityLabel: "200g" }],
          optionalIngredients: [{ name: "盐", quantityLabel: "少许" }],
          steps: ["步骤1。", "步骤2。"],
        },
      ],
      shoppingItems: [
        { name: "西蓝花", category: "蔬菜", quantityLabel: "1颗", forDishes: ["西蓝花炒虾仁"] },
      ],
    }),
    "category 只能是：蔬菜、肉禽蛋、主食、调味、乳品、其他。method 只能是：炒、煮、蒸、煎、烤、凉拌、炖、其他。",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: "你是贴心的中式家庭买菜与膳食规划师，擅长为家庭减少「吃什么、买什么」的决策负担。" },
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
