export const PREGNANCY_DISCLAIMER =
  "孕期饮食提示仅供参考，不能替代产检医生或临床营养师建议；如有控糖、高血压或过敏史请遵医嘱。";

export const PREGNANCY_LEVEL_META = {
  safe: { level: "safe", label: "适合孕期", shortLabel: "孕期可吃" },
  caution: { level: "caution", label: "孕期慎吃", shortLabel: "慎吃" },
  avoid: { level: "avoid", label: "孕期避免", shortLabel: "避免" },
  unknown: { level: "unknown", label: "建议核实", shortLabel: "待核实" },
};

const PANTRY_DEFAULTS = new Set(["盐", "白糖", "生抽", "老抽", "食用油", "香醋", "料酒"]);

/**
 * Curated Chinese household pregnancy food-safety rules.
 * Ordered so more specific / higher-risk phrases (e.g. 生鱼片, 溏心蛋, 发芽土豆)
 * are matched before generic base ingredients (鱼, 蛋, 土豆).
 */
const PREGNANCY_RULES = [
  // ==================== AVOID (孕期建议避免) ====================
  {
    level: "avoid",
    note: "生食水产存在寄生虫与李斯特菌风险，孕期应避免，需彻底熟透再吃",
    keywords: ["生鱼片", "刺身", "三文鱼刺身", "生腌", "醉蟹", "醉虾", "生蚝", "生贝", "生蛤"],
  },
  {
    level: "avoid",
    note: "未全熟蛋类存在沙门氏菌风险，孕期请彻底煮熟、避免溏心蛋或生蛋",
    keywords: ["生鸡蛋", "溏心蛋", "温泉蛋", "半熟蛋"],
  },
  {
    level: "avoid",
    note: "生肉或未灭菌乳制品有李斯特菌及弓形虫风险，孕期建议避免",
    keywords: ["生牛肉", "生火腿", "帕尔马火腿", "未杀菌奶酪", "生乳酪", "蓝纹奶酪", "布里奶酪", "未杀菌牛奶", "生牛奶"],
  },
  {
    level: "avoid",
    note: "含酒精饮品或发酵酒类可能影响胎儿神经发育，孕期应严格避免",
    keywords: ["白酒", "红酒", "葡萄酒", "啤酒", "黄酒", "米酒", "醪糟", "酒酿", "洋酒", "清酒", "鸡尾酒", "果酒", "朗姆酒"],
  },
  {
    level: "avoid",
    note: "大型掠食性鱼类含汞量较高，可能影响胎儿神经发育，孕期建议避免",
    keywords: ["鲨鱼", "旗鱼", "剑鱼", "方头鱼", "马鲛鱼", "大目金枪鱼", "蓝鳍金枪鱼", "金枪鱼刺身"],
  },
  {
    level: "avoid",
    note: "含龙葵素等毒素或明确传统/药用孕期禁忌成分，孕期应避免食用",
    keywords: ["发芽土豆", "发青土豆", "马齿苋", "益母草", "藏红花", "番红花", "红花", "当归", "川芎", "麝香", "苦杏仁", "木薯", "河豚", "野生菌"],
  },
  {
    level: "avoid",
    note: "加工工艺可能导致重金属残留及高钠，孕期建议尽量避免",
    keywords: ["皮蛋", "松花蛋"],
  },

  // ==================== CAUTION (孕期慎吃 / 注意做法与用量) ====================
  {
    level: "caution",
    note: "性寒或易致过敏/肠胃不适，务必彻底蒸熟且仅少量尝鲜，脾胃虚寒者慎食",
    keywords: ["螃蟹", "大闸蟹", "梭子蟹", "蟹", "甲鱼", "鳖", "田螺", "螺蛳"],
  },
  {
    level: "caution",
    note: "传统认为有活血或寒凉刺激倾向，孕早晚期建议尽量少吃或不吃",
    keywords: ["山楂", "山楂糕", "冰糖葫芦", "薏米", "薏仁", "桂圆", "龙眼", "青木瓜", "木瓜", "芦荟", "杏仁", "桃仁"],
  },
  {
    level: "caution",
    note: "动物肝脏维生素 A 含量极高，孕早期过量有风险，建议每周最多 1 次、每次少量并彻底熟透",
    keywords: ["猪肝", "鸡肝", "鸭肝", "鹅肝", "牛肝", "羊肝", "动物肝"],
  },
  {
    level: "caution",
    note: "腌制/加工肉类含钠和亚硝酸盐较高，偶可少量解馋，务必彻底加热并搭配新鲜蔬菜",
    keywords: ["培根", "腊肉", "腊肠", "香肠", "烤肠", "火腿肠", "火腿", "午餐肉", "咸肉", "咸鱼", "咸蛋", "熏肉", "肉松"],
  },
  {
    level: "caution",
    note: "腌制酱菜含盐量高，易加重孕期水肿和血压负担，建议仅作少量点缀",
    keywords: ["咸菜", "榨菜", "泡菜", "酸菜", "梅干菜", "雪菜", "腐乳", "臭豆腐", "豆豉"],
  },
  {
    level: "caution",
    note: "辛辣刺激性较强，易引起孕期烧心、便秘或上火，建议少放清淡烹饪",
    keywords: ["小米辣", "干辣椒", "朝天椒", "泡椒", "剁椒", "辣椒油", "辣椒", "花椒", "麻椒", "豆瓣酱", "火锅底料", "芥末", "辣根", "咖喱"],
  },
  {
    level: "caution",
    note: "重香辛料性温热，日常做菜少量提香即可，避免大剂量卤煮或偏辣重口",
    keywords: ["八角", "桂皮", "茴香", "丁香", "草果", "五香粉", "十三香", "孜然", "黑胡椒", "白胡椒", "胡椒"],
  },
  {
    level: "caution",
    note: "料酒含少量酒精，烹调时需提前下锅并充分大火沸煮使酒精挥发，也可改用姜葱去腥",
    keywords: ["料酒"],
  },
  {
    level: "caution",
    note: "含咖啡因或高糖，孕期每日咖啡因需控量（≤200mg），控糖期建议少喝或不喝",
    keywords: ["咖啡", "浓茶", "奶茶", "可乐", "红茶", "绿茶", "乌龙茶", "抹茶", "巧克力"],
  },
  {
    level: "caution",
    note: "糖分较高，控糖或预防妊娠期糖尿病时应严格限量食用",
    keywords: ["白糖", "冰糖", "红糖", "蜂蜜", "炼乳", "荔枝", "榴莲", "芒果", "甘蔗", "糖"],
  },
  {
    level: "caution",
    note: "必须彻底焖煮熟透再吃，半生容易引起植物凝集素/皂苷中毒",
    keywords: ["四季豆", "扁豆", "油豆角", "豆角", "鲜黄花菜", "黄花菜", "豆浆"],
  },
  {
    level: "caution",
    note: "性偏凉或易胀气，孕期建议煮熟适量食用，避免一次大量生食",
    keywords: ["苦瓜", "马蹄", "荸荠", "西瓜", "柿子", "寒瓜"],
  },

  // ==================== SAFE (适合孕期) ====================
  {
    level: "safe",
    note: "富含优质蛋白与铁/钙，孕期非常推荐，注意彻底煮熟不吃半生",
    keywords: [
      "鸡蛋", "鹅蛋", "鸭蛋", "鹌鹑蛋", "蛋",
      "牛肉", "牛腩", "牛排", "肥牛", "牛腱", "牛柳",
      "猪肉", "猪肉末", "里脊", "排骨", "五花肉", "梅花肉", "肉末", "肉丝", "肉片",
      "鸡胸肉", "鸡腿", "鸡翅", "鸡丁", "鸡肉", "鸭肉", "鸭腿", "羊肉", "羊排",
    ],
  },
  {
    level: "safe",
    note: "低汞水产富含优质蛋白与 DHA，孕期推荐每周吃 2~3 次，务必彻底做熟",
    keywords: ["三文鱼", "鲈鱼", "鳕鱼", "鲫鱼", "草鱼", "带鱼", "黄鱼", "鲅鱼", "鳗鱼", "鱼片", "鱼丸", "虾仁", "大虾", "基围虾", "明虾", "虾", "蛤蜊", "花甲", "扇贝", "鱿鱼", "鱼"],
  },
  {
    level: "safe",
    note: "豆制品富含植物蛋白和钙质，适合孕期日常搭配",
    keywords: ["豆腐", "内酯豆腐", "冻豆腐", "老豆腐", "嫩豆腐", "豆干", "豆皮", "千张", "腐竹", "油豆腐", "毛豆", "黄豆", "黑豆", "红豆", "绿豆"],
  },
  {
    level: "safe",
    note: "富含叶酸、膳食纤维与维生素，孕期推荐多吃，注意清洗干净并熟食",
    keywords: [
      "菠菜", "西蓝花", "西兰花", "花菜", "花椰菜", "油菜", "小白菜", "青菜", "生菜", "油麦菜",
      "菜心", "白菜", "娃娃菜", "包菜", "卷心菜", "甘蓝", "空心菜", "芹菜", "茼蒿", "莴笋", "荠菜", "芦笋", "秋葵", "豌豆", "荷兰豆", "蚕豆",
    ],
  },
  {
    level: "safe",
    note: "家常温和蔬果，营养均衡，适合孕期日常烹饪",
    keywords: [
      "番茄", "西红柿", "圣女果", "土豆", "马铃薯", "胡萝卜", "白萝卜", "萝卜",
      "青椒", "彩椒", "甜椒", "灯笼椒", "线椒", "尖椒",
      "洋葱", "紫洋葱", "黄瓜", "青瓜", "丝瓜", "西葫芦", "节瓜", "冬瓜", "南瓜", "茄子",
      "玉米", "甜玉米", "红薯", "地瓜", "紫薯", "山药", "芋头", "莲藕", "藕", "竹笋", "春笋", "冬笋", "茭白", "豆芽",
      "香菇", "蘑菇", "口蘑", "平菇", "杏鲍菇", "金针菇", "木耳", "黑木耳", "银耳", "菌",
      "大葱", "小葱", "葱花", "青葱", "葱", "香菜", "大蒜", "蒜瓣", "蒜末", "蒜头", "蒜", "生姜", "姜", "蒜苗", "韭菜", "罗勒", "薄荷",
    ],
  },
  {
    level: "safe",
    note: "提供稳定能量与 B 族维生素，适合作为每餐主食，可适当搭配粗粮控糖",
    keywords: [
      "大米", "米饭", "小米", "糙米", "燕麦", "黑米", "藜麦", "糯米", "紫米",
      "面条", "挂面", "拉面", "乌冬", "意面", "米粉", "河粉", "粉丝", "粉条", "宽粉", "米线",
      "面粉", "吐司", "面包", "面包片", "法棍", "贝果", "手抓饼", "馒头", "花卷", "包子", "饺子", "水饺", "馄饨", "抄手", "年糕", "汤圆", "烧麦", "饼",
    ],
  },
  {
    level: "safe",
    note: "孕期补钙佳品，选择巴氏杀菌或常温灭菌产品更安心",
    keywords: ["纯牛奶", "牛奶", "酸奶", "芝士", "奶酪", "马苏里拉", "淡奶油", "奶油", "黄油"],
  },
  {
    level: "safe",
    note: "富含维生素与健康脂肪，孕期适量食用有益，注意洗净并控制每日水果总量",
    keywords: ["牛油果", "苹果", "梨", "香蕉", "橙子", "柑橘", "橘子", "草莓", "蓝莓", "猕猴桃", "奇异果", "柚子", "葡萄", "桃子", "樱桃", "车厘子", "火龙果", "柠檬", "青柠", "花生", "花生米", "核桃", "腰果", "芝麻", "红枣", "枸杞"],
  },
  {
    level: "safe",
    note: "常见基础调味品，孕期正常做菜适量使用即可，注意清淡少盐少油",
    keywords: ["盐", "生抽", "老抽", "酱油", "蚝油", "香醋", "陈醋", "米醋", "醋", "食用油", "橄榄油", "花生油", "芝麻油", "香油", "油", "淀粉", "生粉", "番茄酱", "沙拉酱", "甜面酱", "味噌", "鸡精", "味精"],
  },
];

// Sort each rule's keywords by length descending for accurate matching
const FLAT_PREGNANCY_RULES = PREGNANCY_RULES.flatMap((rule) =>
  rule.keywords.map((keyword) => ({ keyword, level: rule.level, note: rule.note })),
).sort((a, b) => b.keyword.length - a.keyword.length);

export function normalizePregnancyLevel(level) {
  const value = String(level || "").trim().toLowerCase();
  if (["safe", "caution", "avoid", "unknown"].includes(value)) return value;
  return "";
}

export function evaluateIngredientPregnancy(rawName, stored = null) {
  const name = String(rawName || "").trim();
  const savedLevel = normalizePregnancyLevel(stored?.pregnancyLevel ?? stored?.pregnancy_level);
  const savedNote = String(stored?.pregnancyNote ?? stored?.pregnancy_note ?? "").trim();

  if (name) {
    for (const rule of FLAT_PREGNANCY_RULES) {
      if (name === rule.keyword || name.includes(rule.keyword)) {
        // Explicit avoid/caution rule always wins over stale unknown; respect explicit saved override if valid
        if (savedLevel && savedLevel !== "unknown" && savedNote) {
          return {
            level: savedLevel,
            label: PREGNANCY_LEVEL_META[savedLevel].label,
            shortLabel: PREGNANCY_LEVEL_META[savedLevel].shortLabel,
            note: savedNote,
            source: "saved",
          };
        }
        return {
          level: rule.level,
          label: PREGNANCY_LEVEL_META[rule.level].label,
          shortLabel: PREGNANCY_LEVEL_META[rule.level].shortLabel,
          note: rule.note,
          source: "rule",
        };
      }
    }
  }

  if (savedLevel && savedLevel !== "unknown") {
    return {
      level: savedLevel,
      label: PREGNANCY_LEVEL_META[savedLevel].label,
      shortLabel: PREGNANCY_LEVEL_META[savedLevel].shortLabel,
      note: savedNote || (savedLevel === "safe" ? "常见食材，注意清洗干净并彻底做熟" : "孕期食用请注意控制用量与烹饪方式"),
      source: "saved",
    };
  }

  return {
    level: "unknown",
    label: PREGNANCY_LEVEL_META.unknown.label,
    shortLabel: PREGNANCY_LEVEL_META.unknown.shortLabel,
    note: savedNote || "暂未收录该食材的孕期建议，食用前建议核实或咨询产检医生",
    source: "unknown",
  };
}

export function evaluateRecipePregnancy(recipe, ingredientsByName = new Map()) {
  const items = [];
  const seen = new Set();

  for (const ing of recipe?.ingredients || []) {
    if (!ing?.name || seen.has(ing.name)) continue;
    seen.add(ing.name);
    const saved = ingredientsByName.get(ing.name) || null;
    const result = evaluateIngredientPregnancy(ing.name, saved);
    if (result.level === "avoid" || result.level === "caution") {
      // Pantry seasonings like 料酒 only flag mild caution when required or specifically listed
      items.push({
        name: ing.name,
        level: result.level,
        note: result.note,
        required: Boolean(ing.required),
      });
    }
  }

  const prefWarn = String(recipe?.preferenceWarning || "");
  if (/辣/.test(prefWarn) && !items.some((item) => /辣|花椒|豆瓣酱/.test(item.name))) {
    items.push({
      name: "偏辣调味",
      level: "caution",
      note: "偏辣口味可能引起孕期烧心或肠胃不适，建议减辣制作",
      required: false,
    });
  }

  const hasAvoid = items.some((item) => item.level === "avoid");
  const hasCaution = items.some((item) => item.level === "caution");
  const level = hasAvoid ? "avoid" : hasCaution ? "caution" : "safe";
  const topNames = items.slice(0, 2).map((item) => item.name).join("、");
  const summary =
    level === "avoid"
      ? `含孕期避免食材：${topNames}${items.length > 2 ? "等" : ""}`
      : level === "caution"
        ? `孕期注意：含${topNames}${items.length > 2 ? "等" : ""}`
        : "";

  return { level, summary, items };
}

export function defaultFamilySettings(raw = null) {
  return {
    pregnancyMode: raw?.pregnancyMode === undefined ? true : Boolean(raw.pregnancyMode),
    dietaryNotes: String(raw?.dietaryNotes || "").trim().slice(0, 120),
    defaultMealStyle: String(raw?.defaultMealStyle || "2菜+主食").trim().slice(0, 30) || "2菜+主食",
  };
}

export function sanitizeShoppingPlan(raw, ingredientsByName = new Map()) {
  if (!raw || typeof raw !== "object") return null;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((item, idx) => {
      const name = String(item?.name || "").trim().slice(0, 40);
      if (!name) return null;
      const preg = evaluateIngredientPregnancy(name, {
        pregnancyLevel: item?.pregnancyLevel,
        pregnancyNote: item?.pregnancyNote,
      });
      const existing = ingredientsByName.get(name);
      const finalPreg = existing ? evaluateIngredientPregnancy(name, existing) : preg;
      return {
        id: String(item?.id || `shop-${idx + 1}-${name}`).slice(0, 64),
        name,
        category: ["蔬菜", "肉禽蛋", "主食", "调味", "乳品", "其他"].includes(item?.category) ? item.category : "其他",
        quantityLabel: String(item?.quantityLabel || "").trim().slice(0, 20),
        checked: Boolean(item?.checked),
        forDishes: Array.isArray(item?.forDishes)
          ? item.forDishes.map((d) => String(d || "").trim()).filter(Boolean).slice(0, 6)
          : [],
        pregnancyLevel: finalPreg.level,
        pregnancyNote: finalPreg.note,
      };
    })
    .filter(Boolean)
    .slice(0, 60);

  const meals = (Array.isArray(raw.meals) ? raw.meals : [])
    .map((meal) => sanitizeSuggestedMeal(meal))
    .filter(Boolean)
    .slice(0, 8);

  if (items.length === 0 && meals.length === 0) return null;

  return {
    title: String(raw.title || "家庭买菜清单").trim().slice(0, 50),
    summary: String(raw.summary || "").trim().slice(0, 160),
    staple: String(raw.staple || "").trim().slice(0, 60),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
    meals,
    items,
  };
}

export function sanitizeSuggestedMeal(meal) {
  if (!meal || typeof meal !== "object") return null;
  const title = String(meal.title || "").trim().slice(0, 40);
  if (!title) return null;
  const method = ["炒", "煮", "蒸", "煎", "烤", "凉拌", "炖", "其他"].includes(String(meal.method || "").trim())
    ? String(meal.method).trim()
    : "炒";
  const minutesRaw = Number(meal.minutes);
  const minutes = Number.isFinite(minutesRaw) ? Math.max(1, Math.min(240, Math.round(minutesRaw))) : 20;

  const rawIngredients = Array.isArray(meal.ingredients)
    ? meal.ingredients
    : [
        ...(Array.isArray(meal.requiredIngredients) ? meal.requiredIngredients.map((i) => ({ ...i, required: true })) : []),
        ...(Array.isArray(meal.optionalIngredients) ? meal.optionalIngredients.map((i) => ({ ...i, required: false })) : []),
      ];

  const seenIng = new Set();
  const ingredients = rawIngredients
    .map((item) => {
      const name = String(item?.name || "").trim().slice(0, 30);
      if (!name || seenIng.has(name)) return null;
      seenIng.add(name);
      return {
        name,
        quantityLabel: String(item?.quantityLabel || item?.quantity || "").trim().slice(0, 20),
        required: item?.required === undefined ? true : Boolean(item.required),
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  const steps = (Array.isArray(meal.steps) ? meal.steps : [])
    .map((step, index) => {
      const text = typeof step === "string" ? step.trim() : String(step?.text || "").trim();
      return text ? { position: index + 1, text } : null;
    })
    .filter(Boolean)
    .slice(0, 10);

  if (ingredients.length === 0 || steps.length === 0) return null;

  return {
    title,
    method,
    minutes,
    reason: String(meal.reason || "").trim().slice(0, 100),
    pregnancyTip: String(meal.pregnancyTip || "").trim().slice(0, 100),
    preferenceWarning: String(meal.preferenceWarning || "").trim().slice(0, 30),
    ingredients,
    steps,
  };
}

/**
 * Curated fallback dishes for offline / no-AI-key environments and tests,
 * tailored to 2 dishes + staple and pregnancy-friendly home cooking.
 */
const FALLBACK_PREGNANCY_DISHES = [
  {
    title: "西蓝花炒虾仁",
    method: "炒",
    minutes: 15,
    reason: "低脂高蛋白、富含叶酸与钙，清爽好消化",
    pregnancyTip: "虾仁与西蓝花务必炒至彻底熟透，少油清淡",
    ingredients: [
      { name: "西蓝花", quantityLabel: "1 颗", required: true, category: "蔬菜" },
      { name: "虾仁", quantityLabel: "200g", required: true, category: "肉禽蛋" },
      { name: "大蒜", quantityLabel: "3 瓣", required: false, category: "蔬菜" },
      { name: "盐", quantityLabel: "少许", required: false, category: "调味" },
    ],
    steps: [
      { position: 1, text: "西蓝花掰小朵洗净，沸水焯烫 2 分钟捞出沥干。" },
      { position: 2, text: "虾仁解冻擦干，加少许盐和淀粉抓匀。" },
      { position: 3, text: "热锅少油炒香蒜末，放入虾仁滑炒至全部变红熟透。" },
      { position: 4, text: "倒入西蓝花翻炒 1 分钟，少许盐调味即可出锅。" },
    ],
  },
  {
    title: "番茄滑蛋豆腐煲",
    method: "炖",
    minutes: 18,
    reason: "酸甜开胃、植物蛋白与鸡蛋双补，特别适合没胃口时下饭",
    pregnancyTip: "鸡蛋与豆腐煮至沸腾全熟，温和不刺激肠胃",
    ingredients: [
      { name: "番茄", quantityLabel: "2 个", required: true, category: "蔬菜" },
      { name: "豆腐", quantityLabel: "1 盒", required: true, category: "蔬菜" },
      { name: "鸡蛋", quantityLabel: "2 个", required: true, category: "肉禽蛋" },
      { name: "葱花", quantityLabel: "少许", required: false, category: "蔬菜" },
    ],
    steps: [
      { position: 1, text: "番茄切小块，豆腐切厚块，鸡蛋打散炒熟盛出。" },
      { position: 2, text: "热锅少油把番茄炒出浓汁，加入 1 碗清水煮开。" },
      { position: 3, text: "放入豆腐块中小火炖煮 5 分钟入味。" },
      { position: 4, text: "倒回炒蛋煮 1 分钟，少许盐和生抽调味，撒葱花出锅。" },
    ],
  },
  {
    title: "胡萝卜炖牛肉",
    method: "炖",
    minutes: 45,
    reason: "补铁补蛋白，软烂入味，适合晚餐暖胃配米饭",
    pregnancyTip: "牛肉富含血红素铁，炖至软烂更易吸收",
    ingredients: [
      { name: "牛肉", quantityLabel: "300g", required: true, category: "肉禽蛋" },
      { name: "胡萝卜", quantityLabel: "1 根", required: true, category: "蔬菜" },
      { name: "土豆", quantityLabel: "1 个", required: true, category: "蔬菜" },
      { name: "生姜", quantityLabel: "3 片", required: false, category: "蔬菜" },
    ],
    steps: [
      { position: 1, text: "牛肉切块冷水下锅加姜片焯去血沫，捞出温水洗净。" },
      { position: 2, text: "胡萝卜和土豆去皮切滚刀块。" },
      { position: 3, text: "锅中加足量热水、牛肉、姜片和少许生抽，中小火炖 30 分钟。" },
      { position: 4, text: "放入胡萝卜与土豆继续炖 15 分钟至软烂，少许盐调味收汁。" },
    ],
  },
  {
    title: "蒜蓉清炒油麦菜",
    method: "炒",
    minutes: 8,
    reason: "快手绿叶菜，补充叶酸与膳食纤维，平衡餐桌荤素",
    pregnancyTip: "绿叶菜清洗干净、大火快炒熟透即可，清淡少油",
    ingredients: [
      { name: "油麦菜", quantityLabel: "1 把", required: true, category: "蔬菜" },
      { name: "大蒜", quantityLabel: "3 瓣", required: false, category: "蔬菜" },
      { name: "盐", quantityLabel: "少许", required: false, category: "调味" },
    ],
    steps: [
      { position: 1, text: "油麦菜反复洗净切段，大蒜拍碎切末。" },
      { position: 2, text: "热锅少油爆香蒜末，放入油麦菜大火快速翻炒 2 分钟。" },
      { position: 3, text: "炒至菜叶完全断生变软，加少许盐翻匀出锅。" },
    ],
  },
  {
    title: "清蒸鲈鱼",
    method: "蒸",
    minutes: 18,
    reason: "肉质细嫩刺少，优质蛋白与 DHA 兼顾，清淡不油腻",
    pregnancyTip: "鱼身务必蒸至鱼眼发白、筷子轻松穿透彻底熟透",
    ingredients: [
      { name: "鲈鱼", quantityLabel: "1 条", required: true, category: "肉禽蛋" },
      { name: "生姜", quantityLabel: "1 块", required: false, category: "蔬菜" },
      { name: "葱花", quantityLabel: "2 根", required: false, category: "蔬菜" },
      { name: "生抽", quantityLabel: "2 勺", required: false, category: "调味" },
    ],
    steps: [
      { position: 1, text: "鲈鱼处理干净在鱼背划两刀，抹少许盐，铺姜丝。" },
      { position: 2, text: "水开上锅大火蒸 10 分钟，关火焖 2 分钟确保完全熟透。" },
      { position: 3, text: "倒掉盘中腥水，铺葱丝，淋少许生抽与热油即可。" },
    ],
  },
];

export function buildLocalMealSuggestions({
  mode = "use_existing",
  ingredients = [],
  formalRecipes = [],
  settings = defaultFamilySettings(),
  dishCount = 2,
  includeStaple = true,
  mealsCount = 1,
  excludeTitles = [],
  shoppingMode = "top_up",
}) {
  const count = Math.max(1, Math.min(4, Number(dishCount) || 2));
  const totalTargetDishes = mode === "shopping_plan" ? Math.min(6, count * Math.max(1, Math.min(3, Number(mealsCount) || 1))) : count;
  const availableSet = new Set(ingredients.map((item) => item.name));
  const ingMap = new Map(ingredients.map((item) => [item.name, item]));
  const excludeSet = new Set((excludeTitles || []).map((t) => String(t).trim()));

  const isRecipePregnancySafe = (recipe) => {
    if (!settings.pregnancyMode) return true;
    const evalRes = evaluateRecipePregnancy(recipe, ingMap);
    return evalRes.level !== "avoid";
  };

  if (mode === "use_existing") {
    const readyFormal = formalRecipes
      .filter((r) => (r.missing || []).length === 0 && !excludeSet.has(r.title))
      .filter(isRecipePregnancySafe)
      .sort((a, b) => Number(b.usesPriority) - Number(a.usesPriority) || a.minutes - b.minutes);

    const chosen = readyFormal.slice(0, count).map((r) => ({
      title: r.title,
      method: r.method,
      minutes: r.minutes,
      reason: r.usesPriority ? "优先消耗家里快过期或优先食材，材料全齐" : "家里现有食材齐全，直接就能开火",
      pregnancyTip: settings.pregnancyMode ? "孕期烹饪请注意食材彻底熟透、少油少盐" : "",
      preferenceWarning: r.preferenceWarning || "",
      ingredients: r.ingredients,
      steps: r.steps,
      existingRecipeId: r.id,
    }));

    // If fewer than requested dishes exist in formal recipes, synthesize simple dish from remaining safe ingredients
    if (chosen.length < count && ingredients.length >= 2) {
      const safePool = ingredients.filter((item) => {
        if (PANTRY_DEFAULTS.has(item.name) || item.category === "调味") return false;
        if (!settings.pregnancyMode) return true;
        return evaluateIngredientPregnancy(item.name, item).level !== "avoid";
      });
      const protein = safePool.find((i) => i.category === "肉禽蛋");
      const vegs = safePool.filter((i) => i.category === "蔬菜");
      const usedTitles = new Set(chosen.map((c) => c.title));

      if (protein && vegs[0] && !usedTitles.has(`${vegs[0].name}炒${protein.name}`)) {
        chosen.push({
          title: `${vegs[0].name}炒${protein.name}`,
          method: "炒",
          minutes: 15,
          reason: `利用冰箱现有的${protein.name}与${vegs[0].name}快速组合`,
          pregnancyTip: settings.pregnancyMode ? "荤素搭配补充蛋白与维生素，务必彻底炒熟" : "",
          preferenceWarning: "",
          ingredients: [
            { name: protein.name, quantityLabel: "适量", required: true },
            { name: vegs[0].name, quantityLabel: "适量", required: true },
            { name: "盐", quantityLabel: "少许", required: false },
          ],
          steps: [
            { position: 1, text: `${protein.name}与${vegs[0].name}清洗切好备用。` },
            { position: 2, text: `热锅少油先将${protein.name}翻炒至完全变色熟透。` },
            { position: 3, text: `加入${vegs[0].name}翻炒 2 分钟，加少许盐和生抽调味出锅。` },
          ],
        });
      } else if (vegs.length >= 2 && !usedTitles.has(`家常清炒${vegs[0].name}${vegs[1].name}`)) {
        chosen.push({
          title: `家常清炒${vegs[0].name}${vegs[1].name}`,
          method: "炒",
          minutes: 12,
          reason: `用家里现有的${vegs[0].name}和${vegs[1].name}凑一道清爽家常素菜`,
          pregnancyTip: settings.pregnancyMode ? "清淡少油，补充膳食纤维" : "",
          preferenceWarning: "",
          ingredients: [
            { name: vegs[0].name, quantityLabel: "适量", required: true },
            { name: vegs[1].name, quantityLabel: "适量", required: true },
            { name: "盐", quantityLabel: "少许", required: false },
          ],
          steps: [
            { position: 1, text: `${vegs[0].name}和${vegs[1].name}洗净切块或切片。` },
            { position: 2, text: `热锅少油翻炒 3 分钟至完全熟透，少许盐调味即可。` },
          ],
        });
      }
    }

    const staple = includeStaple
      ? availableSet.has("米饭")
        ? "米饭（家里已有，蒸热即可）"
        : availableSet.has("挂面")
          ? "清汤挂面（家里已有）"
          : "蒸米饭或杂粮饭"
      : "";

    return {
      mode: "use_existing",
      title: `今日推荐 · ${chosen.length} 道菜${includeStaple ? " + 主食" : ""}`,
      summary:
        chosen.length > 0
          ? `基于家里现有食材推荐，${settings.pregnancyMode ? "已避开孕期禁忌食材" : "操作省心"}`
          : "家里现有食材较少，建议切换到「规划买菜」看看买什么最合适",
      staple,
      meals: chosen,
      shoppingItems: [],
      generatedBy: "local",
    };
  }

  // mode === "shopping_plan"
  const pickedMeals = [];
  const usedTitles = new Set(excludeSet);

  if (shoppingMode === "top_up") {
    const missingFormal = formalRecipes
      .filter((r) => (r.missing || []).length > 0 && (r.missing || []).length <= 3 && !usedTitles.has(r.title))
      .filter(isRecipePregnancySafe)
      .sort((a, b) => a.missing.length - b.missing.length);

    for (const r of missingFormal) {
      if (pickedMeals.length >= totalTargetDishes) break;
      usedTitles.add(r.title);
      pickedMeals.push({
        title: r.title,
        method: r.method,
        minutes: r.minutes,
        reason: `家里已有部分食材，补买 ${r.missing.join("、")} 就能做`,
        pregnancyTip: settings.pregnancyMode ? "清淡少盐烹饪，食材充分熟透" : "",
        preferenceWarning: r.preferenceWarning || "",
        ingredients: r.ingredients,
        steps: r.steps,
        existingRecipeId: r.id,
      });
    }
  }

  for (const template of FALLBACK_PREGNANCY_DISHES) {
    if (pickedMeals.length >= totalTargetDishes) break;
    if (usedTitles.has(template.title)) continue;
    usedTitles.add(template.title);
    pickedMeals.push({
      title: template.title,
      method: template.method,
      minutes: template.minutes,
      reason: template.reason,
      pregnancyTip: settings.pregnancyMode ? template.pregnancyTip : "",
      preferenceWarning: "",
      ingredients: template.ingredients.map(({ name, quantityLabel, required }) => ({ name, quantityLabel, required })),
      steps: template.steps,
    });
  }

  const shoppingMap = new Map();
  for (const meal of pickedMeals) {
    for (const ing of meal.ingredients) {
      if (!ing.required) continue;
      if (availableSet.has(ing.name) || PANTRY_DEFAULTS.has(ing.name)) continue;
      const prev = shoppingMap.get(ing.name);
      if (prev) {
        if (!prev.forDishes.includes(meal.title)) prev.forDishes.push(meal.title);
      } else {
        const preg = evaluateIngredientPregnancy(ing.name);
        shoppingMap.set(ing.name, {
          id: `shop-${shoppingMap.size + 1}-${ing.name}`,
          name: ing.name,
          category: guessShoppingCategory(ing.name),
          quantityLabel: ing.quantityLabel || "适量",
          checked: false,
          forDishes: [meal.title],
          pregnancyLevel: preg.level,
          pregnancyNote: preg.note,
        });
      }
    }
  }

  const stapleText = includeStaple ? (availableSet.has("米饭") ? "蒸米饭（家里已有米饭）" : "大米 / 杂粮饭") : "";
  if (includeStaple && !availableSet.has("米饭") && !availableSet.has("大米") && !availableSet.has("挂面")) {
    const preg = evaluateIngredientPregnancy("大米");
    shoppingMap.set("大米", {
      id: `shop-${shoppingMap.size + 1}-大米`,
      name: "大米",
      category: "主食",
      quantityLabel: "1 袋",
      checked: false,
      forDishes: ["主食"],
      pregnancyLevel: preg.level,
      pregnancyNote: preg.note,
    });
  }

  const shoppingItems = [...shoppingMap.values()];
  return {
    mode: "shopping_plan",
    title: `${mealsCount > 1 ? `未来 ${mealsCount} 顿` : "下顿"}买菜与菜单方案`,
    summary:
      shoppingItems.length > 0
        ? `规划 ${pickedMeals.length} 道菜${includeStaple ? " + 主食" : ""}，只需采购 ${shoppingItems.length} 样缺失食材`
        : `这 ${pickedMeals.length} 道菜所需食材家里已基本齐备`,
    staple: stapleText,
    meals: pickedMeals,
    shoppingItems,
    generatedBy: "local",
  };
}

function guessShoppingCategory(name) {
  if (/番茄|土豆|青椒|洋葱|香菜|葱|胡萝卜|冬笋|豆腐|白菜|黄瓜|丝瓜|生姜|蒜|西蓝花|西兰花|油麦菜|菠菜|青菜|菜/.test(name)) return "蔬菜";
  if (/鸡|蛋|猪|牛|鱼|虾|排骨|肉|培根|火腿/.test(name)) return "肉禽蛋";
  if (/米|面|面包|馒头|饺子|年糕/.test(name)) return "主食";
  if (/盐|糖|生抽|老抽|醋|油|料酒|胡椒|酱|辣椒|花椒/.test(name)) return "调味";
  if (/奶|酸奶|芝士|黄油/.test(name)) return "乳品";
  return "其他";
}
