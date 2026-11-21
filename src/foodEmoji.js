export const INGREDIENT_CATEGORIES = ["蔬菜", "肉禽蛋", "主食", "调味", "乳品", "其他"];

export const CATEGORY_EMOJI = {
  全部: "🧺",
  蔬菜: "🥬",
  肉禽蛋: "🥩",
  主食: "🍚",
  调味: "🧂",
  乳品: "🥛",
  其他: "🧺",
};

export const METHOD_EMOJI = {
  炒: "🔥",
  煮: "🍲",
  蒸: "♨️",
  煎: "🍳",
  烤: "🔥",
  凉拌: "🥗",
  炖: "🫕",
  其他: "👨‍🍳",
};

const INGREDIENT_EMOJI_RULES = [
  { keywords: ["番茄", "西红柿", "圣女果"], emoji: "🍅", tone: "red", category: "蔬菜" },
  { keywords: ["牛奶", "纯牛奶", "酸奶", "淡奶油", "奶油", "炼乳", "豆浆"], emoji: "🥛", tone: "blu", category: "乳品" },
  { keywords: ["芝士", "奶酪", "马苏里拉", "黄油"], emoji: "🧀", tone: "yel", category: "乳品" },
  { keywords: ["牛油果"], emoji: "🥑", tone: "grn", category: "其他" },
  { keywords: ["鸡蛋", "鹅蛋", "鸭蛋", "鹌鹑蛋", "皮蛋", "咸蛋", "蛋"], emoji: "🥚", tone: "yel", category: "肉禽蛋" },
  { keywords: ["豆瓣酱", "生抽", "老抽", "酱油", "蚝油", "香醋", "陈醋", "米醋", "醋", "料酒", "芝麻油", "香油", "辣椒油", "番茄酱", "沙拉酱", "甜面酱", "咖喱", "味噌", "鸡精", "味精", "酱"], emoji: "🫙", tone: "brn", category: "调味" },
  { keywords: ["盐", "白糖", "冰糖", "红糖", "糖", "胡椒", "花椒", "八角", "桂皮", "孜然", "五香粉", "淀粉", "生粉", "姜", "生姜", "食用油", "橄榄油", "花生油", "油"], emoji: "🧂", tone: "yel", category: "调味" },
  { keywords: ["菠菜", "青菜", "油菜", "小白菜", "生菜", "空心菜", "油麦菜", "菜心", "白菜", "娃娃菜", "包菜", "卷心菜", "甘蓝", "芹菜", "韭菜", "茼蒿", "莴笋", "荠菜", "蒜苗"], emoji: "🥬", tone: "grn", category: "蔬菜" },
  { keywords: ["西兰花", "西蓝花", "花菜", "花椰菜"], emoji: "🥦", tone: "grn", category: "蔬菜" },
  { keywords: ["黄瓜", "青瓜", "丝瓜", "苦瓜", "西葫芦", "节瓜"], emoji: "🥒", tone: "grn", category: "蔬菜" },
  { keywords: ["胡萝卜", "白萝卜", "萝卜"], emoji: "🥕", tone: "red", category: "蔬菜" },
  { keywords: ["土豆", "马铃薯", "红薯", "地瓜", "紫薯", "山药", "芋头"], emoji: "🥔", tone: "yel", category: "蔬菜" },
  { keywords: ["洋葱", "紫洋葱"], emoji: "🧅", tone: "pur", category: "蔬菜" },
  { keywords: ["大蒜", "蒜瓣", "蒜末", "蒜头", "蒜"], emoji: "🧄", tone: "yel", category: "蔬菜" },
  { keywords: ["小葱", "葱花", "大葱", "青葱", "香菜", "葱", "罗勒", "薄荷"], emoji: "🌿", tone: "grn", category: "蔬菜" },
  { keywords: ["青椒", "彩椒", "甜椒", "灯笼椒", "线椒", "尖椒"], emoji: "🫑", tone: "grn", category: "蔬菜" },
  { keywords: ["辣椒", "小米辣", "干辣椒", "朝天椒", "泡椒", "剁椒"], emoji: "🌶️", tone: "red", category: "蔬菜" },
  { keywords: ["茄子"], emoji: "🍆", tone: "pur", category: "蔬菜" },
  { keywords: ["玉米", "甜玉米"], emoji: "🌽", tone: "yel", category: "蔬菜" },
  { keywords: ["香菇", "蘑菇", "金针菇", "平菇", "杏鲍菇", "口蘑", "木耳", "银耳", "菌"], emoji: "🍄", tone: "brn", category: "蔬菜" },
  { keywords: ["南瓜", "冬瓜"], emoji: "🎃", tone: "yel", category: "蔬菜" },
  { keywords: ["豆角", "四季豆", "毛豆", "豌豆", "荷兰豆", "蚕豆", "秋葵"], emoji: "🫛", tone: "grn", category: "蔬菜" },
  { keywords: ["豆腐", "豆干", "豆皮", "千张", "腐竹", "油豆腐", "冻豆腐", "内酯豆腐"], emoji: "🧈", tone: "yel", category: "蔬菜" },
  { keywords: ["茭白", "竹笋", "春笋", "冬笋", "莲藕", "藕", "芦笋", "豆芽"], emoji: "🎋", tone: "grn", category: "蔬菜" },
  { keywords: ["花生", "花生米", "核桃", "腰果", "杏仁", "芝麻"], emoji: "🥜", tone: "brn", category: "其他" },
  { keywords: ["培根", "腊肉"], emoji: "🥓", tone: "red", category: "肉禽蛋" },
  { keywords: ["香肠", "腊肠", "烤肠", "火腿肠", "午餐肉"], emoji: "🌭", tone: "red", category: "肉禽蛋" },
  { keywords: ["牛肉", "牛腩", "牛排", "肥牛", "牛腱", "牛柳", "牛"], emoji: "🥩", tone: "brn", category: "肉禽蛋" },
  { keywords: ["排骨", "五花肉", "猪肉", "里脊", "肉末", "肉丝", "肉片", "梅花肉", "火腿", "羊肉", "羊排", "肉"], emoji: "🍖", tone: "brn", category: "肉禽蛋" },
  { keywords: ["鸡肉", "鸡胸肉", "鸡腿", "鸡翅", "鸡丁", "鸭肉", "鸭腿", "鸡", "鸭"], emoji: "🍗", tone: "yel", category: "肉禽蛋" },
  { keywords: ["虾仁", "大虾", "基围虾", "明虾", "小龙虾", "虾", "蟹", "贝", "蛤蜊", "花甲", "鱿鱼", "扇贝"], emoji: "🦐", tone: "blu", category: "肉禽蛋" },
  { keywords: ["鲈鱼", "三文鱼", "带鱼", "鲫鱼", "草鱼", "鳕鱼", "黄鱼", "鲅鱼", "鳗鱼", "鱼片", "鱼丸", "鱼"], emoji: "🐟", tone: "blu", category: "肉禽蛋" },
  { keywords: ["大米", "米饭", "糯米", "小米", "糙米", "燕麦", "米"], emoji: "🍚", tone: "yel", category: "主食" },
  { keywords: ["面条", "挂面", "拉面", "乌冬", "意面", "米粉", "粉丝", "粉条", "河粉", "宽粉", "面"], emoji: "🍜", tone: "yel", category: "主食" },
  { keywords: ["饺子", "水饺", "馄饨", "抄手", "包子", "馒头", "花卷", "年糕", "汤圆", "烧麦"], emoji: "🥟", tone: "yel", category: "主食" },
  { keywords: ["吐司", "面包", "法棍", "贝果", "手抓饼", "饼", "面粉"], emoji: "🍞", tone: "yel", category: "主食" },
  { keywords: ["柠檬", "青柠"], emoji: "🍋", tone: "yel", category: "其他" },
  { keywords: ["苹果", "梨", "香蕉", "橙子", "草莓", "蓝莓"], emoji: "🍎", tone: "red", category: "其他" },
];

const DISH_COVER_RULES = [
  { keywords: ["番茄", "西红柿"], emoji: "🍅", tone: "red" },
  { keywords: ["饺", "馄饨", "盒子", "葱花饼", "手抓饼", "煎饼", "饼", "包"], emoji: "🥟", tone: "yel" },
  { keywords: ["鸡蛋", "滑蛋", "蒸蛋", "荷包蛋", "炒蛋", "蛋羹"], emoji: "🍳", tone: "yel" },
  { keywords: ["菠菜", "青菜", "油菜", "生菜", "西兰花", "黄瓜", "芹菜", "蒜蓉", "清炒"], emoji: "🥬", tone: "grn" },
  { keywords: ["排骨", "红烧肉", "扣肉", "梅菜", "回锅肉", "小炒肉", "牛肉", "牛腩", "羊肉"], emoji: "🍖", tone: "brn" },
  { keywords: ["鸡", "鸭", "宫保", "口水鸡", "可乐鸡"], emoji: "🍗", tone: "yel" },
  { keywords: ["虾", "蟹", "蛤蜊", "花甲", "海鲜"], emoji: "🦐", tone: "blu" },
  { keywords: ["鱼", "酸菜鱼", "清蒸"], emoji: "🐟", tone: "blu" },
  { keywords: ["茄子"], emoji: "🍆", tone: "pur" },
  { keywords: ["豆腐", "麻婆"], emoji: "🧈", tone: "red" },
  { keywords: ["土豆", "咖喱"], emoji: "🥔", tone: "yel" },
  { keywords: ["蘑菇", "香菇", "菌"], emoji: "🍄", tone: "brn" },
  { keywords: ["汤", "煲", "羹", "粥"], emoji: "🍲", tone: "yel" },
  { keywords: ["面", "粉", "米线", "意面"], emoji: "🍜", tone: "yel" },
  { keywords: ["饭", "炒饭", "盖饭", "焖饭"], emoji: "🍚", tone: "yel" },
  { keywords: ["凉拌", "沙拉", "拍黄瓜"], emoji: "🥗", tone: "grn" },
];

export function getIngredientEmoji(name, category = "") {
  const text = String(name || "").trim();
  for (const rule of INGREDIENT_EMOJI_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return rule.emoji;
    }
  }
  return CATEGORY_EMOJI[category] || "🥘";
}

export function getRecipeVisual(recipe) {
  const title = String(recipe?.title || "");
  for (const rule of DISH_COVER_RULES) {
    if (rule.keywords.some((kw) => title.includes(kw))) {
      return { emoji: rule.emoji, tone: rule.tone };
    }
  }

  const firstRequired = recipe?.ingredients?.find((item) => item.required);
  if (firstRequired) {
    for (const rule of INGREDIENT_EMOJI_RULES) {
      if (rule.keywords.some((kw) => firstRequired.name.includes(kw))) {
        return { emoji: rule.emoji, tone: rule.tone };
      }
    }
  }

  const method = recipe?.method || "";
  if (method === "凉拌" || method === "蒸") return { emoji: METHOD_EMOJI[method] || "🥗", tone: "grn" };
  if (method === "炖" || method === "煮") return { emoji: METHOD_EMOJI[method] || "🍲", tone: "yel" };
  if (method === "炒" || method === "煎" || method === "烤") return { emoji: METHOD_EMOJI[method] || "🍳", tone: "red" };
  return { emoji: "🍽️", tone: "yel" };
}

export function getMethodEmoji(method) {
  return METHOD_EMOJI[method] || "👨‍🍳";
}

export function normalizeSearchTerm(value) {
  const query = String(value || "").trim();
  const aliases = new Map([
    ["西红柿", "番茄"],
    ["马铃薯", "土豆"],
    ["青葱", "葱花"],
    ["小葱", "葱花"],
    ["葱", "葱花"],
    ["酱油", "生抽"],
    ["油", "食用油"],
    ["糖", "白糖"],
    ["花生", "花生米"],
    ["西蓝花", "西兰花"],
  ]);
  return aliases.get(query) || query;
}

const PREVIEW_ALIASES = new Map([
  ["西红柿", "番茄"],
  ["马铃薯", "土豆"],
  ["青葱", "葱花"],
  ["花生", "花生米"],
]);

function guessCategoryForName(name) {
  for (const rule of INGREDIENT_EMOJI_RULES) {
    if (rule.keywords.some((kw) => name.includes(kw))) {
      return rule.category;
    }
  }
  return "其他";
}

/**
 * Lightweight client-side parser to power the live confirmation preview card
 * before submitting to /api/ingredients/batch.
 */
export function previewBatchIngredients(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return [];

  const cleaned = text
    .replace(/^(今天|刚刚|刚才|家里|冰箱里?|又|刚|买了|买回来了?|还有|新添了?|剩下?|有)+/g, "")
    .replace(/[。！!？?]/g, "、");

  const tokens = cleaned
    .split(/[、，,;\n；]+|\s+(?:和|还有|以及|跟|加)\s+|(?:还有|以及|另外)/)
    .map((part) => part.trim())
    .filter(Boolean);

  const items = [];
  const seen = new Set();

  for (const token of tokens) {
    // Also split simple "A和B" inside a clause
    const subParts = token.split(/(?<=[\u4e00-\u9fa5])(?:和|跟)(?=[\u4e00-\u9fa5])/);
    for (const part of subParts) {
      let itemText = part.trim();
      if (!itemText) continue;

      let state = "none";
      if (/快过期|要坏|快坏|临期/.test(itemText)) {
        state = "expiring";
        itemText = itemText.replace(/快过期|要坏了?|快坏了?|临期/g, "");
      } else if (/优先|赶紧吃|先吃|尽快/.test(itemText)) {
        state = "priority";
        itemText = itemText.replace(/优先用掉?|优先|赶紧吃|先吃|尽快用掉?/g, "");
      } else if (/冷冻|冻着|速冻/.test(itemText)) {
        state = "frozen";
        itemText = itemText.replace(/冷冻中?|冻着|速冻/g, "");
      }

      // Strip leading quantities like "两根", "3个", "半斤", "一把"
      itemText = itemText
        .replace(/^(买了|还有|一点|一些|半|[0-9一二两三四五六七八九十]+)\s*(个|颗|根|把|斤|克|盒|袋|包|块|条|只|片|罐|瓶|碗|份)?/g, "")
        .replace(/^[的了]+|[的了]+$/g, "")
        .trim();

      if (!itemText || itemText.length > 16) continue;
      const canonical = PREVIEW_ALIASES.get(itemText) || itemText;
      if (seen.has(canonical)) continue;
      seen.add(canonical);

      const category = guessCategoryForName(canonical);
      items.push({
        raw: part.trim(),
        name: canonical,
        category,
        state,
        emoji: getIngredientEmoji(canonical, category),
      });
    }
  }

  return items;
}

const CN_NUMBERS = {
  半: 0.5,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十五: 15,
  二十: 20,
  三十: 30,
};

function parseChineseOrDigitNumber(raw) {
  if (!raw) return NaN;
  const num = Number(raw);
  if (!Number.isNaN(num)) return num;
  if (CN_NUMBERS[raw] !== undefined) return CN_NUMBERS[raw];
  return NaN;
}

/**
 * Extracts the first actionable cooking timer duration from a step string.
 * Returns { seconds, label } or null.
 */
export function extractStepTimer(stepText) {
  const text = String(stepText || "");
  if (!text) return null;

  const match = text.match(
    /(?:(\d+(?:\.\d+)?)|([半一二两三四五六七八九十]{1,2}))\s*(?:[-~～至到]\s*(?:\d+|[一二两三四五六七八九十]{1,2})\s*)?(小时|分钟|分|秒钟|秒)/,
  );
  if (!match) return null;

  const value = parseChineseOrDigitNumber(match[1] || match[2]);
  if (!value || Number.isNaN(value) || value <= 0) return null;

  const unit = match[3];
  let seconds = 0;
  if (unit === "小时") {
    seconds = Math.round(value * 3600);
  } else if (unit === "分钟" || unit === "分") {
    seconds = Math.round(value * 60);
  } else {
    seconds = Math.round(value);
  }

  if (seconds < 5 || seconds > 4 * 3600) return null;

  return {
    seconds,
    label: `${match[1] || match[2]}${unit === "分" ? "分钟" : unit === "秒" ? "秒" : unit}`,
  };
}

export function formatTimerDisplay(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}
