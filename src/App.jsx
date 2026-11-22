import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChefHat,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Dice5,
  Flame,
  Home,
  Image,
  ListChecks,
  LoaderCircle,
  LogOut,
  Mic,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PREGNANCY_DISCLAIMER,
  evaluateIngredientPregnancy,
  evaluateRecipeDietaryAlerts,
} from "../shared/pregnancy.js";
import {
  MealPlannerSheet,
  PregnancyAlertBanner,
  PregnancyBadge,
  PregnancyInfoBox,
  ShoppingPlanCard,
} from "./MealPlannerAndPregnancy.jsx";
import {
  CATEGORY_EMOJI,
  INGREDIENT_CATEGORIES,
  extractStepTimer,
  formatTimerDisplay,
  getIngredientEmoji,
  getMethodEmoji,
  getRecipeVisual,
  normalizeSearchTerm,
  previewBatchIngredients,
} from "./foodEmoji.js";

const ingredientStates = [
  { value: "none", label: "普通" },
  { value: "priority", label: "优先用掉" },
  { value: "expiring", label: "快过期" },
  { value: "frozen", label: "冷冻中" },
];

const stateShortLabels = {
  priority: "优先用",
  expiring: "快过期",
  frozen: "冷冻",
  none: "",
};

const cookingMethods = ["炒", "煮", "蒸", "煎", "烤", "凉拌", "炖", "其他"];

const draftSourceLabels = {
  generated: "AI 生成",
  text: "文字导入",
  web: "网页链接",
  image: "拍照识别",
  manual: "手动草稿",
};

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("familyAccessToken") || "");
  const [app, setApp] = useState(null);
  const [activeTab, setActiveTab] = useState("today");

  // Today state
  const [matchTab, setMatchTab] = useState("ready");
  const [todayPriorityOnly, setTodayPriorityOnly] = useState(false);
  const [todayIngredientFilter, setTodayIngredientFilter] = useState("");
  const [randomPick, setRandomPick] = useState(null);

  // Ingredients state
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [ingredientSearchOpen, setIngredientSearchOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [excludedPreviewNames, setExcludedPreviewNames] = useState([]);
  const [batchPreviewOpen, setBatchPreviewOpen] = useState(false);
  const [batchInputOrigin, setBatchInputOrigin] = useState("manual");
  const batchComposingRef = useRef(false);
  const ingredientTextareaRef = useRef(null);

  // Recipes library state
  const [recipeQuery, setRecipeQuery] = useState("");
  const [recipeReadyOnly, setRecipeReadyOnly] = useState(false);
  const [recipeMethod, setRecipeMethod] = useState("");
  const [recipeTime, setRecipeTime] = useState("");

  // Create / Drafts sheet state
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [createNotice, setCreateNotice] = useState("");
  const [draftSource, setDraftSource] = useState("text");
  const [draftText, setDraftText] = useState("");
  const [draftImageDataUrl, setDraftImageDataUrl] = useState("");

  // Modal / sheet states
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [cookingRecipe, setCookingRecipe] = useState(null);
  const [ingredientEditor, setIngredientEditor] = useState(null);
  const [mealPlannerMode, setMealPlannerMode] = useState(null); // null | "use_existing" | "shopping_plan"
  const [creatingManualRecipe, setCreatingManualRecipe] = useState(false);
  const [draftEditor, setDraftEditor] = useState(null);
  const [recipeEditor, setRecipeEditor] = useState(null);
  const [completionNotice, setCompletionNotice] = useState(null);
  const [pregnancyAlert, setPregnancyAlert] = useState(null);

  // Request status
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [syncState, setSyncState] = useState("synced");
  const busy = Boolean(pendingAction);
  const draftSourceReady = draftSource === "image" ? Boolean(draftImageDataUrl) : Boolean(draftText.trim());

  const batchPreviewAll = useMemo(
    () => (batchPreviewOpen ? previewBatchIngredients(batchText) : []),
    [batchPreviewOpen, batchText],
  );
  const batchPreviewItems = useMemo(
    () => batchPreviewAll.filter((item) => !excludedPreviewNames.includes(item.name)),
    [batchPreviewAll, excludedPreviewNames],
  );

  useEffect(() => {
    if (!token) return;
    api("/api/app", { token })
      .then((nextApp) => {
        setError("");
        setApp(nextApp);
        setSyncState("synced");
      })
      .catch((err) => {
        if (err.status === 401) {
          localStorage.removeItem("familyAccessToken");
          setToken("");
          return;
        }
        setError(err.message);
        setSyncState("error");
      });
  }, [token]);

  useEffect(() => {
    if (app && app.matches.ready.length === 0 && app.matches.missing.length > 0) {
      setMatchTab("missing");
    }
  }, [app]);

  useEffect(() => {
    if (!completionNotice || completionNotice.undoId) return undefined;
    const timer = setTimeout(() => setCompletionNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [completionNotice]);

  const handleBatchTextChange = (nextText, { openPreview = false, origin = "manual" } = {}) => {
    setBatchText(nextText);
    setExcludedPreviewNames([]);
    setBatchInputOrigin(origin);
    if (!nextText.trim()) {
      setBatchPreviewOpen(false);
    } else {
      setBatchPreviewOpen(openPreview);
    }
  };

  const openBatchPreview = () => {
    if (!batchText.trim() || busy) return;
    setExcludedPreviewNames([]);
    setBatchPreviewOpen(true);
  };

  const resumeEditingBatchText = () => {
    setBatchPreviewOpen(false);
    requestAnimationFrame(() => {
      const textarea = ingredientTextareaRef.current;
      if (textarea) {
        textarea.focus();
        const len = textarea.value.length;
        textarea.setSelectionRange(len, len);
      }
    });
  };

  if (!token) {
    return (
      <AccessGate
        onUnlock={(nextToken, nextApp) => {
          setToken(nextToken);
          setApp(nextApp);
        }}
      />
    );
  }

  if (!app) {
    return (
      <div className="loading-screen">
        {error ? (
          <div className="loading-card" role="alert">
            <span className="loading-emoji" aria-hidden="true">🍳</span>
            <strong>家庭空间暂时无法打开</strong>
            <p>{error}</p>
            <button className="btn-primary" type="button" onClick={() => window.location.reload()}>
              重新加载
            </button>
          </div>
        ) : (
          <div className="loading-card">
            <span className="loading-emoji pulse" aria-hidden="true">🍳</span>
            <strong>正在打开家庭厨房...</strong>
          </div>
        )}
      </div>
    );
  }

  const settings = app.settings || { pregnancyMode: true, dietaryNotes: "", defaultMealStyle: "2菜+主食" };
  const pregnancyMode = Boolean(settings.pregnancyMode);
  const kitchenName = app.family.name === "张家" ? "小张张的幸福厨房" : `${app.family.name}厨房`;
  const allRecipes = [...app.matches.ready, ...app.matches.missing];
  const recipeMethods = [...new Set(allRecipes.map((recipe) => recipe.method))];
  const urgentIngredients = app.ingredients
    .filter((item) => item.state === "expiring" || item.state === "priority")
    .sort((a, b) => (a.state === "expiring" ? -1 : 1) - (b.state === "expiring" ? -1 : 1));
  const specialStateIngredients = app.ingredients
    .filter((item) => item.state !== "none")
    .sort((a, b) => {
      const order = { expiring: 0, priority: 1, frozen: 2 };
      return (order[a.state] ?? 3) - (order[b.state] ?? 3);
    });
  const urgentNameSet = new Set(urgentIngredients.map((item) => item.name));
  const availableNames = new Set([...app.ingredients.map((item) => item.name), ...(app.pantry || [])]);
  const pantrySet = new Set(app.pantry || []);

  // Today filtered recipes
  const filterTodayList = (list) => {
    let result = list;
    if (todayIngredientFilter) {
      result = result.filter((recipe) => recipe.ingredients.some((item) => item.name === todayIngredientFilter));
    } else if (todayPriorityOnly) {
      result = result.filter((recipe) => recipe.usesPriority);
    }
    return result;
  };
  const todayReady = filterTodayList(app.matches.ready);
  const todayMissing = filterTodayList(app.matches.missing);
  const todayVisibleRecipes = matchTab === "ready" ? todayReady : todayMissing;

  // Library filtered recipes
  const libraryBase = recipeReadyOnly ? app.matches.ready : allRecipes;
  const libraryRecipes = filterRecipes(libraryBase, recipeQuery, recipeMethod, recipeTime);
  const hasLibraryFilters = Boolean(recipeQuery || recipeReadyOnly || recipeMethod || recipeTime);

  // Ingredients filtered
  const visibleIngredients = filterIngredients(app.ingredients, selectedCategory, ingredientQuery);
  const showGroupedIngredients = selectedCategory === "全部" && !ingredientQuery.trim();

  async function refresh() {
    setPendingAction("refresh");
    setSyncState("syncing");
    setError("");
    try {
      setApp(await api("/api/app", { token }));
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  function notifyAddedIngredients(addedIngredients, nextSettings, fallbackMessage) {
    const list = Array.isArray(addedIngredients) ? addedIngredients : [];
    const activePregnancy = nextSettings ? Boolean(nextSettings.pregnancyMode) : pregnancyMode;
    if (!activePregnancy || list.length === 0) {
      setCompletionNotice({ message: fallbackMessage, undoId: null });
      return;
    }
    const hasFlagged = list.some((item) => item.pregnancyLevel && item.pregnancyLevel !== "safe");
    if (hasFlagged) {
      setPregnancyAlert({ items: list });
      setCompletionNotice({ message: fallbackMessage, undoId: null });
    } else {
      setPregnancyAlert(null);
      setCompletionNotice({
        message: `${fallbackMessage} · 新增 ${list.length} 种均适合孕期食用 🤰`,
        undoId: null,
      });
    }
  }

  async function addBatchIngredients(overrideText) {
    const raw = typeof overrideText === "string" ? overrideText : batchText;
    const submitText =
      excludedPreviewNames.length > 0 && batchPreviewItems.length > 0
        ? batchPreviewItems
            .map((item) => {
              const stateSuffix =
                item.state === "expiring" ? "快过期" : item.state === "priority" ? "优先" : item.state === "frozen" ? "冷冻" : "";
              return `${item.name}${stateSuffix}`;
            })
            .join("、")
        : raw;

    if (!submitText.trim()) return;
    setPendingAction("batch");
    setSyncState("syncing");
    setError("");
    try {
      const nextApp = await api("/api/ingredients/batch", {
        token,
        method: "POST",
        body: { text: submitText },
      });
      setApp(nextApp);
      setBatchText("");
      setExcludedPreviewNames([]);
      setBatchPreviewOpen(false);
      setBatchInputOrigin("manual");
      notifyAddedIngredients(nextApp.addedIngredients, nextApp.settings, "食材清单已更新，菜谱已重新匹配");
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  function openNewIngredient() {
    setError("");
    setIngredientEditor({
      id: null,
      name: "",
      category: selectedCategory === "全部" ? "" : selectedCategory,
      state: "none",
    });
  }

  function openIngredient(ingredient) {
    setError("");
    setIngredientEditor({ ...ingredient });
  }

  async function saveIngredient(ingredient) {
    const editing = Boolean(ingredient.id);
    setPendingAction("ingredient-save");
    setSyncState("syncing");
    setError("");
    try {
      const nextApp = await api(editing ? `/api/ingredients/${ingredient.id}` : "/api/ingredients", {
        token,
        method: editing ? "PATCH" : "POST",
        body: {
          name: ingredient.name,
          category: ingredient.category,
          state: ingredient.state,
        },
      });
      setApp(nextApp);
      setIngredientEditor(null);
      if (!editing) {
        notifyAddedIngredients(nextApp.addedIngredients, nextApp.settings, `已添加「${ingredient.name}」`);
      }
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  async function updateFamilySettings(patch) {
    setPendingAction("settings-save");
    setSyncState("syncing");
    setError("");
    try {
      const nextApp = await api("/api/settings", {
        token,
        method: "PATCH",
        body: patch,
      });
      setApp(nextApp);
      setCompletionNotice({ message: "家庭饮食设置已同步", undoId: null });
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  async function suggestMealPlan(options) {
    setSyncState("syncing");
    setError("");
    try {
      const result = await api("/api/meal-plan/suggest", {
        token,
        method: "POST",
        body: options,
      });
      setSyncState("synced");
      return result.plan;
    } catch (err) {
      setSyncState("error");
      throw err;
    }
  }

  async function createManualRecipe(recipePayload) {
    setPendingAction("recipe-create");
    setSyncState("syncing");
    setError("");
    try {
      const result = await api("/api/recipes", {
        token,
        method: "POST",
        body: { ...recipePayload, status: "formal", sourceType: recipePayload.sourceType || "manual" },
      });
      setApp(result.app);
      setCreatingManualRecipe(false);
      setCreateSheetOpen(false);
      if (result.recipe) {
        setSelectedRecipe(result.recipe);
      }
      setCompletionNotice({ message: `已保存菜谱「${recipePayload.title}」`, undoId: null });
      setSyncState("synced");
      return result.recipe;
    } catch (err) {
      setError(err.message);
      setSyncState("error");
      throw err;
    } finally {
      setPendingAction("");
    }
  }

  async function saveSuggestedMealToLibrary(meal) {
    setPendingAction("recipe-create");
    setSyncState("syncing");
    setError("");
    try {
      const result = await api("/api/recipes", {
        token,
        method: "POST",
        body: {
          title: meal.title,
          method: meal.method,
          minutes: meal.minutes,
          preferenceWarning: meal.preferenceWarning || "",
          status: "formal",
          sourceType: "planned",
          sourceText: meal.reason || "",
          ingredients: meal.ingredients,
          steps: meal.steps.map((s) => (typeof s === "string" ? s : s.text)),
        },
      });
      setApp(result.app);
      setCompletionNotice({ message: `已收藏「${meal.title}」到菜谱库`, undoId: null });
      setSyncState("synced");
      return result.recipe;
    } catch (err) {
      setError(err.message);
      setSyncState("error");
      throw err;
    } finally {
      setPendingAction("");
    }
  }

  async function saveShoppingPlan(nextPlan) {
    setPendingAction("shopping-save");
    setSyncState("syncing");
    setError("");
    try {
      const nextApp = await api("/api/shopping-plan", {
        token,
        method: "PUT",
        body: nextPlan ? nextPlan : { clear: true },
      });
      setApp(nextApp);
      setSyncState("synced");
      return nextApp;
    } catch (err) {
      setError(err.message);
      setSyncState("error");
      throw err;
    } finally {
      setPendingAction("");
    }
  }

  async function addMissingToShoppingList(recipe) {
    const missing = recipe?.missing || [];
    if (missing.length === 0) return;
    const current = app.shoppingPlan || {
      title: "家庭买菜清单",
      summary: "",
      staple: "",
      meals: [],
      items: [],
    };
    const nextItems = [...(current.items || [])];
    for (const name of missing) {
      const existing = nextItems.find((item) => item.name === name);
      if (existing) {
        const dishes = new Set([...(existing.forDishes || []), recipe.title]);
        existing.forDishes = [...dishes];
      } else {
        const preg = evaluateIngredientPregnancy(name);
        const matchedIng = recipe.ingredients.find((i) => i.name === name);
        nextItems.push({
          id: `shop-${Date.now()}-${name}`,
          name,
          category: "其他",
          quantityLabel: matchedIng?.quantityLabel || "适量",
          checked: false,
          forDishes: [recipe.title],
          pregnancyLevel: preg.level,
          pregnancyNote: preg.note,
        });
      }
    }
    const nextMeals = [...(current.meals || [])];
    if (!nextMeals.some((m) => m.title === recipe.title)) {
      nextMeals.push({
        title: recipe.title,
        method: recipe.method,
        minutes: recipe.minutes,
        reason: "自家菜谱补齐缺料",
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      });
    }
    await saveShoppingPlan({ ...current, items: nextItems, meals: nextMeals });
    setCompletionNotice({ message: `已将 ${missing.join("、")} 加入买菜清单`, undoId: null });
  }

  async function addManualShoppingItem(rawName) {
    const name = String(rawName || "").trim();
    if (!name) return;
    const current = app.shoppingPlan || {
      title: "家庭买菜清单",
      summary: "",
      staple: "",
      meals: [],
      items: [],
    };
    const items = [...(current.items || [])];
    if (items.some((item) => item.name === name)) {
      setCompletionNotice({ message: `「${name}」已在买菜清单中`, undoId: null });
      return;
    }
    const preg = evaluateIngredientPregnancy(name);
    items.push({
      id: `shop-${Date.now()}-${name}`,
      name,
      category: "其他",
      quantityLabel: "",
      checked: false,
      forDishes: ["手动添加"],
      pregnancyLevel: preg.level,
      pregnancyNote: preg.note,
    });
    await saveShoppingPlan({ ...current, items });
    if (pregnancyMode && (preg.level === "avoid" || preg.level === "caution")) {
      setPregnancyAlert({
        items: [{ name, category: "其他", pregnancyLevel: preg.level, pregnancyNote: preg.note }],
      });
    }
  }

  async function toggleShoppingItem(id) {
    if (!app.shoppingPlan) return;
    const previousPlan = app.shoppingPlan;
    const nextPlan = {
      ...previousPlan,
      items: (previousPlan.items || []).map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item,
      ),
    };
    setApp((current) => (current ? { ...current, shoppingPlan: nextPlan } : current));
    try {
      await saveShoppingPlan(nextPlan);
    } catch {
      setApp((current) => (current ? { ...current, shoppingPlan: previousPlan } : current));
    }
  }

  async function removeShoppingItem(id) {
    if (!app.shoppingPlan) return;
    const nextItems = (app.shoppingPlan.items || []).filter((item) => item.id !== id);
    await saveShoppingPlan(nextItems.length === 0 ? null : { ...app.shoppingPlan, items: nextItems });
  }

  async function commitShoppingPlan({ saveMeals = true } = {}) {
    setPendingAction("shopping-commit");
    setSyncState("syncing");
    setError("");
    try {
      const result = await api("/api/shopping-plan/commit", {
        token,
        method: "POST",
        body: { saveMeals },
      });
      setApp(result);
      const count = (result.addedIngredients || []).length;
      const savedCount = (result.savedRecipeIds || []).length;
      const msg = savedCount > 0
        ? `已入库 ${count} 种食材，并收藏 ${savedCount} 道推荐菜`
        : `已入库 ${count} 种买回的食材，菜谱已更新`;
      notifyAddedIngredients(result.addedIngredients, result.settings, msg);
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  function startCookingSuggestedMeal(meal) {
    const existing = allRecipes.find((r) => r.id === meal.existingRecipeId || r.title === meal.title);
    if (existing) {
      setCookingRecipe(existing);
      setCompletionNotice(null);
      setError("");
      return;
    }
    setCookingRecipe({
      id: `temp-${meal.title}`,
      isTemporary: true,
      title: meal.title,
      method: meal.method || "炒",
      minutes: meal.minutes || 20,
      preferenceWarning: meal.preferenceWarning || "",
      reason: meal.reason || "",
      ingredients: meal.ingredients || [],
      steps: (meal.steps || []).map((s, idx) => ({
        position: s.position || idx + 1,
        text: typeof s === "string" ? s : s.text,
      })),
    });
    setCompletionNotice(null);
    setError("");
  }

  async function removeIngredient(id) {
    setPendingAction("ingredient-delete");
    setSyncState("syncing");
    setError("");
    try {
      setApp(
        await api(`/api/ingredients/${id}`, {
          token,
          method: "DELETE",
        }),
      );
      setIngredientEditor(null);
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  async function analyzeDraft() {
    setPendingAction("draft-analyze");
    setSyncState("syncing");
    setError("");
    try {
      const result = await api("/api/drafts/analyze", {
        token,
        method: "POST",
        body: {
          sourceType: draftSource,
          content: draftText,
          imageDataUrl: draftImageDataUrl,
        },
      });
      setApp(result.app);
      setDraftText("");
      setDraftImageDataUrl("");
      setCreateNotice("已解析为草稿，请核对后存入菜谱库");
      setSyncState("synced");
      return true;
    } catch (err) {
      setError(err.message);
      setSyncState("error");
      return false;
    } finally {
      setPendingAction("");
    }
  }

  async function selectDraftImage(file) {
    if (!file) return;
    setError("");
    try {
      const dataUrl = await compressRecipeImage(file);
      setDraftImageDataUrl(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveDraft(draft, confirmAfterSave) {
    setPendingAction(confirmAfterSave ? "draft-confirm" : "draft-save");
    setSyncState("syncing");
    setError("");
    try {
      const updated = await api(`/api/drafts/${draft.id}`, {
        token,
        method: "PATCH",
        body: draft,
      });
      setApp(updated.app);

      if (!confirmAfterSave) {
        setDraftEditor(null);
        setSyncState("synced");
        return;
      }

      const result = await api(`/api/drafts/${draft.id}/confirm`, { token, method: "POST" });
      setApp(result.app);
      setDraftEditor(null);
      setCreateSheetOpen(false);
      const savedRecipe = findRecipeById(result.app.matches, result.savedRecipeId);
      if (savedRecipe) {
        setSelectedRecipe(savedRecipe);
      }
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  async function removeDraft(id) {
    setPendingAction("draft-delete");
    setSyncState("syncing");
    setError("");
    try {
      setApp(await api(`/api/drafts/${id}`, { token, method: "DELETE" }));
      setCreateNotice("");
      setSyncState("synced");
      return true;
    } catch (err) {
      setError(err.message);
      setSyncState("error");
      return false;
    } finally {
      setPendingAction("");
    }
  }

  async function saveFormalRecipe(recipe) {
    setPendingAction("recipe-save");
    setSyncState("syncing");
    setError("");
    try {
      const result = await api(`/api/recipes/${recipe.id}`, {
        token,
        method: "PATCH",
        body: recipe,
      });
      setApp(result.app);
      setRecipeEditor(null);
      setSelectedRecipe(result.recipe);
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  async function removeFormalRecipe(id) {
    setPendingAction("recipe-delete");
    setSyncState("syncing");
    setError("");
    try {
      setApp(await api(`/api/recipes/${id}`, { token, method: "DELETE" }));
      sessionStorage.removeItem(`happy-eat-cooking-${id}`);
      setSelectedRecipe(null);
      setRecipeEditor(null);
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  async function completeCooking(recipe, consumptions, { saveTempRecipe = false } = {}) {
    setPendingAction("cooking-complete");
    setSyncState("syncing");
    setError("");
    try {
      let targetRecipeId = recipe.id;
      if (recipe.isTemporary) {
        if (saveTempRecipe) {
          const created = await api("/api/recipes", {
            token,
            method: "POST",
            body: {
              title: recipe.title,
              method: recipe.method,
              minutes: recipe.minutes,
              preferenceWarning: recipe.preferenceWarning || "",
              status: "formal",
              sourceType: "planned",
              sourceText: recipe.reason || "",
              ingredients: recipe.ingredients,
              steps: recipe.steps.map((s) => s.text),
            },
          });
          setApp(created.app);
          targetRecipeId = created.recipe?.id;
        } else {
          // Apply consumption updates directly to matching inventory items
          let latestApp = app;
          let removed = 0;
          let prioritized = 0;
          for (const item of consumptions || []) {
            if (item.action === "kept") continue;
            const found = (latestApp?.ingredients || []).find((ing) => ing.name === item.name);
            if (!found) continue;
            if (item.action === "used_up") {
              latestApp = await api(`/api/ingredients/${found.id}`, { token, method: "DELETE" });
              removed += 1;
            } else if (found.state !== "priority") {
              latestApp = await api(`/api/ingredients/${found.id}`, {
                token,
                method: "PATCH",
                body: { state: "priority" },
              });
              prioritized += 1;
            }
          }
          setApp(latestApp);
          setCookingRecipe(null);
          setSelectedRecipe(null);
          sessionStorage.removeItem(`happy-eat-cooking-${recipe.id}`);
          const changes = [];
          if (removed > 0) changes.push(`移除 ${removed} 项`);
          if (prioritized > 0) changes.push(`${prioritized} 项标为优先`);
          setCompletionNotice({
            message: changes.length > 0 ? `食材已更新：${changes.join("，")}` : "已完成烹饪，开饭啦！",
            undoId: null,
          });
          setSyncState("synced");
          return;
        }
      }

      const result = await api(`/api/recipes/${targetRecipeId}/complete`, {
        token,
        method: "POST",
        body: { consumptions },
      });
      const changes = [];
      if (result.summary.removed > 0) changes.push(`移除 ${result.summary.removed} 项`);
      if (result.summary.prioritized > 0) changes.push(`${result.summary.prioritized} 项标为优先`);
      setApp(result.app);
      setCookingRecipe(null);
      setSelectedRecipe(null);
      sessionStorage.removeItem(`happy-eat-cooking-${recipe.id}`);
      setCompletionNotice({
        message: changes.length > 0
          ? `${saveTempRecipe ? "已收藏菜谱并更新食材：" : "食材已更新："}${changes.join("，")}`
          : saveTempRecipe
            ? "已完成烹饪，并已收藏到菜谱库"
            : "已完成烹饪，食材清单没有变化",
        undoId: result.undoId,
      });
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
      throw err;
    } finally {
      setPendingAction("");
    }
  }

  async function undoCookingCompletion() {
    if (!completionNotice?.undoId) return;
    setPendingAction("cooking-undo");
    setSyncState("syncing");
    setError("");
    try {
      const result = await api(`/api/consumption-events/${completionNotice.undoId}/undo`, {
        token,
        method: "POST",
      });
      setApp(result.app);
      setCompletionNotice({ message: "已撤销本次食材变化", undoId: null });
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  function pickRandomRecipe(excludeId = null) {
    const rawPool = app.matches.ready.length > 0 ? app.matches.ready : app.matches.missing;
    if (rawPool.length === 0) return;
    const safePool = pregnancyMode
      ? rawPool.filter((r) => r.pregnancyWarning?.level !== "avoid")
      : rawPool;
    const pool = safePool.length > 0 ? safePool : rawPool;
    const candidates = pool.length > 1 && excludeId ? pool.filter((r) => r.id !== excludeId) : pool;
    // Slightly weight priority-using recipes so expiring ingredients get used up
    const weighted = [];
    for (const item of candidates) {
      weighted.push(item);
      if (item.usesPriority) weighted.push(item);
    }
    const chosen = weighted[Math.floor(Math.random() * weighted.length)];
    setRandomPick(chosen);
  }

  function clearLibraryFilters() {
    setRecipeQuery("");
    setRecipeReadyOnly(false);
    setRecipeMethod("");
    setRecipeTime("");
  }

  function signOutFamily() {
    localStorage.removeItem("familyAccessToken");
    setToken("");
    setApp(null);
    setActiveTab("today");
  }

  const draftCount = app.drafts.length;

  return (
    <div className="app-viewport">
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>

        {error && !ingredientEditor && !createSheetOpen && !draftEditor && !recipeEditor && !creatingManualRecipe && !mealPlannerMode && !selectedRecipe && !cookingRecipe && (
          <div className="floating-banner error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="关闭错误提示">
              <X size={16} />
            </button>
          </div>
        )}

        {pregnancyAlert && (
          <div className="preg-alert-slot">
            <PregnancyAlertBanner alert={pregnancyAlert} onClose={() => setPregnancyAlert(null)} />
          </div>
        )}

        {completionNotice && (
          <div className="floating-banner toast" role="status">
            <span>{completionNotice.message}</span>
            <div className="toast-actions">
              {completionNotice.undoId && (
                <button type="button" className="toast-undo" onClick={undoCookingCompletion} disabled={pendingAction === "cooking-undo"}>
                  {pendingAction === "cooking-undo" ? "撤销中" : "撤销"}
                </button>
              )}
              <button type="button" className="toast-close" onClick={() => setCompletionNotice(null)} aria-label="关闭提示">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <main className={`page-main tab-${activeTab}`} id="main-content">
          {/* ===================== 01. TODAY ===================== */}
          {activeTab === "today" && (
            <div className="page-stack">
              <header className="page-header">
                <div>
                  <p className="header-sub">
                    {getWeekdayGreeting()} 👋 {kitchenName}
                  </p>
                  <h1 className="header-title">{getMealQuestion()}</h1>
                </div>
                <button
                  className={`header-status-pill ${pregnancyMode ? "is-guard" : ""} sync-${syncState}`}
                  type="button"
                  onClick={() => setActiveTab("family")}
                  aria-label={pregnancyMode ? "孕期饮食守护已开启，点击管理家庭饮食档案" : "管理家庭饮食档案"}
                  title={`${pregnancyMode ? "孕期守护中" : "孕期守护已关"} · ${syncState === "syncing" ? "同步中" : syncState === "error" ? "同步异常" : "已同步"}`}
                >
                  <span aria-hidden="true">{pregnancyMode ? "🤰" : "🍽"}</span>
                  <span>{pregnancyMode ? "守护中" : "饮食档案"}</span>
                  <span className="sync-dot" aria-hidden="true" />
                </button>
              </header>

              {/* Hero Card: focused on 2 primary family decisions */}
              <section className={`hero-card ${app.matches.ready.length === 0 ? "is-empty-fridge" : ""}`} aria-label="今日可做概览">
                <div className="hero-content">
                  {app.matches.ready.length > 0 ? (
                    <>
                      <div className="hero-label">家里食材现在就能做</div>
                      <div className="hero-number">
                        <strong>{app.matches.ready.length}</strong>
                        <span>道菜</span>
                      </div>
                      <div className="hero-stat">
                        {app.ingredients.length} 种食材
                        {app.matches.missing.length > 0 ? ` · 另有 ${app.matches.missing.length} 道差少许食材` : " · 菜谱全部齐全"}
                      </div>
                      <div className="hero-btn-group">
                        <button
                          className="hero-pick-btn primary-hero"
                          type="button"
                          onClick={() => {
                            setError("");
                            setMealPlannerMode("use_existing");
                          }}
                        >
                          <Sparkles size={16} aria-hidden="true" />
                          <span>帮我想吃什么</span>
                        </button>
                        <button
                          className="hero-pick-btn"
                          type="button"
                          onClick={() => {
                            setError("");
                            setMealPlannerMode("shopping_plan");
                          }}
                        >
                          <ShoppingCart size={15} aria-hidden="true" />
                          <span>规划买菜</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="hero-label">冰箱快空啦</div>
                      <div className="hero-empty-title">不知道买什么菜？</div>
                      <div className="hero-stat">
                        当前 {app.ingredients.length} 种食材 · 帮你规划下顿 2 道菜 + 主食与买菜清单
                      </div>
                      <div className="hero-btn-group">
                        <button
                          className="hero-pick-btn primary-hero"
                          type="button"
                          onClick={() => {
                            setError("");
                            setMealPlannerMode("shopping_plan");
                          }}
                        >
                          <ShoppingCart size={16} aria-hidden="true" />
                          <span>规划买菜与菜单</span>
                        </button>
                        <button
                          className="hero-pick-btn"
                          type="button"
                          onClick={() => {
                            setError("");
                            setMealPlannerMode("use_existing");
                          }}
                        >
                          <Sparkles size={15} aria-hidden="true" />
                          <span>帮我想吃什么</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="hero-deco" aria-hidden="true">
                  {app.matches.ready.length === 0 ? "🛒" : "🍳"}
                </div>
              </section>

              {/* Shared Family Shopping Plan Card */}
              {app.shoppingPlan && (
                <ShoppingPlanCard
                  plan={app.shoppingPlan}
                  pregnancyMode={pregnancyMode}
                  busy={busy}
                  onToggleItem={toggleShoppingItem}
                  onRemoveItem={removeShoppingItem}
                  onAddManualItem={addManualShoppingItem}
                  onCommit={commitShoppingPlan}
                  onClear={() => saveShoppingPlan(null)}
                  onOpenPlanner={() => {
                    setError("");
                    setMealPlannerMode("shopping_plan");
                  }}
                  onCookMeal={startCookingSuggestedMeal}
                />
              )}

              {/* Priority / Expiring Strip */}
              {urgentIngredients.length > 0 && (
                <section className="priority-card" aria-label="尽快用掉的食材">
                  <div className="priority-head">
                    <span className="priority-title">⏰ 这些要尽快用掉</span>
                    <button
                      className="priority-link"
                      type="button"
                      onClick={() => {
                        setTodayIngredientFilter("");
                        setTodayPriorityOnly((prev) => !prev);
                      }}
                    >
                      {todayPriorityOnly ? "查看全部 ›" : "看相关菜 ›"}
                    </button>
                  </div>
                  <div className="priority-chips">
                    {urgentIngredients.map((item) => {
                      const active = todayIngredientFilter === item.name;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`pill-chip priority-item ${active ? "active" : ""}`}
                          onClick={() => {
                            setTodayPriorityOnly(false);
                            setTodayIngredientFilter((prev) => (prev === item.name ? "" : item.name));
                          }}
                          aria-pressed={active}
                        >
                          <span aria-hidden="true">{getIngredientEmoji(item.name, item.category)}</span>
                          <span>{item.name}</span>
                          <span className={`status-dot dot-${item.state}`} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Segmented Match Control + Inline Random Pick from Family Recipes */}
              <div className="matches-section">
                <div className="matches-bar-row">
                  <div className="segmented-control flex1" role="tablist" aria-label="菜谱匹配分类">
                    <button
                      type="button"
                      role="tab"
                      className={matchTab === "ready" ? "active" : ""}
                      aria-selected={matchTab === "ready"}
                      onClick={() => setMatchTab("ready")}
                    >
                      <span>现在能做</span>
                      <em className="seg-badge ready">{todayReady.length}</em>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={matchTab === "missing" ? "active" : ""}
                      aria-selected={matchTab === "missing"}
                      onClick={() => setMatchTab("missing")}
                    >
                      <span>差一点</span>
                      <em className="seg-badge missing">{todayMissing.length}</em>
                    </button>
                  </div>
                  {allRecipes.length > 0 && (
                    <button
                      type="button"
                      className="random-dice-btn"
                      onClick={() => pickRandomRecipe()}
                      aria-label="从自家菜谱随便挑一道"
                      title="从自家菜谱随便挑一道"
                    >
                      <Dice5 size={16} aria-hidden="true" />
                      <span>随便挑</span>
                    </button>
                  )}
                </div>

                {(todayPriorityOnly || todayIngredientFilter) && (
                  <div className="active-filter-bar">
                    <span>
                      {todayIngredientFilter ? `正在看含「${todayIngredientFilter}」的菜` : "正在看会用到优先食材的菜"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTodayPriorityOnly(false);
                        setTodayIngredientFilter("");
                      }}
                    >
                      查看全部
                    </button>
                  </div>
                )}

                <TodayRecipeList
                  recipes={todayVisibleRecipes}
                  urgentNameSet={urgentNameSet}
                  pregnancyMode={pregnancyMode}
                  settings={settings}
                  busy={busy}
                  onOpen={setSelectedRecipe}
                  onAddMissingToShopping={addMissingToShoppingList}
                  emptyMessage={
                    todayIngredientFilter
                      ? `暂无含「${todayIngredientFilter}」的${matchTab === "ready" ? "可做" : "待补"}菜谱`
                      : matchTab === "ready"
                        ? "当前还没有可立刻做的菜，试试「帮我想吃什么」或「规划买菜」吧。"
                        : "目前没有差一点就能做的菜谱。"
                  }
                  onQuickAction={() => {
                    setError("");
                    setMealPlannerMode(matchTab === "ready" ? "use_existing" : "shopping_plan");
                  }}
                />
              </div>
            </div>
          )}

          {/* ===================== 02. INGREDIENTS ===================== */}
          {activeTab === "ingredients" && (
            <div className="page-stack">
              <header className="page-header">
                <div>
                  <h1 className="header-title">食材</h1>
                  <p className="header-sub">
                    共 {app.ingredients.length} 种
                    {urgentIngredients.length > 0 ? ` · ${urgentIngredients.length} 种需尽快用掉` : "可用食材"}
                  </p>
                </div>
                <div className="header-actions">
                  <button
                    className={`icon-square-btn ${ingredientSearchOpen || ingredientQuery ? "active" : ""}`}
                    type="button"
                    onClick={() => {
                      setIngredientSearchOpen((prev) => {
                        if (prev) setIngredientQuery("");
                        return !prev;
                      });
                    }}
                    aria-label="切换食材搜索"
                    aria-expanded={ingredientSearchOpen || Boolean(ingredientQuery)}
                  >
                    <Search size={19} />
                  </button>
                  <button
                    className="icon-square-btn accent"
                    type="button"
                    onClick={openNewIngredient}
                    aria-label="添加食材"
                  >
                    <Plus size={20} strokeWidth={2.4} />
                  </button>
                </div>
              </header>

              {(ingredientSearchOpen || ingredientQuery) && (
                <label className="search-bar">
                  <Search size={17} aria-hidden="true" />
                  <input
                    type="search"
                    value={ingredientQuery}
                    onChange={(event) => setIngredientQuery(event.target.value)}
                    placeholder="搜索食材（支持别名，如西红柿、青葱）"
                    aria-label="搜索食材"
                    autoFocus
                  />
                  {ingredientQuery && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => setIngredientQuery("")}
                      aria-label="清空食材搜索"
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
              )}

              {/* Voice Composer + Explicit Parse Preview Card */}
              <section
                className={`ingredient-composer-box ${batchPreviewOpen && batchText.trim() ? "has-preview" : ""}`}
                aria-label="自然语言批量添加食材"
              >
                {(!batchPreviewOpen || !batchText.trim()) && (
                  <>
                    <div className="quick-composer-row">
                      <textarea
                        ref={ingredientTextareaRef}
                        className="quick-composer-textarea"
                        rows={batchText.includes("\n") || batchText.length > 18 ? 2 : 1}
                        value={batchText}
                        onChange={(event) => handleBatchTextChange(event.target.value)}
                        onCompositionStart={() => {
                          batchComposingRef.current = true;
                        }}
                        onCompositionEnd={() => {
                          batchComposingRef.current = false;
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing &&
                            !batchComposingRef.current &&
                            batchText.trim() &&
                            !busy
                          ) {
                            event.preventDefault();
                            openBatchPreview();
                          }
                        }}
                        placeholder="说出或输入新添食材…"
                        aria-label="自然语言录入食材"
                        disabled={busy}
                      />
                      <VoiceInputButton
                        token={token}
                        disabled={busy}
                        onTranscript={(text) =>
                          handleBatchTextChange(appendTranscript(batchText, text), { openPreview: true, origin: "voice" })
                        }
                        onError={setError}
                      />
                    </div>

                    {batchText.trim() ? (
                      <div className="parse-actions composer-typing-actions">
                        <button
                          type="button"
                          className="btn-soft"
                          onClick={() => handleBatchTextChange("")}
                          disabled={busy}
                        >
                          清空
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={openBatchPreview}
                          disabled={busy}
                        >
                          <Sparkles size={15} aria-hidden="true" />
                          识别食材
                        </button>
                      </div>
                    ) : (
                      <div className="composer-hint-row">
                        <button
                          type="button"
                          className="example-link-btn"
                          onClick={() =>
                            handleBatchTextChange("牛肉、两根胡萝卜、土豆、小葱、番茄快过期", {
                              openPreview: true,
                              origin: "example",
                            })
                          }
                          disabled={busy}
                        >
                          ✨ 试试示例：牛肉、胡萝卜、土豆、番茄快过期
                        </button>
                      </div>
                    )}
                  </>
                )}

                {batchPreviewOpen && batchText.trim() && (
                  <div className="parse-preview-body">
                    <div className="parse-quote">
                      <span>
                        {batchInputOrigin === "voice" ? "🎙" : "📝"} “{batchText.trim()}”
                      </span>
                    </div>
                    <div className="parse-ai-label">
                      <Sparkles size={14} aria-hidden="true" />
                      <span>
                        {batchPreviewItems.length > 0
                          ? `识别到 ${batchPreviewItems.length} 种，确认后加入`
                          : "准备由系统智能解析并归类"}
                      </span>
                    </div>
                    {batchPreviewItems.length > 0 && (
                      <div className="parse-chip-list">
                        {batchPreviewItems.map((item) => {
                          const preg = pregnancyMode ? evaluateIngredientPregnancy(item.name) : null;
                          const flagged = preg && (preg.level === "avoid" || preg.level === "caution");
                          return (
                            <span
                              key={item.name}
                              className={`parse-chip ${flagged ? `preg-border-${preg.level}` : ""}`}
                            >
                              <span aria-hidden="true">{item.emoji}</span>
                              <strong>{item.name}</strong>
                              <small>{item.category}</small>
                              {item.state !== "none" && (
                                <em className={`mini-state ${item.state}`}>{stateShortLabels[item.state]}</em>
                              )}
                              {flagged && <PregnancyBadge level={preg.level} compact />}
                              <button
                                type="button"
                                className="parse-chip-remove"
                                onClick={() => setExcludedPreviewNames((prev) => [...prev, item.name])}
                                aria-label={`移除预览食材${item.name}`}
                              >
                                <X size={12} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {pregnancyMode && batchPreviewItems.length > 0 && (() => {
                      const evaluated = batchPreviewItems.map((item) => ({
                        ...item,
                        preg: evaluateIngredientPregnancy(item.name),
                      }));
                      const flagged = evaluated.filter((item) => item.preg.level === "avoid" || item.preg.level === "caution");
                      const unknowns = evaluated.filter((item) => item.preg.level === "unknown");
                      if (flagged.length > 0) {
                        const sev = flagged.some((item) => item.preg.level === "avoid") ? "avoid" : "caution";
                        return (
                          <div className={`preview-preg-summary preg-${sev}`}>
                            <div className="preview-preg-title">
                              <ShieldAlert size={14} aria-hidden="true" />
                              <span>孕期提醒：以下食材需注意</span>
                            </div>
                            <ul>
                              {flagged.map((item) => (
                                <li key={item.name}>
                                  <strong>{item.name}</strong>（{item.preg.label}）：{item.preg.note}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      }
                      if (unknowns.length > 0) {
                        return (
                          <div className="preview-preg-summary preg-unknown">
                            <span>🤰 加入后系统将自动评估「{unknowns.map((i) => i.name).join("、")}」的孕期适用性</span>
                          </div>
                        );
                      }
                      return (
                        <div className="preview-preg-summary preg-safe">
                          <ShieldCheck size={14} aria-hidden="true" />
                          <span>本次识别的 {batchPreviewItems.length} 种食材均适合孕期食用</span>
                        </div>
                      );
                    })()}
                    <div className="parse-actions">
                      <button
                        type="button"
                        className="btn-soft"
                        onClick={resumeEditingBatchText}
                        disabled={busy}
                      >
                        修改
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => addBatchIngredients()}
                        disabled={busy || (excludedPreviewNames.length > 0 && batchPreviewItems.length === 0)}
                      >
                        {pendingAction === "batch" ? "正在加入..." : "全部加入"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Sticky Category Pill Rail */}
              <div className="ingredient-tools-sticky">
                <CategoryRail
                  categories={app.categories}
                  selectedCategory={selectedCategory}
                  onSelect={setSelectedCategory}
                  total={app.ingredients.length}
                />
              </div>

              {/* Emoji Tile Grid */}
              {visibleIngredients.length === 0 ? (
                <div className="empty-card">
                  <span className="empty-emoji" aria-hidden="true">🧺</span>
                  <strong>没有找到食材</strong>
                  <p>{ingredientQuery ? "换个关键词试试，或手动新增这一样。" : "说说家里买了什么，马上就能匹配菜谱。"}</p>
                  <button className="btn-primary-sm" type="button" onClick={openNewIngredient}>
                    <Plus size={15} />
                    手动添加食材
                  </button>
                </div>
              ) : showGroupedIngredients ? (
                <div className="ingredient-groups">
                  {specialStateIngredients.length > 0 && (
                    <section className="tile-section" aria-labelledby="group-urgent">
                      <div className="section-head">
                        <h2 id="group-urgent">⏰ 尽快用掉 · 特殊状态</h2>
                        <span>点击可改状态</span>
                      </div>
                      <div className="tile-grid">
                        {specialStateIngredients.map((item) => (
                          <IngredientTile
                            key={item.id}
                            ingredient={item}
                            pregnancyMode={pregnancyMode}
                            onEdit={() => openIngredient(item)}
                            disabled={busy}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {INGREDIENT_CATEGORIES.map((categoryName) => {
                    const items = app.ingredients.filter(
                      (item) => item.category === categoryName && item.state === "none",
                    );
                    if (items.length === 0) return null;
                    return (
                      <section className="tile-section" key={categoryName} aria-labelledby={`group-${categoryName}`}>
                        <div className="section-head">
                          <h2 id={`group-${categoryName}`}>
                            {CATEGORY_EMOJI[categoryName]} {categoryName}
                          </h2>
                          <span>{items.length}</span>
                        </div>
                        <div className="tile-grid">
                          {items.map((item) => (
                            <IngredientTile
                              key={item.id}
                              ingredient={item}
                              pregnancyMode={pregnancyMode}
                              onEdit={() => openIngredient(item)}
                              disabled={busy}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <section className="tile-section" aria-label="筛选后的食材">
                  <div className="tile-grid">
                    {visibleIngredients.map((item) => (
                      <IngredientTile
                        key={item.id}
                        ingredient={item}
                        pregnancyMode={pregnancyMode}
                        onEdit={() => openIngredient(item)}
                        disabled={busy}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ===================== 07. RECIPE LIBRARY ===================== */}
          {activeTab === "recipes" && (
            <div className="page-stack">
              <header className="page-header">
                <div>
                  <h1 className="header-title">菜谱</h1>
                  <p className="header-sub">
                    共 {allRecipes.length} 道 · {app.matches.ready.length} 道现在能做
                  </p>
                </div>
              </header>

              <label className="search-bar">
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  value={recipeQuery}
                  onChange={(event) => setRecipeQuery(event.target.value)}
                  placeholder="搜菜名或食材，如「番茄」「虾仁」"
                  aria-label="搜索菜谱或食材"
                />
                {recipeQuery && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setRecipeQuery("")}
                    aria-label="清空菜谱搜索"
                  >
                    <X size={15} />
                  </button>
                )}
              </label>

              {/* Horizontal Filter Chips */}
              <div className="filter-chips-rail" role="group" aria-label="菜谱筛选条件">
                <button
                  type="button"
                  className={`filter-chip ${recipeReadyOnly ? "active" : ""}`}
                  aria-pressed={recipeReadyOnly}
                  onClick={() => setRecipeReadyOnly((prev) => !prev)}
                >
                  ✓ 现在能做
                </button>
                <button
                  type="button"
                  className={`filter-chip ${recipeTime === "15" ? "active" : ""}`}
                  aria-pressed={recipeTime === "15"}
                  onClick={() => setRecipeTime((prev) => (prev === "15" ? "" : "15"))}
                >
                  ⏱ 15 分钟内
                </button>
                <button
                  type="button"
                  className={`filter-chip ${recipeTime === "30" ? "active" : ""}`}
                  aria-pressed={recipeTime === "30"}
                  onClick={() => setRecipeTime((prev) => (prev === "30" ? "" : "30"))}
                >
                  ⏱ 30 分钟内
                </button>
                {recipeMethods.map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={`filter-chip ${recipeMethod === method ? "active" : ""}`}
                    aria-pressed={recipeMethod === method}
                    onClick={() => setRecipeMethod((prev) => (prev === method ? "" : method))}
                  >
                    {method}
                  </button>
                ))}
                {hasLibraryFilters && (
                  <button type="button" className="filter-chip clear" onClick={clearLibraryFilters}>
                    清除筛选
                  </button>
                )}
              </div>

              {/* Drafts Banner */}
              {draftCount > 0 && (
                <button
                  type="button"
                  className="drafts-banner-card"
                  onClick={() => {
                    setError("");
                    setCreateNotice("");
                    setCreateSheetOpen(true);
                  }}
                >
                  <span aria-hidden="true">📝</span>
                  <span>
                    <strong>{draftCount} 份草稿</strong>等你确认入库
                  </span>
                  <ChevronRight size={17} className="banner-chev" aria-hidden="true" />
                </button>
              )}

              {/* 2-Column Recipe Card Grid */}
              {libraryRecipes.length === 0 ? (
                <div className="empty-card">
                  <span className="empty-emoji" aria-hidden="true">📖</span>
                  <strong>没有符合条件的菜谱</strong>
                  <p>放宽筛选条件，或点击底部「＋」导入一道新菜。</p>
                  {hasLibraryFilters && (
                    <button className="btn-soft" type="button" onClick={clearLibraryFilters}>
                      清除筛选
                    </button>
                  )}
                </div>
              ) : (
                <div className="recipe-grid-2col">
                  {libraryRecipes.map((recipe) => {
                    const visual = getRecipeVisual(recipe);
                    const isReady = recipe.missing.length === 0;
                    const dietaryAlerts = evaluateRecipeDietaryAlerts(recipe, settings);
                    return (
                      <article
                        key={recipe.id}
                        className="recipe-grid-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedRecipe(recipe)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedRecipe(recipe);
                          }
                        }}
                      >
                        <div className={`grid-card-cover tone-${visual.tone}`}>
                          <span className={`tag-pill ${isReady ? "tag-green" : "tag-orange"}`}>
                            {isReady ? "能做" : `缺 ${recipe.missing.length} 样`}
                          </span>
                          {pregnancyMode && recipe.pregnancyWarning?.level === "avoid" && (
                            <span className="cover-preg-dot" title={recipe.pregnancyWarning.summary} aria-label="孕期避免提醒">
                              🤰
                            </span>
                          )}
                          {recipe.usesPriority && (
                            <span className="cover-priority-dot" title="会用到优先处理食材" aria-label="用到优先食材">
                              <Flame size={12} />
                            </span>
                          )}
                          <span className="grid-card-emoji" aria-hidden="true">
                            {visual.emoji}
                          </span>
                        </div>
                        <div className="grid-card-body">
                          <h3 className="grid-card-title">{recipe.title}</h3>
                          <div className="grid-card-meta">
                            <span>⏱ {recipe.minutes} 分钟</span>
                            <span>· {recipe.method}</span>
                            {dietaryAlerts.length > 0 && (
                              <span className="meta-warn">· {dietaryAlerts[0]}</span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===================== 05 (TAB). FAMILY SPACE ===================== */}
          {activeTab === "family" && (
            <FamilySpaceTab
              app={app}
              kitchenName={kitchenName}
              totalRecipes={allRecipes.length}
              syncState={syncState}
              busy={busy}
              onRefresh={refresh}
              onUpdateSettings={updateFamilySettings}
              onSignOut={signOutFamily}
            />
          )}
        </main>

        {/* ===================== 5-SLOT BOTTOM NAV ===================== */}
        <nav className="bottom-nav" aria-label="主导航">
          <button
            type="button"
            className={`nav-tab ${activeTab === "today" ? "active" : ""}`}
            aria-label="今天"
            aria-current={activeTab === "today" ? "page" : undefined}
            onClick={() => setActiveTab("today")}
          >
            <Home size={22} strokeWidth={activeTab === "today" ? 2.3 : 1.9} />
            <span>今天</span>
          </button>

          <button
            type="button"
            className={`nav-tab ${activeTab === "ingredients" ? "active" : ""}`}
            aria-label="食材"
            aria-current={activeTab === "ingredients" ? "page" : undefined}
            onClick={() => setActiveTab("ingredients")}
          >
            <ShoppingBasket size={22} strokeWidth={activeTab === "ingredients" ? 2.3 : 1.9} />
            <span>食材</span>
          </button>

          <button
            type="button"
            className="nav-fab"
            aria-label="添加菜谱"
            onClick={() => {
              setError("");
              setCreateNotice("");
              setCreateSheetOpen(true);
            }}
          >
            <Plus size={26} strokeWidth={2.6} />
            {draftCount > 0 && <span className="fab-badge">{draftCount}</span>}
          </button>

          <button
            type="button"
            className={`nav-tab ${activeTab === "recipes" ? "active" : ""}`}
            aria-label="菜谱"
            aria-current={activeTab === "recipes" ? "page" : undefined}
            onClick={() => setActiveTab("recipes")}
          >
            <BookOpen size={22} strokeWidth={activeTab === "recipes" ? 2.3 : 1.9} />
            <span>菜谱</span>
          </button>

          <button
            type="button"
            className={`nav-tab ${activeTab === "family" ? "active" : ""}`}
            aria-label="家庭"
            aria-current={activeTab === "family" ? "page" : undefined}
            onClick={() => setActiveTab("family")}
          >
            <Users size={22} strokeWidth={activeTab === "family" ? 2.3 : 1.9} />
            <span>家庭</span>
          </button>
        </nav>

        {/* ===================== SHEETS & MODALS ===================== */}

        {/* Random Pick Dialog */}
        {randomPick && (
          <RandomPickSheet
            recipe={randomPick}
            urgentNameSet={urgentNameSet}
            pregnancyMode={pregnancyMode}
            canReroll={(app.matches.ready.length > 0 ? app.matches.ready.length : app.matches.missing.length) > 1}
            onReroll={() => pickRandomRecipe(randomPick.id)}
            onViewDetail={() => {
              const target = randomPick;
              setRandomPick(null);
              setSelectedRecipe(target);
            }}
            onStartCooking={() => {
              const target = randomPick;
              setRandomPick(null);
              setCookingRecipe(target);
              setCompletionNotice(null);
            }}
            onClose={() => setRandomPick(null)}
          />
        )}

        {/* Meal Planner & Shopping Plan Sheet */}
        {mealPlannerMode && (
          <MealPlannerSheet
            initialMode={mealPlannerMode}
            app={app}
            busy={busy}
            onSuggest={suggestMealPlan}
            onCookMeal={startCookingSuggestedMeal}
            onSaveMealToLibrary={saveSuggestedMealToLibrary}
            onApplyShoppingPlan={async (nextPlan) => {
              await saveShoppingPlan(nextPlan);
              setCompletionNotice({ message: "买菜清单已同步到首页", undoId: null });
            }}
            onClose={() => {
              setMealPlannerMode(null);
              setError("");
            }}
          />
        )}

        {/* 04. Create / Import / Drafts Sheet */}
        {createSheetOpen && (
          <CreateRecipeSheet
            app={app}
            token={token}
            draftSource={draftSource}
            setDraftSource={setDraftSource}
            draftText={draftText}
            setDraftText={setDraftText}
            draftImageDataUrl={draftImageDataUrl}
            draftSourceReady={draftSourceReady}
            busy={busy}
            analyzing={pendingAction === "draft-analyze"}
            error={error}
            setError={setError}
            notice={createNotice}
            setNotice={setCreateNotice}
            onSelectImage={selectDraftImage}
            onAnalyze={analyzeDraft}
            onOpenManualRecipe={() => {
              setError("");
              setCreatingManualRecipe(true);
            }}
            onOpenDraft={(draft) => {
              setError("");
              setDraftEditor(draft);
            }}
            onDeleteDraft={removeDraft}
            onClose={() => {
              setCreateSheetOpen(false);
              setCreateNotice("");
              setError("");
            }}
          />
        )}

        {/* 03. Recipe Detail Sheet */}
        {selectedRecipe && (
          <RecipeDetailSheet
            recipe={selectedRecipe}
            availableNames={availableNames}
            pantrySet={pantrySet}
            pregnancyMode={pregnancyMode}
            settings={settings}
            busy={busy}
            deleting={pendingAction === "recipe-delete"}
            error={error}
            onAddMissingToShopping={() => addMissingToShoppingList(selectedRecipe)}
            onEdit={() => {
              setRecipeEditor(selectedRecipe);
              setSelectedRecipe(null);
              setError("");
            }}
            onDelete={removeFormalRecipe}
            onClose={() => {
              setSelectedRecipe(null);
              setError("");
            }}
            onStartCooking={() => {
              setCookingRecipe(selectedRecipe);
              setSelectedRecipe(null);
              setCompletionNotice(null);
              setError("");
            }}
          />
        )}

        {/* 05 & 06. Cooking Mode + Done Screen */}
        {cookingRecipe && (
          <CookingMode
            recipe={cookingRecipe}
            busy={pendingAction === "cooking-complete"}
            error={error}
            onComplete={(consumptions, opts) => completeCooking(cookingRecipe, consumptions, opts)}
            onClose={() => {
              setCookingRecipe(null);
              setError("");
            }}
          />
        )}

        {/* Ingredient Editor Sheet */}
        {ingredientEditor && (
          <IngredientEditorSheet
            key={ingredientEditor.id ?? "new"}
            ingredient={ingredientEditor}
            pregnancyMode={pregnancyMode}
            busy={busy}
            deleting={pendingAction === "ingredient-delete"}
            error={error}
            onSave={saveIngredient}
            onDelete={removeIngredient}
            onClose={() => {
              setIngredientEditor(null);
              setError("");
            }}
          />
        )}

        {/* Manual New Recipe Sheet */}
        {creatingManualRecipe && (
          <RecipeEditorSheet
            key="new-manual-recipe"
            recipe={null}
            busy={busy}
            error={error}
            onSave={(payload) => createManualRecipe(payload)}
            onClose={() => {
              setCreatingManualRecipe(false);
              setError("");
            }}
          />
        )}

        {/* Draft Editor Sheet */}
        {draftEditor && (
          <RecipeEditorSheet
            key={draftEditor.id}
            recipe={draftEditor}
            busy={busy}
            error={error}
            onSave={saveDraft}
            onClose={() => {
              setDraftEditor(null);
              setError("");
            }}
          />
        )}

        {/* Formal Recipe Editor Sheet */}
        {recipeEditor && (
          <RecipeEditorSheet
            key={recipeEditor.id}
            recipe={recipeEditor}
            busy={busy}
            error={error}
            onSave={saveFormalRecipe}
            onClose={() => {
              setRecipeEditor(null);
              setError("");
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   HELPER GREETINGS
   ============================================================ */

function getWeekdayGreeting() {
  const now = new Date();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const day = weekdays[now.getDay()];
  const hour = now.getHours();
  if (hour < 11) return `${day}早上好`;
  if (hour < 14) return `${day}中午好`;
  if (hour < 18) return `${day}下午好`;
  return `${day}晚上好`;
}

function getMealQuestion() {
  const hour = new Date().getHours();
  if (hour < 10) return "早餐吃什么？";
  if (hour < 14) return "午饭吃什么？";
  if (hour < 21) return "今晚吃什么？";
  return "夜宵吃点什么？";
}

/* ============================================================
   SUBCOMPONENTS: TODAY LIST & RANDOM PICK
   ============================================================ */

function TodayRecipeList({ recipes, urgentNameSet, pregnancyMode, settings, busy, onOpen, onAddMissingToShopping, emptyMessage, onQuickAction }) {
  if (recipes.length === 0) {
    return (
      <div className="empty-card">
        <span className="empty-emoji" aria-hidden="true">🥘</span>
        <strong>暂时没有匹配的菜谱</strong>
        <p>{emptyMessage}</p>
        <button className="btn-primary-sm" type="button" onClick={onQuickAction}>
          <Sparkles size={14} />
          帮我想吃什么 / 规划买菜
        </button>
      </div>
    );
  }

  return (
    <div className="recipe-row-list">
      {recipes.map((recipe) => {
        const visual = getRecipeVisual(recipe);
        const isReady = recipe.missing.length === 0;
        const matchedUrgent = recipe.ingredients.find((item) => item.required && urgentNameSet.has(item.name));
        const pregWarn = pregnancyMode && recipe.pregnancyWarning?.level && recipe.pregnancyWarning.level !== "safe"
          ? recipe.pregnancyWarning
          : null;
        const dietaryAlerts = evaluateRecipeDietaryAlerts(recipe, settings);

        return (
          <article
            key={recipe.id}
            className="recipe-row-card"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(recipe)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(recipe);
              }
            }}
          >
            <div className={`rc-cover tone-${visual.tone}`} aria-hidden="true">
              {visual.emoji}
            </div>
            <div className="rc-body">
              <div className="rc-title-line">
                <h3>{recipe.title}</h3>
              </div>
              <div className="rc-meta">
                <span>⏱ {recipe.minutes} 分钟</span>
                <span>
                  {getMethodEmoji(recipe.method)} {recipe.method}
                </span>
              </div>
              <div className="rc-tags">
                {matchedUrgent && <span className="tag-pill tag-orange">用掉{matchedUrgent.name}</span>}
                {!matchedUrgent && recipe.usesPriority && <span className="tag-pill tag-orange">用掉优先食材</span>}
                {isReady ? (
                  <span className="tag-pill tag-green">✓ 齐全</span>
                ) : (
                  <span className="tag-pill tag-orange">缺：{recipe.missing.slice(0, 2).join("、")}{recipe.missing.length > 2 ? "…" : ""}</span>
                )}
                {dietaryAlerts.slice(0, 2).map((alertText) => (
                  <span key={alertText} className="tag-pill tag-red">{alertText}</span>
                ))}
                {pregWarn && (
                  <span className={`tag-pill ${pregWarn.level === "avoid" ? "tag-red" : "tag-amber"}`}>
                    🤰 {pregWarn.level === "avoid" ? "孕期避免" : "孕期注意"}
                  </span>
                )}
              </div>
              {!isReady && recipe.substitutions.length > 0 && (
                <p className="rc-sub">💡 {recipe.substitutions[0]}</p>
              )}
              {!isReady && onAddMissingToShopping && (
                <button
                  type="button"
                  className="rc-add-shop-btn"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddMissingToShopping(recipe);
                  }}
                >
                  <ShoppingCart size={12} aria-hidden="true" />
                  <span>缺料加入买菜清单</span>
                </button>
              )}
            </div>
            <ChevronRight size={18} className="rc-chev" aria-hidden="true" />
          </article>
        );
      })}
    </div>
  );
}

function RandomPickSheet({ recipe, urgentNameSet, pregnancyMode, canReroll, onReroll, onViewDetail, onStartCooking, onClose }) {
  const visual = getRecipeVisual(recipe);
  const isReady = recipe.missing.length === 0;
  const matchedUrgent = recipe.ingredients.find((item) => item.required && urgentNameSet.has(item.name));
  const pregWarn = pregnancyMode && recipe.pregnancyWarning?.level && recipe.pregnancyWarning.level !== "safe"
    ? recipe.pregnancyWarning
    : null;

  useBodyLockAndEscape(false, onClose);

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="bottom-sheet pick-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="random-pick-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <button className="sheet-close-float" type="button" onClick={onClose} aria-label="关闭推荐">
          <X size={18} />
        </button>

        <div className="pick-body">
          <span className="pick-eyebrow">🎲 自家菜谱随便挑一道</span>
          <div className={`pick-emoji-circle tone-${visual.tone}`} aria-hidden="true">
            {visual.emoji}
          </div>
          <h2 id="random-pick-title">{recipe.title}</h2>
          <div className="pick-meta-row">
            <span className="pill-chip">⏱ {recipe.minutes} 分钟</span>
            <span className="pill-chip">
              {getMethodEmoji(recipe.method)} {recipe.method}
            </span>
            {isReady ? (
              <span className="tag-pill tag-green">✓ 食材齐全</span>
            ) : (
              <span className="tag-pill tag-orange">缺 {recipe.missing.length} 样</span>
            )}
            {pregWarn && (
              <span className={`tag-pill ${pregWarn.level === "avoid" ? "tag-red" : "tag-amber"}`}>
                🤰 {pregWarn.level === "avoid" ? "孕期避免" : "孕期注意"}
              </span>
            )}
          </div>
          {matchedUrgent && (
            <p className="pick-bonus">顺手就能用掉家里快要处理的「{matchedUrgent.name}」</p>
          )}
          <div className="pick-actions">
            {canReroll && (
              <button type="button" className="btn-soft" onClick={onReroll}>
                <Dice5 size={17} />
                换一道
              </button>
            )}
            <button type="button" className="btn-soft" onClick={onViewDetail}>
              看食材
            </button>
            <button type="button" className="btn-primary" onClick={onStartCooking}>
              开始做菜
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   SUBCOMPONENTS: INGREDIENTS RAIL & TILE
   ============================================================ */

function CategoryRail({ categories, selectedCategory, onSelect, total }) {
  const counts = useMemo(() => {
    const entries = new Map(categories.map((category) => [category.name, category.items.length]));
    entries.set("全部", total);
    return entries;
  }, [categories, total]);

  const ordered = ["全部", ...INGREDIENT_CATEGORIES];

  return (
    <div className="cat-rail" role="tablist" aria-label="食材分类">
      {ordered
        .filter((name) => counts.has(name))
        .map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={selectedCategory === name}
            className={`cat-pill ${selectedCategory === name ? "active" : ""}`}
            onClick={() => onSelect(name)}
          >
            {name !== "全部" && <span aria-hidden="true">{CATEGORY_EMOJI[name]}</span>}
            <span>{name}</span>
            <small>{counts.get(name)}</small>
          </button>
        ))}
    </div>
  );
}

function IngredientTile({ ingredient, pregnancyMode, onEdit, disabled }) {
  const isUrgent = ingredient.state === "expiring" || ingredient.state === "priority";
  const isFrozen = ingredient.state === "frozen";
  const label = stateShortLabels[ingredient.state] || "";
  const pregLevel = pregnancyMode ? ingredient.pregnancyLevel : "";
  const showPregWarn = pregLevel === "avoid" || pregLevel === "caution";

  return (
    <button
      type="button"
      className={`ing-tile ${isUrgent ? "is-warn" : ""} ${isFrozen ? "is-frozen" : ""} ${pregLevel === "avoid" ? "is-preg-avoid" : ""}`}
      onClick={onEdit}
      disabled={disabled}
      aria-label={`编辑${ingredient.name}`}
    >
      {ingredient.state !== "none" && (
        <span className={`tile-dot dot-${ingredient.state}`} aria-hidden="true" />
      )}
      <span className="tile-emoji" aria-hidden="true">
        {getIngredientEmoji(ingredient.name, ingredient.category)}
      </span>
      <span className="tile-name">{ingredient.name}</span>
      {label && <span className={`tile-state state-${ingredient.state}`}>{label}</span>}
      {showPregWarn && (
        <span className={`tile-preg-tag preg-${pregLevel}`}>
          {pregLevel === "avoid" ? "孕期避免" : "孕期慎吃"}
        </span>
      )}
    </button>
  );
}

/* ============================================================
   03. RECIPE DETAIL SHEET
   ============================================================ */

function RecipeDetailSheet({
  recipe,
  availableNames,
  pantrySet,
  pregnancyMode,
  settings,
  busy,
  deleting,
  error,
  onAddMissingToShopping,
  onEdit,
  onDelete,
  onClose,
  onStartCooking,
}) {
  const visual = getRecipeVisual(recipe);
  const dietaryAlerts = evaluateRecipeDietaryAlerts(recipe, settings);
  const required = recipe.ingredients.filter((item) => item.required);
  const optional = recipe.ingredients.filter((item) => !item.required);
  const nonPantryRequired = required.filter((item) => !pantrySet.has(item.name));
  const pantryUsed = recipe.ingredients.filter((item) => pantrySet.has(item.name));
  const haveCount = nonPantryRequired.filter((item) => availableNames.has(item.name)).length;
  const isReady = recipe.missing.length === 0;
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Match substitutions to specific missing ingredient names when possible
  const subByIngredient = useMemo(() => {
    const map = new Map();
    const unmatched = [];
    for (const sub of recipe.substitutions || []) {
      const matchedName = recipe.missing.find((name) => sub.includes(name));
      if (matchedName && !map.has(matchedName)) {
        map.set(matchedName, sub);
      } else {
        unmatched.push(sub);
      }
    }
    return { map, unmatched };
  }, [recipe.missing, recipe.substitutions]);

  useBodyLockAndEscape(busy, onClose);

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <section
        className="bottom-sheet detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-scroll">
          <div className={`detail-hero tone-${visual.tone}`}>
            <div className="sheet-grab hero-grab" aria-hidden="true" />
            <span className="detail-hero-emoji" aria-hidden="true">
              {visual.emoji}
            </span>
            <button
              className="sheet-close-float"
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="关闭菜谱详情"
            >
              <X size={18} />
            </button>
          </div>

          <div className="detail-body">
            <h2 id="recipe-sheet-title" className="detail-title">
              {recipe.title}
            </h2>

            <div className="detail-meta-row">
              <span className="pill-chip">⏱ {recipe.minutes} 分钟</span>
              <span className="pill-chip">
                {getMethodEmoji(recipe.method)} {recipe.method}
              </span>
              {dietaryAlerts.map((warn) => (
                <span key={warn} className="tag-pill tag-red">⚠️ {warn}</span>
              ))}
            </div>

            {isReady ? (
              <div className="readiness-banner ready">
                <span className="check-circle ok" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
                <span>
                  家里食材齐全，现在就能做
                  {recipe.usesPriority ? " · 顺手用掉优先食材" : ""}
                </span>
              </div>
            ) : (
              <div className="readiness-banner missing with-action">
                <div className="readiness-banner-left">
                  <span className="check-circle miss" aria-hidden="true">
                    {recipe.missing.length}
                  </span>
                  <span>
                    差 {recipe.missing.length} 样：{recipe.missing.join("、")}
                  </span>
                </div>
                {onAddMissingToShopping && (
                  <button
                    type="button"
                    className="btn-soft-xs"
                    onClick={onAddMissingToShopping}
                    disabled={busy}
                  >
                    + 买菜清单
                  </button>
                )}
              </div>
            )}

            {pregnancyMode && recipe.pregnancyWarning && recipe.pregnancyWarning.level !== "safe" && (
              <div className={`detail-preg-box preg-${recipe.pregnancyWarning.level}`}>
                <div className="detail-preg-head">
                  <ShieldAlert size={15} aria-hidden="true" />
                  <strong>🤰 {recipe.pregnancyWarning.summary || "孕期食用提示"}</strong>
                </div>
                <ul className="detail-preg-list">
                  {(recipe.pregnancyWarning.items || []).map((item) => (
                    <li key={item.name}>
                      <strong>{item.name}</strong>：{item.note}
                    </li>
                  ))}
                </ul>
                <span className="preg-disclaimer">{PREGNANCY_DISCLAIMER}</span>
              </div>
            )}

            {/* Ingredients Section */}
            <div className="section-head">
              <h3>食材</h3>
              <span>
                家里有 {haveCount} / {nonPantryRequired.length}
              </span>
            </div>

            <div className="detail-card-list">
              {nonPantryRequired.map((item) => {
                const hasIt = availableNames.has(item.name);
                const inlineSub = !hasIt ? subByIngredient.map.get(item.name) : null;
                return (
                  <div key={`req-${item.name}`} className="detail-ing-group">
                    <div className="detail-ing-row">
                      <span className={`check-circle ${hasIt ? "ok" : "miss"}`} aria-hidden="true">
                        {hasIt ? <Check size={11} strokeWidth={3} /> : "!"}
                      </span>
                      <span className="ing-emoji-sm" aria-hidden="true">
                        {getIngredientEmoji(item.name)}
                      </span>
                      <span className="ing-row-name">{item.name}</span>
                      {!hasIt && <span className="tag-pill tag-orange">缺</span>}
                      {item.quantityLabel && <span className="ing-row-qty">{item.quantityLabel}</span>}
                    </div>
                    {inlineSub && <div className="inline-sub-hint">💡 {inlineSub}</div>}
                  </div>
                );
              })}

              {optional
                .filter((item) => !pantrySet.has(item.name))
                .map((item) => {
                  const hasIt = availableNames.has(item.name);
                  return (
                    <div key={`opt-${item.name}`} className="detail-ing-row optional">
                      <span className={`check-circle ${hasIt ? "muted-ok" : "muted-opt"}`} aria-hidden="true">
                        {hasIt ? <Check size={11} strokeWidth={3} /> : "·"}
                      </span>
                      <span className="ing-emoji-sm" aria-hidden="true">
                        {getIngredientEmoji(item.name)}
                      </span>
                      <span className="ing-row-name">
                        {item.name} <small className="opt-badge">可选</small>
                      </span>
                      {item.quantityLabel && <span className="ing-row-qty">{item.quantityLabel}</span>}
                    </div>
                  );
                })}

              {pantryUsed.length > 0 && (
                <div className="detail-ing-row pantry">
                  <span className="check-circle muted-ok" aria-hidden="true">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span className="ing-row-name muted">
                    {pantryUsed.map((item) => item.name).join(" · ")}
                  </span>
                  <span className="ing-row-qty">常备调味</span>
                </div>
              )}
            </div>

            {subByIngredient.unmatched.length > 0 && (
              <div className="extra-subs">
                {subByIngredient.unmatched.map((sub) => (
                  <p key={sub}>💡 {sub}</p>
                ))}
              </div>
            )}

            {/* Steps Section */}
            <div className="section-head">
              <h3>烹饪步骤</h3>
              <span>共 {recipe.steps.length} 步</span>
            </div>

            <ol className="detail-steps-card">
              {recipe.steps.map((step, index) => (
                <li key={step.position} className="detail-step-item">
                  <span className="detail-step-num">{index + 1}</span>
                  <span className="detail-step-text">{step.text}</span>
                </li>
              ))}
            </ol>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Bottom Thumb Action Bar */}
        <div className="detail-sticky-bar">
          {confirmDelete ? (
            <div className="inline-delete-confirm">
              <span>删除「{recipe.title}」？</span>
              <div className="inline-delete-btns">
                <button type="button" className="btn-soft-sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  取消
                </button>
                <button type="button" className="btn-danger-sm" onClick={() => onDelete(recipe.id)} disabled={busy}>
                  {deleting ? "删除中..." : "确认删除"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                className="sticky-icon-btn"
                type="button"
                onClick={onEdit}
                disabled={busy}
                aria-label="编辑菜谱"
                title="编辑菜谱"
              >
                <Pencil size={19} />
              </button>
              <button
                className="sticky-icon-btn danger"
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                aria-label="删除菜谱"
                title="删除菜谱"
              >
                <Trash2 size={19} />
              </button>
              <button className="sticky-cta-btn" type="button" onClick={onStartCooking} disabled={busy}>
                <span>开始做菜</span>
                <ArrowRight size={19} />
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   04. CREATE / IMPORT / DRAFTS SHEET (CENTER FAB)
   ============================================================ */

function CreateRecipeSheet({
  app,
  token,
  draftSource,
  setDraftSource,
  draftText,
  setDraftText,
  draftImageDataUrl,
  draftSourceReady,
  busy,
  analyzing,
  error,
  setError,
  notice,
  setNotice,
  onSelectImage,
  onAnalyze,
  onOpenManualRecipe,
  onOpenDraft,
  onDeleteDraft,
  onClose,
}) {
  const [importMode, setImportMode] = useState(null); // null = menu | "image" | "text" | "web"
  const [deletingDraftId, setDeletingDraftId] = useState(null);

  useBodyLockAndEscape(busy, onClose);

  function enterImport(mode) {
    setError("");
    setNotice("");
    setImportMode(mode);
    setDraftSource(mode);
  }

  async function submitImport() {
    const ok = await onAnalyze();
    if (ok) {
      setImportMode(null);
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <section
        className="bottom-sheet create-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grab" aria-hidden="true" />

        {!importMode ? (
          <div className="sheet-inner">
            <header className="sheet-top-row">
              <div>
                <h2 id="create-sheet-title">添加菜谱</h2>
                <p className="sheet-subtitle">手动写自家拿手菜，或从文字、语音、图片与网页导入</p>
              </div>
              <button className="sheet-close-btn" type="button" onClick={onClose} disabled={busy} aria-label="关闭添加菜谱">
                <X size={18} />
              </button>
            </header>

            {notice && (
              <div className="inline-success-banner" role="status">
                <Check size={15} />
                <span>{notice}</span>
              </div>
            )}

            {/* 4 Distinct Recipe Entry Sources */}
            <div className="import-source-grid">
              <button type="button" className="import-source-tile primary-tile" onClick={onOpenManualRecipe} disabled={busy}>
                <span className="source-emoji" aria-hidden="true">✏️</span>
                <span>手动写菜谱</span>
              </button>
              <button type="button" className="import-source-tile" onClick={() => enterImport("text")} disabled={busy}>
                <span className="source-emoji" aria-hidden="true">📝</span>
                <span>文字 / 语音</span>
              </button>
              <button type="button" className="import-source-tile" onClick={() => enterImport("image")} disabled={busy}>
                <span className="source-emoji" aria-hidden="true">📷</span>
                <span>拍照识别</span>
              </button>
              <button type="button" className="import-source-tile" onClick={() => enterImport("web")} disabled={busy}>
                <span className="source-emoji" aria-hidden="true">🔗</span>
                <span>网页链接</span>
              </button>
            </div>

            {/* Pending Drafts */}
            <div className="section-head" style={{ marginTop: 18 }}>
              <h3>待确认草稿 {app.drafts.length > 0 ? `(${app.drafts.length})` : ""}</h3>
              <span>确认后进入菜谱库</span>
            </div>

            {app.drafts.length === 0 ? (
              <div className="drafts-empty-hint">
                <Bell size={15} aria-hidden="true" />
                <span>通过文字、拍照或网页导入的草稿会保存在这里等你核对。</span>
              </div>
            ) : (
              <div className="draft-compact-list">
                {app.drafts.map((draft) => {
                  const visual = getRecipeVisual(draft);
                  return (
                    <div key={draft.id} className="draft-compact-row">
                      <div className={`draft-cover tone-${visual.tone}`} aria-hidden="true">
                        {visual.emoji}
                      </div>
                      <div className="draft-compact-info">
                        <strong>{draft.title}</strong>
                        <span>
                          {draftSourceLabels[draft.sourceType] || "草稿"} · {draft.method} · {draft.minutes} 分钟
                        </span>
                      </div>
                      {deletingDraftId === draft.id ? (
                        <div className="delete-confirm-box">
                          <p>确认删除草稿「{draft.title}」？删除后无法恢复。</p>
                          <div className="delete-confirm-actions">
                            <button className="btn-soft flex1" type="button" onClick={() => setDeletingDraftId(null)} disabled={busy}>
                              取消
                            </button>
                            <button
                              className="btn-danger flex1"
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (await onDeleteDraft(draft.id)) setDeletingDraftId(null);
                              }}
                            >
                              {busy ? "删除中..." : "确认删除"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="draft-compact-actions">
                          <button className="btn-soft-sm" type="button" onClick={() => onOpenDraft(draft)} disabled={busy}>
                            编辑
                          </button>
                          <button
                            className="btn-danger-sm"
                            type="button"
                            onClick={() => {
                              setError("");
                              setDeletingDraftId(draft.id);
                            }}
                            disabled={busy}
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="sheet-inner">
            <header className="sheet-top-row">
              <div className="sheet-back-title">
                <button
                  type="button"
                  className="sheet-close-btn"
                  onClick={() => {
                    setError("");
                    setImportMode(null);
                  }}
                  disabled={busy}
                  aria-label="返回添加菜谱"
                >
                  <ArrowLeft size={18} />
                </button>
                <h2 id="create-sheet-title">
                  {importMode === "image"
                    ? "拍照识别菜谱"
                    : importMode === "web"
                      ? "网页链接导入"
                      : "文字 / 语音导入"}
                </h2>
              </div>
              <button className="sheet-close-btn" type="button" onClick={onClose} disabled={busy} aria-label="关闭添加菜谱">
                <X size={18} />
              </button>
            </header>

            <div className="import-form-stack">
              {importMode === "image" ? (
                <>
                  {app.ai.configured && !app.ai.visionModel && (
                    <p className="subtle-info-note">
                      当前使用纯文本模型（{app.ai.textModel}），建议优先用「文字 / 语音」或「网页链接」导入。
                    </p>
                  )}
                  <label className="image-dropzone">
                    <Image size={22} />
                    <span>{draftImageDataUrl ? "更换菜谱图片" : "拍照或从相册选择菜谱图片"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => onSelectImage(event.target.files?.[0])}
                    />
                  </label>
                  {draftImageDataUrl && <img className="image-preview-thumb" src={draftImageDataUrl} alt="菜谱图片预览" />}
                  <textarea
                    className="styled-textarea"
                    rows={2}
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    placeholder="可选：补充菜名或注意事项"
                  />
                </>
              ) : importMode === "web" ? (
                <textarea
                  className="styled-textarea"
                  rows={3}
                  value={draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                  placeholder="粘贴公开菜谱网页链接（https://...）"
                  autoFocus
                />
              ) : (
                <div className="voice-import-box">
                  <textarea
                    className="styled-textarea"
                    rows={5}
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    placeholder="粘贴小红书、下厨房或家人发来的菜谱文字，也可以点下方麦克风直接口述"
                    autoFocus
                  />
                  <div className="voice-import-bar">
                    <span className="muted-sm">支持语音转文字，随时补充修改</span>
                    <VoiceInputButton
                      token={token}
                      disabled={busy}
                      onTranscript={(text) => setDraftText((current) => appendTranscript(current, text))}
                      onError={setError}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}

              <button
                type="button"
                className="btn-primary full"
                onClick={submitImport}
                disabled={busy || !draftSourceReady}
              >
                <Sparkles size={17} />
                {analyzing ? "正在解析菜谱..." : "解析为草稿"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================================================
   05 & 06. COOKING MODE (DARK STEP-BY-STEP + TIMER + DONE)
   ============================================================ */

function CookingMode({ recipe, busy, error, onComplete, onClose }) {
  const required = useMemo(() => recipe.ingredients.filter((item) => item.required), [recipe.ingredients]);
  const storageKey = `happy-eat-cooking-${recipe.id}`;

  const [progress, setProgress] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (saved && typeof saved === "object") {
        return {
          currentStep: Math.min(Math.max(0, Number(saved.currentStep) || 0), Math.max(0, recipe.steps.length - 1)),
          ingredients: Array.isArray(saved.ingredients) ? saved.ingredients : [],
          steps: Array.isArray(saved.steps) ? saved.steps : [],
        };
      }
    } catch {
      // ignore storage errors
    }
    return { currentStep: 0, ingredients: [], steps: [] };
  });

  const [overviewOpen, setOverviewOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saveTempRecipe, setSaveTempRecipe] = useState(Boolean(recipe.isTemporary));
  const [consumptions, setConsumptions] = useState(() =>
    Object.fromEntries(required.map((item) => [item.name, "kept"])),
  );
  const [wakeLocked, setWakeLocked] = useState(false);

  // Built-in Step Timer
  const activeStep = recipe.steps[progress.currentStep] || { position: 1, text: "按照菜谱完成烹饪" };
  const detectedTimer = useMemo(() => extractStepTimer(activeStep.text), [activeStep.text]);
  const [timerDuration, setTimerDuration] = useState(detectedTimer?.seconds || 0);
  const [timerRemaining, setTimerRemaining] = useState(detectedTimer?.seconds || 0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);

  // Touch swipe tracking
  const touchStartRef = useRef(null);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(progress));
  }, [progress, storageKey]);

  // Reset timer when step changes
  useEffect(() => {
    const nextSec = detectedTimer?.seconds || 0;
    setTimerDuration(nextSec);
    setTimerRemaining(nextSec);
    setTimerRunning(false);
    setTimerDone(false);
  }, [progress.currentStep, detectedTimer?.seconds]);

  // Timer tick
  useEffect(() => {
    if (!timerRunning) return undefined;
    const interval = setInterval(() => {
      setTimerRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerRunning(false);
          setTimerDone(true);
          playGentleChime();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  // Screen Wake Lock API
  useEffect(() => {
    if (confirming || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      setWakeLocked(false);
      return undefined;
    }
    let sentinel = null;
    let active = true;

    async function requestLock() {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (active) setWakeLocked(true);
        sentinel.addEventListener("release", () => {
          if (active) setWakeLocked(false);
        });
      } catch {
        if (active) setWakeLocked(false);
      }
    }

    requestLock();
    const onVisibility = () => {
      if (document.visibilityState === "visible" && active) requestLock();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release?.().catch(() => {});
    };
  }, [confirming]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const totalSteps = Math.max(1, recipe.steps.length);
  const stepIndex = progress.currentStep;
  const isLastStep = stepIndex >= totalSteps - 1;
  const nextStep = !isLastStep ? recipe.steps[stepIndex + 1] : null;

  const stepIngredients = useMemo(() => {
    const text = activeStep.text || "";
    return recipe.ingredients.filter((item) => item.name && text.includes(item.name));
  }, [activeStep.text, recipe.ingredients]);

  function goToStep(nextIndex) {
    const clamped = Math.min(Math.max(0, nextIndex), totalSteps - 1);
    setProgress((current) => {
      const donePos = String(activeStep.position);
      const steps =
        nextIndex > current.currentStep && !current.steps.includes(donePos)
          ? [...current.steps, donePos]
          : current.steps;
      return { ...current, currentStep: clamped, steps };
    });
  }

  function toggleChecked(group, value) {
    setProgress((current) => ({
      ...current,
      [group]: current[group].includes(value)
        ? current[group].filter((item) => item !== value)
        : [...current[group], value],
    }));
  }

  function startQuickTimer(seconds) {
    setTimerDuration(seconds);
    setTimerRemaining(seconds);
    setTimerDone(false);
    setTimerRunning(true);
  }

  function handleTouchStart(event) {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || overviewOpen) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.75) return;
    if (dx < 0) {
      if (isLastStep) setConfirming(true);
      else goToStep(stepIndex + 1);
    } else if (stepIndex > 0) {
      goToStep(stepIndex - 1);
    }
  }

  async function finishCooking(forceNoChanges = false) {
    const values = required.map((item) => ({
      name: item.name,
      action: forceNoChanges ? "kept" : consumptions[item.name],
    }));
    await onComplete(values, { saveTempRecipe: Boolean(recipe.isTemporary && saveTempRecipe) }).catch(() => {});
  }

  // Screen 06: Done & Inventory Reconciliation
  if (confirming) {
    return (
      <div className="done-screen" role="dialog" aria-modal="true" aria-labelledby="done-screen-title">
        <div className="done-scroll">
          <div className="done-top-nav">
            <button
              type="button"
              className="icon-square-btn"
              onClick={() => setConfirming(false)}
              disabled={busy}
              aria-label="返回烹饪步骤"
            >
              <ArrowLeft size={19} />
            </button>
          </div>

          <div className="done-hero">
            <span className="done-emoji" aria-hidden="true">🎉</span>
            <h2 id="done-screen-title">做好啦，开饭！</h2>
            <p>顺手更新一下食材，下次推荐更准</p>
          </div>

          <div className="section-head" style={{ marginTop: 20 }}>
            <h3>这次用掉了什么？</h3>
            <span>默认「还有」</span>
          </div>

          <div className="consumption-cards">
            {required.map((item) => (
              <div key={item.name} className="consumption-card">
                <div className="consumption-card-head">
                  <span className="consumption-emoji" aria-hidden="true">
                    {getIngredientEmoji(item.name)}
                  </span>
                  <strong>{item.name}</strong>
                  {item.quantityLabel && <small>{item.quantityLabel}</small>}
                </div>
                <div className="tri-toggle" role="radiogroup" aria-label={`${item.name}剩余情况`}>
                  {[
                    { value: "kept", label: "还有" },
                    { value: "low", label: "剩不多" },
                    { value: "used_up", label: "用完了" },
                  ].map((option) => {
                    const active = consumptions[item.name] === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`tri-opt ${active ? `active ${option.value}` : ""}`}
                        onClick={() => setConsumptions((prev) => ({ ...prev, [item.name]: option.value }))}
                        disabled={busy}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>

        <footer className="done-sticky-footer">
          {recipe.isTemporary && (
            <label className="done-save-recipe-opt">
              <input
                type="checkbox"
                checked={saveTempRecipe}
                onChange={(event) => setSaveTempRecipe(event.target.checked)}
                disabled={busy}
              />
              <span>顺手把「{recipe.title}」收藏到自家菜谱库</span>
            </label>
          )}
          <button
            type="button"
            className="btn-primary full lg"
            onClick={() => finishCooking(false)}
            disabled={busy}
          >
            <Check size={19} />
            {busy ? "正在更新食材..." : "更新食材并完成"}
          </button>
          <button
            type="button"
            className="done-skip-btn"
            onClick={() => finishCooking(true)}
            disabled={busy}
          >
            跳过（库存没变化）
          </button>
        </footer>
      </div>
    );
  }

  // Screen 05: Dark Step-by-Step Cooking Mode
  const timerPercent = timerDuration > 0 ? Math.round((timerRemaining / timerDuration) * 100) : 0;

  return (
    <div
      className="cook-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cooking-title"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="cook-container">
        <header className="cook-header">
          <button className="cook-round-btn" type="button" onClick={onClose} aria-label="退出烹饪模式">
            <X size={19} />
          </button>
          <h2 id="cooking-title" className="cook-title">
            {recipe.title}
          </h2>
          <button
            className={`cook-round-btn ${overviewOpen ? "active" : ""}`}
            type="button"
            onClick={() => setOverviewOpen((prev) => !prev)}
            aria-label="食材与步骤总览"
            aria-expanded={overviewOpen}
          >
            <ListChecks size={19} />
          </button>
        </header>

        {/* Segmented Step Progress Bars */}
        <div className="cook-progress-bars" role="tablist" aria-label="烹饪进度">
          {recipe.steps.map((step, index) => (
            <button
              key={step.position}
              type="button"
              className={`cook-bar-seg ${index <= stepIndex ? "on" : ""} ${index === stepIndex ? "current" : ""}`}
              onClick={() => goToStep(index)}
              aria-label={`跳到第 ${index + 1} 步`}
              aria-current={index === stepIndex ? "step" : undefined}
            />
          ))}
        </div>

        {/* Focused Step Area */}
        <main className="cook-main">
          <div className="cook-step-eyebrow">
            第 {stepIndex + 1} 步 / 共 {totalSteps} 步
          </div>

          <div className="cook-step-text">
            {highlightStepText(activeStep.text, recipe.ingredients)}
          </div>

          {/* Step-relevant Ingredient Chips */}
          <div className="cook-used-chips">
            {stepIngredients.length > 0 ? (
              stepIngredients.map((item) => (
                <span key={item.name} className="cook-chip">
                  <span aria-hidden="true">{getIngredientEmoji(item.name)}</span>
                  <span>{item.name}</span>
                  {item.quantityLabel && <small>{item.quantityLabel}</small>}
                </span>
              ))
            ) : (
              <button type="button" className="cook-chip interactive" onClick={() => setOverviewOpen(true)}>
                <span>🧺 准备食材</span>
                <small>
                  {progress.ingredients.length}/{required.length}
                </small>
              </button>
            )}
          </div>

          {/* Built-in Timer Card */}
          {timerDuration > 0 ? (
            <div className={`cook-timer-card ${timerDone ? "is-done" : ""}`}>
              <div
                className="cook-timer-ring"
                style={{
                  background: `conic-gradient(${timerDone ? "#2FA36B" : "#FF7A4D"} 0% ${timerPercent}%, #3A332B ${timerPercent}% 100%)`,
                }}
              >
                <div className="cook-timer-ring-inner">
                  {formatTimerDisplay(timerDuration)}
                </div>
              </div>
              <div className="cook-timer-info">
                <div className="cook-timer-readout">{formatTimerDisplay(timerRemaining)}</div>
                <div className="cook-timer-sub">
                  {timerDone ? "⏰ 时间到！" : timerRunning ? "计时进行中 · 结束会提醒" : "点击开始本步计时"}
                </div>
              </div>
              <div className="cook-timer-controls">
                <button
                  type="button"
                  className="cook-timer-btn primary"
                  onClick={() => {
                    if (timerRemaining === 0) {
                      setTimerRemaining(timerDuration);
                      setTimerDone(false);
                    }
                    setTimerRunning((prev) => !prev);
                  }}
                >
                  {timerRunning ? <Pause size={15} /> : <Play size={15} />}
                  <span>{timerRunning ? "暂停" : timerDone ? "重来" : "开始"}</span>
                </button>
                {timerRemaining !== timerDuration && (
                  <button
                    type="button"
                    className="cook-timer-btn"
                    onClick={() => {
                      setTimerRunning(false);
                      setTimerDone(false);
                      setTimerRemaining(timerDuration);
                    }}
                    aria-label="重置计时器"
                  >
                    <RotateCcw size={15} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="cook-quick-timers">
              <span className="quick-timer-label">
                <Timer size={14} aria-hidden="true" /> 快捷计时
              </span>
              {[
                { sec: 60, label: "1 分钟" },
                { sec: 180, label: "3 分钟" },
                { sec: 300, label: "5 分钟" },
              ].map((preset) => (
                <button
                  key={preset.sec}
                  type="button"
                  className="cook-chip interactive"
                  onClick={() => startQuickTimer(preset.sec)}
                >
                  + {preset.label}
                </button>
              ))}
            </div>
          )}

          {/* Next Step Preview */}
          <div className="cook-next-preview">
            {nextStep ? (
              <>
                下一步：<strong>{nextStep.text}</strong>
              </>
            ) : (
              <>
                最后一步：<strong>完成后顺手更新食材清单</strong>
              </>
            )}
          </div>
        </main>

        {/* Bottom Controls */}
        <footer className="cook-footer">
          <div className="cook-awake-note">
            {wakeLocked ? "☀︎ 屏幕常亮中 · 左右滑动切换步骤" : "左右滑动切换步骤 · 点击右上角看全部清单"}
          </div>
          <div className="cook-action-bar">
            <button
              type="button"
              className="cook-prev-btn"
              disabled={stepIndex === 0}
              onClick={() => goToStep(stepIndex - 1)}
            >
              上一步
            </button>
            <button
              type="button"
              className="cook-next-btn"
              onClick={() => {
                if (isLastStep) {
                  setConfirming(true);
                } else {
                  goToStep(stepIndex + 1);
                }
              }}
            >
              <span>{isLastStep ? "做好啦，开饭" : "下一步"}</span>
              {isLastStep ? <Check size={20} /> : <ArrowRight size={20} />}
            </button>
          </div>
        </footer>

        {/* Dark Overview Drawer (Prep Ingredients + All Steps) */}
        {overviewOpen && (
          <div className="cook-drawer-backdrop" role="presentation" onClick={() => setOverviewOpen(false)}>
            <section
              className="cook-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="食材与全部步骤总览"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="cook-drawer-head">
                <h3>食材与步骤总览</h3>
                <button className="cook-round-btn" type="button" onClick={() => setOverviewOpen(false)} aria-label="关闭总览">
                  <X size={18} />
                </button>
              </div>
              <div className="cook-drawer-scroll">
                <div className="cook-drawer-sec">
                  <h4>
                    准备食材（{progress.ingredients.length}/{required.length}）
                  </h4>
                  <div className="cook-checklist">
                    {required.map((item, idx) => {
                      const key = `${idx}-${item.name}`;
                      const checked = progress.ingredients.includes(key);
                      return (
                        <label key={key} className={checked ? "checked" : ""}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleChecked("ingredients", key)}
                          />
                          <span>
                            {getIngredientEmoji(item.name)} {item.name}
                            {item.quantityLabel && ` · ${item.quantityLabel}`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="cook-drawer-sec">
                  <h4>全部步骤（共 {totalSteps} 步）</h4>
                  <div className="cook-step-jump-list">
                    {recipe.steps.map((step, idx) => (
                      <button
                        key={step.position}
                        type="button"
                        className={`cook-jump-item ${idx === stepIndex ? "current" : ""} ${idx < stepIndex ? "done" : ""}`}
                        onClick={() => {
                          goToStep(idx);
                          setOverviewOpen(false);
                        }}
                      >
                        <span className="jump-num">{idx + 1}</span>
                        <span className="jump-text">{step.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="cook-drawer-footer">
                <button
                  type="button"
                  className="cook-next-btn"
                  onClick={() => {
                    setOverviewOpen(false);
                    setConfirming(true);
                  }}
                >
                  <Check size={18} />
                  <span>直接完成烹饪</span>
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function highlightStepText(text, ingredients) {
  const names = (ingredients || [])
    .map((item) => item.name)
    .filter((name) => name && name.length >= 1)
    .sort((a, b) => b.length - a.length);

  const durationPattern =
    "(?:\\d+(?:\\.\\d+)?|[半一二两三四五六七八九十]{1,2})\\s*(?:[-~～至到]\\s*(?:\\d+|[一二两三四五六七八九十]{1,2})\\s*)?(?:小时|分钟|分|秒钟|秒|勺|克|毫升|碗)";

  const escapedNames = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = [...escapedNames, durationPattern];
  if (parts.length === 0) return text;

  const regex = new RegExp(`(${parts.join("|")})`, "g");
  const segments = String(text || "").split(regex);

  return segments.map((segment, index) =>
    index % 2 === 1 ? <mark key={index}>{segment}</mark> : <span key={index}>{segment}</span>,
  );
}

function playGentleChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [587.33, 880]; // D5 -> A5 warm chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.22;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.48);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // Audio playback may be blocked in headless/muted environments
  }
}

/* ============================================================
   FAMILY SPACE TAB
   ============================================================ */

function FamilySpaceTab({ app, kitchenName, totalRecipes, syncState, busy, onRefresh, onUpdateSettings, onSignOut }) {
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [pantryExpanded, setPantryExpanded] = useState(false);
  const settings = app.settings || { pregnancyMode: true, dietaryNotes: "", defaultMealStyle: "2菜+主食" };
  const [dietaryDraft, setDietaryDraft] = useState(settings.dietaryNotes || "");
  const quickDietaryTags = ["孕早期", "孕中期", "孕晚期", "注意控糖", "少辣清淡", "不吃香菜", "不吃葱蒜"];
  const pendingBuyCount = (app.shoppingPlan?.items || []).filter((i) => !i.checked).length;

  useEffect(() => {
    setDietaryDraft(settings.dietaryNotes || "");
  }, [settings.dietaryNotes]);

  function toggleDietaryTag(tag) {
    const parts = dietaryDraft.split(/[、，,\s]+/).map((s) => s.trim()).filter(Boolean);
    const next = parts.includes(tag) ? parts.filter((s) => s !== tag) : [...parts, tag];
    setDietaryDraft(next.join("、"));
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1 className="header-title">家庭</h1>
          <p className="header-sub">{kitchenName} · 全家同步</p>
        </div>
      </header>

      {/* Unified Family Dietary Profile Card (Pregnancy Guard + Family Preferences/Restrictions) */}
      <section className="settings-card pregnancy-settings-card" aria-labelledby="pregnancy-settings-heading">
        <div className="settings-row">
          <div className="settings-row-text">
            <strong id="pregnancy-settings-heading">🤰 家庭饮食档案 · 孕期守护</strong>
            <span>新增食材自动提示孕期适用性，同时约束 AI 配菜、买菜规划与本地菜谱提醒</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(settings.pregnancyMode)}
            aria-label="切换孕期饮食守护"
            className={`toggle-switch ${settings.pregnancyMode ? "on" : ""}`}
            onClick={() => onUpdateSettings?.({ pregnancyMode: !settings.pregnancyMode })}
            disabled={busy}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="dietary-notes-block">
          <label className="field-block">
            <span>阶段与家庭忌口备注（自动标红含忌口菜谱并同步给 AI）</span>
            <input
              className="styled-input sm"
              value={dietaryDraft}
              onChange={(event) => setDietaryDraft(event.target.value)}
              maxLength={120}
              placeholder="例如：孕中期、注意控糖、少辣清淡、不吃香菜"
              disabled={busy}
            />
          </label>
          <div className="dietary-quick-chips">
            {quickDietaryTags.map((tag) => {
              const active = dietaryDraft.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`filter-chip ${active ? "active" : ""}`}
                  onClick={() => toggleDietaryTag(tag)}
                  disabled={busy}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          {dietaryDraft.trim() !== (settings.dietaryNotes || "").trim() && (
            <button
              type="button"
              className="btn-primary-sm"
              onClick={() => onUpdateSettings?.({ dietaryNotes: dietaryDraft.trim() })}
              disabled={busy}
            >
              <Save size={14} />
              <span>保存家庭饮食备注</span>
            </button>
          )}
          <p className="preg-disclaimer">{PREGNANCY_DISCLAIMER}</p>
        </div>
      </section>

      {/* Compact Family Overview Card */}
      <section className="family-hero-card">
        <div className="family-hero-top">
          <div className="family-big-avatar" aria-hidden="true">🏠</div>
          <div>
            <h2>{kitchenName}</h2>
            <p>{app.family.accessMode}共享 · 默认每顿 2 菜 + 主食</p>
          </div>
        </div>
        <div className="family-stats-grid">
          <div>
            <strong>{app.ingredients.length}</strong>
            <span>可用食材</span>
          </div>
          <div>
            <strong>{totalRecipes}</strong>
            <span>自家菜谱</span>
          </div>
          <div>
            <strong>{pendingBuyCount}</strong>
            <span>待买食材</span>
          </div>
        </div>
      </section>

      {/* Sync & AI Card */}
      <section className="settings-card" aria-label="同步与 AI 状态">
        <div className="settings-row">
          <div className="settings-row-text">
            <strong>数据同步</strong>
            <span>
              {syncState === "syncing"
                ? "正在从云端同步..."
                : syncState === "error"
                  ? "同步失败，请稍后重试"
                  : "已与家庭空间保持最新同步"}
            </span>
          </div>
          <button type="button" className="btn-soft-sm" onClick={onRefresh} disabled={busy}>
            <RefreshCcw size={14} className={syncState === "syncing" ? "spin" : ""} />
            <span>立即同步</span>
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-text">
            <strong>AI 菜谱助手</strong>
            <span>
              {app.ai.configured
                ? `已启用（${app.ai.textModel || "已配置"}${app.ai.visionModel ? ` · 视觉 ${app.ai.visionModel}` : ""}）`
                : "未配置 AI 模型密钥（仍可使用本地规则）"}
            </span>
          </div>
          <span className={`tag-pill ${app.ai.configured ? "tag-green" : "tag-orange"}`}>
            {app.ai.configured ? "已就绪" : "未配置"}
          </span>
        </div>
      </section>

      {/* Collapsible Pantry Section */}
      <section className="settings-card" aria-labelledby="pantry-heading">
        <button
          type="button"
          className="pantry-collapse-btn"
          aria-expanded={pantryExpanded}
          onClick={() => setPantryExpanded((prev) => !prev)}
        >
          <div className="pantry-collapse-title">
            <h3 id="pantry-heading">🧂 常备调味品</h3>
            <span>默认家里已有 {(app.pantry || []).length} 项</span>
          </div>
          {pantryExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
        {pantryExpanded && (
          <div className="pantry-collapse-body">
            <p className="settings-desc">以下调味品在匹配菜谱和规划买菜时默认视为已有，无需每天登记。</p>
            <div className="pantry-chips">
              {(app.pantry || []).map((name) => (
                <span key={name} className="pill-chip">
                  <span aria-hidden="true">{getIngredientEmoji(name, "调味")}</span>
                  <span>{name}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Sign out */}
      <section className="settings-card">
        {confirmSignOut ? (
          <div className="signout-confirm">
            <span>退出后需要重新输入家庭访问码，确认退出吗？</span>
            <div className="signout-confirm-btns">
              <button type="button" className="btn-soft-sm" onClick={() => setConfirmSignOut(false)}>
                取消
              </button>
              <button type="button" className="btn-danger-sm" onClick={onSignOut}>
                确认退出
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="signout-row-btn" onClick={() => setConfirmSignOut(true)}>
            <LogOut size={17} />
            <span>退出当前家庭空间</span>
          </button>
        )}
      </section>
    </div>
  );
}

/* ============================================================
   INGREDIENT EDITOR SHEET
   ============================================================ */

function IngredientEditorSheet({ ingredient, pregnancyMode = true, busy, deleting, error, onSave, onDelete, onClose }) {
  const editing = Boolean(ingredient.id);
  const [form, setForm] = useState({ ...ingredient });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useBodyLockAndEscape(busy, onClose);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSave({ ...form, name: form.name.trim() });
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <section
        className="bottom-sheet editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ingredient-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <header className="sheet-top-row padded">
          <div className="editor-title-with-emoji">
            <span className="editor-emoji-badge" aria-hidden="true">
              {getIngredientEmoji(form.name, form.category)}
            </span>
            <div>
              <h2 id="ingredient-sheet-title">{editing ? "编辑食材" : "添加食材"}</h2>
              <p className="sheet-subtitle">{editing ? "修改后会立即更新菜谱匹配" : "记录家里现在能用来做饭的食材"}</p>
            </div>
          </div>
          <button className="sheet-close-btn" type="button" onClick={onClose} disabled={busy} aria-label="关闭食材编辑">
            <X size={18} />
          </button>
        </header>

        <form className="editor-form" onSubmit={submit}>
          <label className="field-block">
            <span>食材名称</span>
            <input
              className="styled-input"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              maxLength={40}
              placeholder="例如：西蓝花、鸡腿肉"
              autoFocus
              required
            />
          </label>

          {pregnancyMode && form.name.trim() && (
            <PregnancyInfoBox
              name={form.name}
              stored={editing && form.name.trim() === ingredient.name ? ingredient : null}
            />
          )}

          <fieldset className="option-fieldset">
            <legend>食材分类</legend>
            <div className="option-pill-grid cols-4">
              {[{ value: "", label: "自动分类" }, ...INGREDIENT_CATEGORIES.map((c) => ({ value: c, label: c }))].map(
                (option) => (
                  <label key={option.label} className={`option-pill ${form.category === option.value ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="ingredient-category"
                      value={option.value}
                      checked={form.category === option.value}
                      onChange={(event) => update("category", event.target.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ),
              )}
            </div>
          </fieldset>

          <fieldset className="option-fieldset">
            <legend>做饭提示</legend>
            <div className="option-pill-grid cols-2">
              {ingredientStates.map((option) => (
                <label
                  key={option.value}
                  className={`option-pill ${form.state === option.value ? `selected state-${option.value}` : ""}`}
                >
                  <input
                    type="radio"
                    name="ingredient-state"
                    value={option.value}
                    checked={form.state === option.value}
                    onChange={(event) => update("state", event.target.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          {confirmDelete ? (
            <div className="delete-confirm-box">
              <p>确认删除「{form.name}」？可做菜谱会立即重新匹配。</p>
              <div className="delete-confirm-actions">
                <button className="btn-soft flex1" type="button" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  取消
                </button>
                <button className="btn-danger flex1" type="button" onClick={() => onDelete(form.id)} disabled={busy}>
                  {deleting ? "正在删除..." : "确认删除"}
                </button>
              </div>
            </div>
          ) : (
            <div className="sheet-inline-actions">
              {editing && (
                <button className="btn-danger-outline" type="button" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  <Trash2 size={16} />
                  <span>删除食材</span>
                </button>
              )}
              <button className="btn-primary flex1" type="submit" disabled={busy}>
                {busy ? "正在保存..." : editing ? "保存修改" : "保存食材"}
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

/* ============================================================
   RECIPE & DRAFT EDITOR SHEET
   ============================================================ */

function RecipeEditorSheet({ recipe, busy, error, onSave, onClose }) {
  const isNew = !recipe;
  const isDraft = !isNew && recipe.status === "draft";
  const [form, setForm] = useState({
    id: recipe?.id ?? null,
    title: recipe?.title || "",
    method: recipe?.method || "炒",
    minutes: recipe?.minutes || 15,
    preferenceWarning: recipe?.preferenceWarning || "",
    ingredients:
      recipe?.ingredients?.length > 0
        ? recipe.ingredients.map((item) => ({
            name: item.name,
            quantityLabel: item.quantityLabel || "",
            required: Boolean(item.required),
          }))
        : [
            { name: "", quantityLabel: "", required: true },
            { name: "", quantityLabel: "", required: true },
          ],
    steps:
      recipe?.steps?.length > 0
        ? recipe.steps.map((step) => step.text)
        : ["", ""],
  });

  useBodyLockAndEscape(busy, onClose);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateIngredient(index, field, value) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)),
    }));
  }

  function removeIngredient(index) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, idx) => idx !== index),
    }));
  }

  function addIngredient() {
    setForm((current) => ({
      ...current,
      ingredients: [...current.ingredients, { name: "", quantityLabel: "", required: true }],
    }));
  }

  function updateStep(index, value) {
    setForm((current) => ({
      ...current,
      steps: current.steps.map((step, idx) => (idx === index ? value : step)),
    }));
  }

  function removeStep(index) {
    setForm((current) => ({
      ...current,
      steps: current.steps.filter((_, idx) => idx !== index),
    }));
  }

  function addStep() {
    setForm((current) => ({ ...current, steps: [...current.steps, ""] }));
  }

  function payload() {
    return {
      ...form,
      title: form.title.trim(),
      minutes: Number(form.minutes),
      ingredients: form.ingredients.map((item) => ({
        ...item,
        name: item.name.trim(),
        quantityLabel: item.quantityLabel.trim(),
      })),
      steps: form.steps.map((step) => step.trim()),
    };
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <section
        className="bottom-sheet editor-sheet tall"
        role="dialog"
        aria-modal="true"
        aria-labelledby="draft-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <header className="sheet-top-row padded">
          <div>
            <h2 id="draft-editor-title">{isNew ? "手动写菜谱" : isDraft ? "编辑菜谱草稿" : "编辑菜谱"}</h2>
            <p className="sheet-subtitle">
              {isNew
                ? "记录家里拿手菜，保存后立即参与菜谱匹配"
                : isDraft
                  ? "修改标题、食材和步骤，可保存草稿或确认入库"
                  : "修改后会立即重新匹配菜谱"}
            </p>
          </div>
          <button
            className="sheet-close-btn"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={isNew ? "关闭新建菜谱" : isDraft ? "关闭草稿编辑" : "关闭菜谱编辑"}
          >
            <X size={18} />
          </button>
        </header>

        <form
          className="recipe-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(payload(), isDraft && event.nativeEvent.submitter?.value === "confirm");
          }}
        >
          <div className="sheet-scroll-body">
            <label className="field-block">
              <span>菜谱标题</span>
              <input
                className="styled-input"
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
                maxLength={40}
                required
              />
            </label>

            <div className="two-col-fields">
              <label className="field-block">
                <span>烹饪方式</span>
                <select
                  className="styled-select"
                  value={form.method}
                  onChange={(event) => update("method", event.target.value)}
                >
                  {cookingMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>烹饪时间（分钟）</span>
                <input
                  className="styled-input"
                  type="number"
                  min="1"
                  max="240"
                  value={form.minutes}
                  onChange={(event) => update("minutes", event.target.value)}
                  required
                />
              </label>
            </div>

            <section className="editor-sub-sec" aria-labelledby="draft-ingredients-title">
              <div className="section-head">
                <h3 id="draft-ingredients-title">食材</h3>
                <button className="add-inline-btn" type="button" onClick={addIngredient} aria-label="添加食材项">
                  <Plus size={15} />
                  添加
                </button>
              </div>
              <div className="editor-rows">
                {form.ingredients.map((item, index) => (
                  <div className="editor-ing-row" key={index}>
                    <label className="ing-name-input">
                      <span className="sr-only">食材名称 {index + 1}</span>
                      <input
                        className="styled-input sm"
                        value={item.name}
                        onChange={(event) => updateIngredient(index, "name", event.target.value)}
                        placeholder="食材名"
                        required
                      />
                    </label>
                    <label className="ing-qty-input">
                      <span className="sr-only">食材用量 {index + 1}</span>
                      <input
                        className="styled-input sm"
                        value={item.quantityLabel}
                        onChange={(event) => updateIngredient(index, "quantityLabel", event.target.value)}
                        placeholder="用量"
                      />
                    </label>
                    <label className="req-check-pill">
                      <input
                        type="checkbox"
                        checked={item.required}
                        onChange={(event) => updateIngredient(index, "required", event.target.checked)}
                      />
                      <span>必需</span>
                    </label>
                    <button
                      className="row-del-btn"
                      type="button"
                      onClick={() => removeIngredient(index)}
                      aria-label={`删除食材 ${index + 1}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="editor-sub-sec" aria-labelledby="draft-steps-title">
              <div className="section-head">
                <h3 id="draft-steps-title">烹饪步骤</h3>
                <button className="add-inline-btn" type="button" onClick={addStep} aria-label="添加烹饪步骤">
                  <Plus size={15} />
                  添加
                </button>
              </div>
              <div className="editor-rows">
                {form.steps.map((step, index) => (
                  <div className="editor-step-row" key={index}>
                    <span className="step-badge">{index + 1}</span>
                    <label className="flex1">
                      <span className="sr-only">烹饪步骤 {index + 1}</span>
                      <textarea
                        className="styled-textarea sm"
                        value={step}
                        onChange={(event) => updateStep(index, event.target.value)}
                        rows={2}
                        required
                      />
                    </label>
                    <button
                      className="row-del-btn"
                      type="button"
                      onClick={() => removeStep(index)}
                      aria-label={`删除步骤 ${index + 1}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
          </div>

          <div className="sheet-sticky-actions">
            {isDraft ? (
              <>
                <button className="btn-soft flex1" type="submit" value="save" disabled={busy}>
                  <Save size={16} />
                  <span>{busy ? "保存中..." : "保存草稿"}</span>
                </button>
                <button className="btn-primary flex1" type="submit" value="confirm" disabled={busy}>
                  <Check size={16} />
                  <span>{busy ? "保存中..." : "确认并保存"}</span>
                </button>
              </>
            ) : (
              <button className="btn-primary full" type="submit" disabled={busy}>
                <Save size={16} />
                <span>{busy ? "正在保存..." : isNew ? "保存到菜谱库" : "保存修改"}</span>
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

/* ============================================================
   ACCESS GATE
   ============================================================ */

function AccessGate({ onUnlock }) {
  const [accessCode, setAccessCode] = useState(import.meta.env.DEV ? "happy-eat" : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/session", {
        method: "POST",
        body: { accessCode },
      });
      localStorage.setItem("familyAccessToken", result.token);
      const nextApp = await api("/api/app", { token: result.token });
      onUnlock(result.token, nextApp);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="access-screen">
      <form className="access-card" onSubmit={unlock}>
        <div className="access-logo" aria-hidden="true">
          <ChefHat size={34} strokeWidth={2.1} />
        </div>
        <span className="access-eyebrow">HAPPY EAT · 温暖家庭厨房</span>
        <h1>打开家庭空间</h1>
        <p>输入家庭访问码，看看冰箱里的食材今晚能做什么好菜。</p>
        <input
          className="styled-input access-input"
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          aria-label="家庭访问码"
          placeholder="请输入家庭访问码"
          autoComplete="current-password"
          autoFocus
        />
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button className="btn-primary full lg" type="submit" disabled={busy}>
          {busy ? "正在进入..." : "进入"}
        </button>
      </form>
    </main>
  );
}

/* ============================================================
   VOICE INPUT BUTTON & HOOKS / UTILS
   ============================================================ */

function useBodyLockAndEscape(busy, onClose) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onClose]);
}

function filterIngredients(ingredients, category, query) {
  const normalizedQuery = normalizeSearchTerm(query);
  return ingredients.filter((ingredient) => {
    const matchesCategory = category === "全部" || ingredient.category === category;
    const matchesQuery = !normalizedQuery || ingredient.name.includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });
}

function filterRecipes(recipes, query, method, time) {
  const normalizedQuery = normalizeSearchTerm(query);
  return recipes.filter((recipe) => {
    const matchesQuery =
      !normalizedQuery ||
      recipe.title.includes(normalizedQuery) ||
      recipe.ingredients.some((item) => item.name.includes(normalizedQuery));
    const matchesMethod = !method || recipe.method === method;
    const matchesTime = !time || (time === "long" ? recipe.minutes > 30 : recipe.minutes <= Number(time));
    return matchesQuery && matchesMethod && matchesTime;
  });
}

function findRecipeById(matches, recipeId) {
  return [...matches.ready, ...matches.missing].find((recipe) => recipe.id === recipeId);
}

function VoiceInputButton({ token, disabled, onTranscript, onError }) {
  const [status, setStatus] = useState("idle");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const transcribeRecording = useCallback(async () => {
    clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (!mountedRef.current) return;
    setStatus("transcribing");
    try {
      const recorded = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || "audio/webm" });
      if (!recorded.size) throw new Error("没有录到声音，请重试");
      const audio = await normalizeRecordedAudio(recorded);
      const audioDataUrl = await readFileAsDataUrl(audio);
      const result = await api("/api/audio/transcriptions", {
        token,
        method: "POST",
        body: { audioDataUrl },
      });
      if (!result.text.trim()) throw new Error("没有识别到文字，请重试");
      onTranscript(result.text.trim());
    } catch (err) {
      onError(err.message || "语音识别失败，请重试");
    } finally {
      recorderRef.current = null;
      streamRef.current = null;
      chunksRef.current = [];
      setStatus("idle");
    }
  }, [token, onTranscript, onError]);

  async function startRecording() {
    onError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", transcribeRecording, { once: true });
      recorder.start();
      setStatus("recording");
      timerRef.current = setTimeout(() => recorder.state === "recording" && recorder.stop(), 60_000);
    } catch (err) {
      setStatus("idle");
      onError(err.name === "NotAllowedError" ? "请允许使用麦克风后再试" : "无法开始录音，请检查浏览器麦克风权限");
    }
  }

  function stopRecording() {
    clearTimeout(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  const recording = status === "recording";
  const label = recording ? "停止录音" : status === "transcribing" ? "正在识别语音" : "语音转文字";

  return (
    <button
      className={`mic-btn ${recording ? "recording" : ""}`}
      type="button"
      onClick={recording ? stopRecording : startRecording}
      disabled={disabled || status === "transcribing"}
      aria-pressed={recording}
      aria-label={label}
      title={label}
    >
      {recording ? (
        <Square size={16} fill="currentColor" />
      ) : status === "transcribing" ? (
        <LoaderCircle className="spin" size={18} />
      ) : (
        <Mic size={19} />
      )}
    </button>
  );
}

function appendTranscript(current, transcript) {
  const text = current.trim();
  return text ? `${text}、${transcript}` : transcript;
}

async function normalizeRecordedAudio(blob) {
  // DeepSeek ASR accepts 16-bit PCM WAV or Ogg Opus; pass through small Ogg/WAV directly
  // and transcode WebM/MP4/large recordings into compact 16kHz 16-bit mono PCM WAV.
  if (/^audio\/(ogg|wav|x-wav)/i.test(blob.type) && blob.size <= 4 * 1024 * 1024) {
    return new Blob([blob], { type: blob.type.split(";")[0] });
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("当前浏览器不支持录音格式转换");
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(buffer, 16000);
  } finally {
    await context.close();
  }
}

function encodeWav(audioBuffer, targetSampleRate = 16000) {
  const inputSamples = audioBuffer.getChannelData(0);
  const inputRate = audioBuffer.sampleRate;
  const outputRate = inputRate > targetSampleRate ? targetSampleRate : inputRate;
  let samples = inputSamples;

  if (outputRate !== inputRate) {
    const ratio = inputRate / outputRate;
    const length = Math.max(1, Math.round(inputSamples.length / ratio));
    samples = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const next = Math.min(idx + 1, inputSamples.length - 1);
      samples[i] = inputSamples[idx] * (1 - frac) + inputSamples[next] * frac;
    }
  }

  const data = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(data);
  const writeText = (offset, text) =>
    [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outputRate, true);
  view.setUint32(28, outputRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return new Blob([data], { type: "audio/wav" });
}

async function compressRecipeImage(file, maxSide = 1600, quality = 0.82) {
  const fallback = () => readFileAsDataUrl(file);
  if (typeof document === "undefined" || typeof window.Image === "undefined") return fallback();

  const rawDataUrl = await fallback();
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      try {
        const largest = Math.max(img.width, img.height);
        const scale = largest > maxSide ? maxSide / largest : 1;
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", quality);
        resolve(compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

async function api(url, options = {}) {
  const apiUrl = `${import.meta.env.VITE_API_BASE_URL || ""}${url}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  };
  const response = await fetch(apiUrl, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(payload.error || "请求失败");
    err.status = response.status;
    throw err;
  }

  return payload;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}
