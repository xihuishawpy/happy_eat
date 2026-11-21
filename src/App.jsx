import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChefHat,
  ChevronRight,
  Clock3,
  Dice5,
  FileText,
  Flame,
  Globe,
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
  ShoppingBasket,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [editingBatchText, setEditingBatchText] = useState(false);

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
  const [generationSelectorOpen, setGenerationSelectorOpen] = useState(false);
  const [draftEditor, setDraftEditor] = useState(null);
  const [recipeEditor, setRecipeEditor] = useState(null);
  const [completionNotice, setCompletionNotice] = useState(null);

  // Request status
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [syncState, setSyncState] = useState("synced");
  const busy = Boolean(pendingAction);
  const draftSourceReady = draftSource === "image" ? Boolean(draftImageDataUrl) : Boolean(draftText.trim());

  const batchPreviewAll = useMemo(() => previewBatchIngredients(batchText), [batchText]);
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

  const handleBatchTextChange = (nextText) => {
    setBatchText(nextText);
    if (!nextText.trim()) {
      setExcludedPreviewNames([]);
      setEditingBatchText(false);
    }
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
      setEditingBatchText(false);
      setCompletionNotice({ message: "食材清单已更新，菜谱已重新匹配", undoId: null });
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
      setApp(
        await api(editing ? `/api/ingredients/${ingredient.id}` : "/api/ingredients", {
          token,
          method: editing ? "PATCH" : "POST",
          body: {
            name: ingredient.name,
            category: ingredient.category,
            state: ingredient.state,
          },
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
    try {
      const dataUrl = await readFileAsDataUrl(file);
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

  async function generateRecipe(ingredientIds) {
    setPendingAction("recipe-generate");
    setSyncState("syncing");
    setError("");
    try {
      const result = await api("/api/recipes/generate", {
        token,
        method: "POST",
        body: { ingredientIds },
      });
      setApp(result.app);
      setGenerationSelectorOpen(false);
      setCreateSheetOpen(false);
      setDraftEditor(result.draft);
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
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

  async function completeCooking(recipe, consumptions) {
    setPendingAction("cooking-complete");
    setSyncState("syncing");
    setError("");
    try {
      const result = await api(`/api/recipes/${recipe.id}/complete`, {
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
        message: changes.length > 0 ? `食材已更新：${changes.join("，")}` : "已完成烹饪，食材清单没有变化",
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
    const pool = app.matches.ready.length > 0 ? app.matches.ready : app.matches.missing;
    if (pool.length === 0) return;
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

        {error && !ingredientEditor && !createSheetOpen && !draftEditor && !recipeEditor && !selectedRecipe && !cookingRecipe && (
          <div className="floating-banner error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="关闭错误提示">
              <X size={16} />
            </button>
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
                    {getWeekdayGreeting()} 👋 {app.family.name}厨房
                  </p>
                  <h1 className="header-title">{getMealQuestion()}</h1>
                </div>
                <button
                  className={`family-avatar-btn sync-${syncState}`}
                  type="button"
                  onClick={() => setActiveTab("family")}
                  aria-label={`进入${app.family.name}家庭空间`}
                  title={`${app.family.name}厨房 · ${syncState === "syncing" ? "同步中" : syncState === "error" ? "同步异常" : "已同步"}`}
                >
                  <span aria-hidden="true">🏠</span>
                  <span className="sync-dot" aria-hidden="true" />
                </button>
              </header>

              {/* Hero Card */}
              <section className="hero-card" aria-label="今日可做概览">
                <div className="hero-content">
                  <div className="hero-label">家里食材现在就能做</div>
                  <div className="hero-number">
                    <strong>{app.matches.ready.length}</strong>
                    <span>道菜</span>
                  </div>
                  <div className="hero-stat">
                    {app.ingredients.length} 种食材
                    {app.matches.missing.length > 0 ? ` · 另有 ${app.matches.missing.length} 道差少许食材` : " · 菜谱全部齐全"}
                  </div>
                  <button
                    className="hero-pick-btn"
                    type="button"
                    onClick={() => pickRandomRecipe()}
                    disabled={allRecipes.length === 0}
                  >
                    <Dice5 size={16} aria-hidden="true" />
                    <span>帮我挑一道</span>
                  </button>
                </div>
                <div className="hero-deco" aria-hidden="true">
                  🍳
                </div>
              </section>

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

              {/* Always-visible Voice-First Quick Composer */}
              <section className="quick-composer-card" aria-label="快速记录新食材">
                <div className="quick-composer-row">
                  <input
                    type="text"
                    className="quick-composer-input"
                    value={batchText}
                    onChange={(event) => handleBatchTextChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && batchText.trim() && !busy) {
                        event.preventDefault();
                        addBatchIngredients();
                      }
                    }}
                    placeholder="家里新添了什么？说一句就行"
                    aria-label="家里新添了什么"
                    disabled={busy}
                  />
                  <VoiceInputButton
                    token={token}
                    disabled={busy}
                    onTranscript={(text) => handleBatchTextChange(appendTranscript(batchText, text))}
                    onError={setError}
                  />
                </div>
                {batchText.trim() && (
                  <div className="quick-composer-confirm">
                    <div className="quick-preview-pills">
                      {batchPreviewItems.slice(0, 5).map((item) => (
                        <span key={item.name} className="mini-preview-chip">
                          {item.emoji} {item.name}
                        </span>
                      ))}
                      {batchPreviewItems.length > 5 && (
                        <span className="mini-preview-more">+{batchPreviewItems.length - 5}</span>
                      )}
                    </div>
                    <div className="quick-composer-actions">
                      <button
                        type="button"
                        className="btn-ghost-sm"
                        onClick={() => handleBatchTextChange("")}
                        disabled={busy}
                      >
                        清空
                      </button>
                      <button
                        type="button"
                        className="btn-primary-sm"
                        onClick={() => addBatchIngredients()}
                        disabled={busy}
                      >
                        <Sparkles size={14} aria-hidden="true" />
                        {pendingAction === "batch" ? "正在添加" : "解析并添加"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Segmented Match Control */}
              <div className="matches-section">
                <div className="segmented-control" role="tablist" aria-label="菜谱匹配分类">
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
                  onOpen={setSelectedRecipe}
                  emptyMessage={
                    todayIngredientFilter
                      ? `暂无含「${todayIngredientFilter}」的${matchTab === "ready" ? "可做" : "待补"}菜谱`
                      : matchTab === "ready"
                        ? "当前还没有可立刻做的菜，添几样食材或让 AI 帮你想一道吧。"
                        : "目前没有差一点就能做的菜谱。"
                  }
                  onQuickAction={() => {
                    setError("");
                    setCreateNotice("");
                    setCreateSheetOpen(true);
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

              {/* Voice Composer + Live Parse Preview Card */}
              <section
                className={`ingredient-composer-box ${batchText.trim() ? "has-preview" : ""}`}
                aria-label="自然语言批量添加食材"
              >
                {(!batchText.trim() || editingBatchText) && (
                  <div className="quick-composer-row">
                    <textarea
                      className="quick-composer-textarea"
                      rows={editingBatchText ? 2 : 1}
                      value={batchText}
                      onChange={(event) => handleBatchTextChange(event.target.value)}
                      placeholder="说出或输入新添食材…"
                      aria-label="自然语言录入食材"
                      disabled={busy}
                      autoFocus={editingBatchText}
                    />
                    <VoiceInputButton
                      token={token}
                      disabled={busy}
                      onTranscript={(text) => {
                        setEditingBatchText(false);
                        handleBatchTextChange(appendTranscript(batchText, text));
                      }}
                      onError={setError}
                    />
                  </div>
                )}

                {!batchText.trim() && (
                  <div className="composer-hint-row">
                    <button
                      type="button"
                      className="example-link-btn"
                      onClick={() => handleBatchTextChange("牛肉、两根胡萝卜、土豆、小葱、番茄快过期")}
                      disabled={busy}
                    >
                      ✨ 试试示例：牛肉、胡萝卜、土豆、番茄快过期
                    </button>
                  </div>
                )}

                {batchText.trim() && (
                  <div className="parse-preview-body">
                    {!editingBatchText && (
                      <div className="parse-quote">
                        <span>🎙 “{batchText.trim()}”</span>
                      </div>
                    )}
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
                        {batchPreviewItems.map((item) => (
                          <span key={item.name} className="parse-chip">
                            <span aria-hidden="true">{item.emoji}</span>
                            <strong>{item.name}</strong>
                            <small>{item.category}</small>
                            {item.state !== "none" && (
                              <em className={`mini-state ${item.state}`}>{stateShortLabels[item.state]}</em>
                            )}
                            <button
                              type="button"
                              className="parse-chip-remove"
                              onClick={() => setExcludedPreviewNames((prev) => [...prev, item.name])}
                              aria-label={`移除预览食材${item.name}`}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="parse-actions">
                      <button
                        type="button"
                        className="btn-soft"
                        onClick={() => {
                          if (editingBatchText) {
                            handleBatchTextChange("");
                          } else {
                            setEditingBatchText(true);
                          }
                        }}
                        disabled={busy}
                      >
                        {editingBatchText ? "取消" : "修改"}
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
                          <IngredientTile key={item.id} ingredient={item} onEdit={() => openIngredient(item)} disabled={busy} />
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
                            <IngredientTile key={item.id} ingredient={item} onEdit={() => openIngredient(item)} disabled={busy} />
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
                      <IngredientTile key={item.id} ingredient={item} onEdit={() => openIngredient(item)} disabled={busy} />
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
                            {recipe.preferenceWarning && (
                              <span className="meta-warn">· {recipe.preferenceWarning}</span>
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
              totalRecipes={allRecipes.length}
              allRecipes={allRecipes}
              syncState={syncState}
              busy={busy}
              onRefresh={refresh}
              onOpenCreate={() => {
                setError("");
                setCreateNotice("");
                setCreateSheetOpen(true);
              }}
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

        {/* 04. Create / Import / Drafts Sheet */}
        {createSheetOpen && (
          <CreateRecipeSheet
            app={app}
            token={token}
            urgentIngredients={urgentIngredients}
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
            onOpenAiGenerate={() => {
              setError("");
              setGenerationSelectorOpen(true);
            }}
            onOpenDraft={(draft) => {
              setError("");
              setDraftEditor(draft);
            }}
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
            busy={busy}
            deleting={pendingAction === "recipe-delete"}
            error={error}
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
            onComplete={(consumptions) => completeCooking(cookingRecipe, consumptions)}
            onClose={() => {
              setCookingRecipe(null);
              setError("");
            }}
          />
        )}

        {/* AI Ingredient Selection Sheet */}
        {generationSelectorOpen && (
          <IngredientSelectionSheet
            categories={app.categories}
            busy={pendingAction === "recipe-generate"}
            error={error}
            onGenerate={generateRecipe}
            onClose={() => {
              setGenerationSelectorOpen(false);
              setError("");
            }}
          />
        )}

        {/* Ingredient Editor Sheet */}
        {ingredientEditor && (
          <IngredientEditorSheet
            key={ingredientEditor.id ?? "new"}
            ingredient={ingredientEditor}
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

function TodayRecipeList({ recipes, urgentNameSet, onOpen, emptyMessage, onQuickAction }) {
  if (recipes.length === 0) {
    return (
      <div className="empty-card">
        <span className="empty-emoji" aria-hidden="true">🥘</span>
        <strong>暂时没有匹配的菜谱</strong>
        <p>{emptyMessage}</p>
        <button className="btn-primary-sm" type="button" onClick={onQuickAction}>
          <Sparkles size={14} />
          AI 配菜或导入菜谱
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
                {recipe.preferenceWarning && <span className="tag-pill tag-red">{recipe.preferenceWarning}</span>}
              </div>
              {!isReady && recipe.substitutions.length > 0 && (
                <p className="rc-sub">💡 {recipe.substitutions[0]}</p>
              )}
            </div>
            <ChevronRight size={18} className="rc-chev" aria-hidden="true" />
          </article>
        );
      })}
    </div>
  );
}

function RandomPickSheet({ recipe, urgentNameSet, canReroll, onReroll, onViewDetail, onStartCooking, onClose }) {
  const visual = getRecipeVisual(recipe);
  const isReady = recipe.missing.length === 0;
  const matchedUrgent = recipe.ingredients.find((item) => item.required && urgentNameSet.has(item.name));

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
          <span className="pick-eyebrow">🎲 今天不如就做这道</span>
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

function IngredientTile({ ingredient, onEdit, disabled }) {
  const isUrgent = ingredient.state === "expiring" || ingredient.state === "priority";
  const isFrozen = ingredient.state === "frozen";
  const label = stateShortLabels[ingredient.state] || "";

  return (
    <button
      type="button"
      className={`ing-tile ${isUrgent ? "is-warn" : ""} ${isFrozen ? "is-frozen" : ""}`}
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
  busy,
  deleting,
  error,
  onEdit,
  onDelete,
  onClose,
  onStartCooking,
}) {
  const visual = getRecipeVisual(recipe);
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
              {recipe.preferenceWarning && (
                <span className="tag-pill tag-red">⚠️ {recipe.preferenceWarning}</span>
              )}
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
              <div className="readiness-banner missing">
                <span className="check-circle miss" aria-hidden="true">
                  {recipe.missing.length}
                </span>
                <span>
                  差 {recipe.missing.length} 样：{recipe.missing.join("、")}
                </span>
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
  urgentIngredients,
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
  onOpenAiGenerate,
  onOpenDraft,
  onClose,
}) {
  const [importMode, setImportMode] = useState(null); // null = menu | "image" | "text" | "web" | "voice"

  useBodyLockAndEscape(busy, onClose);

  function enterImport(mode) {
    setError("");
    setNotice("");
    setImportMode(mode);
    setDraftSource(mode === "voice" ? "text" : mode);
  }

  async function submitImport() {
    const ok = await onAnalyze();
    if (ok) {
      setImportMode(null);
    }
  }

  const urgentSummary =
    urgentIngredients.length > 0
      ? `优先用掉${urgentIngredients.slice(0, 3).map((i) => i.name).join("、")}`
      : "根据家里现有食材智能定制";

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
              <h2 id="create-sheet-title">添加菜谱</h2>
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

            {/* Dark AI Card */}
            <div className="ai-hero-card">
              <div className="ai-card-eyebrow">AI 帮我配菜</div>
              <div className="ai-card-title">用家里的 {app.ingredients.length} 种食材，想一道新菜</div>
              <div className="ai-card-desc">
                {app.ai.configured ? urgentSummary : "尚未配置 AI 模型，仍可使用下方导入功能"}
              </div>
              <button
                type="button"
                className="ai-card-btn"
                onClick={onOpenAiGenerate}
                disabled={busy || !app.ai.configured || app.ingredients.length === 0}
              >
                <Sparkles size={15} />
                <span>选食材并生成</span>
              </button>
              <span className="ai-card-deco" aria-hidden="true">
                🧑‍🍳
              </span>
            </div>

            {/* 4 Quick Import Sources */}
            <div className="import-source-grid">
              <button type="button" className="import-source-tile" onClick={() => enterImport("image")} disabled={busy}>
                <span className="source-emoji" aria-hidden="true">📷</span>
                <span>拍照识别</span>
              </button>
              <button type="button" className="import-source-tile" onClick={() => enterImport("text")} disabled={busy}>
                <span className="source-emoji" aria-hidden="true">📋</span>
                <span>粘贴文字</span>
              </button>
              <button type="button" className="import-source-tile" onClick={() => enterImport("web")} disabled={busy}>
                <span className="source-emoji" aria-hidden="true">🔗</span>
                <span>网页链接</span>
              </button>
              <button type="button" className="import-source-tile" onClick={() => enterImport("voice")} disabled={busy}>
                <span className="source-emoji" aria-hidden="true">🎙</span>
                <span>口述菜谱</span>
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
                <span>导入或 AI 生成的菜谱草稿会保存在这里等你核对。</span>
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
                      <button
                        type="button"
                        className="draft-confirm-pill"
                        onClick={() => onOpenDraft(draft)}
                        disabled={busy}
                      >
                        去确认
                      </button>
                    </div>
                  );
                })}
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
                      : importMode === "voice"
                        ? "口述菜谱"
                        : "粘贴文字导入"}
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
                      当前使用纯文本模型（{app.ai.textModel}），建议优先用「粘贴文字」或「网页链接」导入。
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
                    placeholder={
                      importMode === "voice"
                        ? "点右侧麦克风口述菜名、食材和做法，识别后自动填在这里"
                        : "粘贴小红书、下厨房或家人发来的菜谱文字"
                    }
                    autoFocus={importMode !== "voice"}
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
    await onComplete(values).catch(() => {});
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

function FamilySpaceTab({ app, totalRecipes, allRecipes, syncState, busy, onRefresh, onOpenCreate, onSignOut }) {
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const preferenceTags = [...new Set(allRecipes.map((r) => r.preferenceWarning).filter(Boolean))];

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1 className="header-title">家庭</h1>
          <p className="header-sub">{app.family.name}厨房 · 共享家庭空间</p>
        </div>
      </header>

      {/* Family Overview Card */}
      <section className="family-hero-card">
        <div className="family-hero-top">
          <div className="family-big-avatar" aria-hidden="true">🏠</div>
          <div>
            <h2>{app.family.name}厨房</h2>
            <p>{app.family.accessMode}共享 · 全家同步</p>
          </div>
        </div>
        <div className="family-stats-grid">
          <div>
            <strong>{app.ingredients.length}</strong>
            <span>可用食材</span>
          </div>
          <div>
            <strong>{totalRecipes}</strong>
            <span>正式菜谱</span>
          </div>
          <div>
            <strong>{app.drafts.length}</strong>
            <span>待确认草稿</span>
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
                ? `已启用（${app.ai.textModel || "已配置"}）· ${app.ai.visionModel ? "支持文字与拍照识别" : "支持文字与网页导入"}`
                : "未配置 AI 模型密钥"}
            </span>
          </div>
          <span className={`tag-pill ${app.ai.configured ? "tag-green" : "tag-orange"}`}>
            {app.ai.configured ? "已就绪" : "未配置"}
          </span>
        </div>
        {app.drafts.length > 0 && (
          <div className="settings-row">
            <div className="settings-row-text">
              <strong>待确认草稿</strong>
              <span>还有 {app.drafts.length} 份菜谱草稿未正式入库</span>
            </div>
            <button type="button" className="draft-confirm-pill" onClick={onOpenCreate}>
              去查看
            </button>
          </div>
        )}
      </section>

      {/* Pantry Section */}
      <section className="settings-card" aria-labelledby="pantry-heading">
        <div className="settings-block-head">
          <h3 id="pantry-heading">🧂 常备调味品</h3>
          <span>默认家里常有</span>
        </div>
        <p className="settings-desc">以下调味品在匹配菜谱时默认视为可用，不需要每天登记在可用食材清单中。</p>
        <div className="pantry-chips">
          {(app.pantry || []).map((name) => (
            <span key={name} className="pill-chip">
              <span aria-hidden="true">{getIngredientEmoji(name, "调味")}</span>
              <span>{name}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Preference Notes */}
      <section className="settings-card" aria-labelledby="pref-heading">
        <div className="settings-block-head">
          <h3 id="pref-heading">🌶 忌口与饮食提醒</h3>
          <span>参考提示</span>
        </div>
        <p className="settings-desc">
          带有忌口提醒的菜谱会在卡片上标注并在推荐排序中靠后，帮助家人快速判断是否适合今天烹饪。
        </p>
        {preferenceTags.length > 0 && (
          <div className="pantry-chips">
            {preferenceTags.map((warn) => (
              <span key={warn} className="tag-pill tag-red">
                ⚠️ {warn}
              </span>
            ))}
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
   AI INGREDIENT SELECTION SHEET
   ============================================================ */

function IngredientSelectionSheet({ categories, busy, error, onGenerate, onClose }) {
  const [selectedIds, setSelectedIds] = useState([]);

  useBodyLockAndEscape(busy, onClose);

  function toggleIngredient(id) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <section
        className="bottom-sheet editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ingredient-selection-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <header className="sheet-top-row padded">
          <div>
            <h2 id="ingredient-selection-title">选择想用的食材</h2>
            <p className="sheet-subtitle">不选时默认按全部食材推荐，优先消耗快过期食材</p>
          </div>
          <button className="sheet-close-btn" type="button" onClick={onClose} disabled={busy} aria-label="关闭食材选择">
            <X size={18} />
          </button>
        </header>

        <div className="sheet-scroll-body">
          {categories.map((category) => (
            <section className="selection-group" key={category.name} aria-labelledby={`selection-${category.name}`}>
              <h3 id={`selection-${category.name}`}>
                {CATEGORY_EMOJI[category.name]} {category.name}
              </h3>
              <div className="selection-chip-grid">
                {category.items.map((ingredient) => {
                  const selected = selectedIds.includes(ingredient.id);
                  return (
                    <button
                      key={ingredient.id}
                      className={`selection-pill ${selected ? "selected" : ""}`}
                      type="button"
                      aria-label={`选择${ingredient.name}`}
                      aria-pressed={selected}
                      onClick={() => toggleIngredient(ingredient.id)}
                      disabled={busy}
                    >
                      {selected ? (
                        <Check size={14} strokeWidth={2.8} aria-hidden="true" />
                      ) : (
                        <span aria-hidden="true">{getIngredientEmoji(ingredient.name, ingredient.category)}</span>
                      )}
                      <span>{ingredient.name}</span>
                      {stateShortLabels[ingredient.state] && (
                        <small className={`mini-state ${ingredient.state}`}>{stateShortLabels[ingredient.state]}</small>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {error && (
          <div className="form-error padded-x" role="alert">
            {error}
          </div>
        )}

        <div className="sheet-sticky-actions">
          {selectedIds.length > 0 && (
            <button className="btn-soft" type="button" onClick={() => setSelectedIds([])} disabled={busy}>
              清除选择
            </button>
          )}
          <button className="btn-primary flex1" type="button" onClick={() => onGenerate(selectedIds)} disabled={busy}>
            <Sparkles size={17} />
            {busy
              ? "AI 正在构思菜谱..."
              : selectedIds.length > 0
                ? `用已选 ${selectedIds.length} 种食材生成`
                : "用全部食材生成"}
          </button>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   INGREDIENT EDITOR SHEET
   ============================================================ */

function IngredientEditorSheet({ ingredient, busy, deleting, error, onSave, onDelete, onClose }) {
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
  const isDraft = recipe.status === "draft";
  const [form, setForm] = useState({
    id: recipe.id,
    title: recipe.title,
    method: recipe.method,
    minutes: recipe.minutes,
    preferenceWarning: recipe.preferenceWarning || "",
    ingredients: recipe.ingredients.map((item) => ({
      name: item.name,
      quantityLabel: item.quantityLabel || "",
      required: Boolean(item.required),
    })),
    steps: recipe.steps.map((step) => step.text),
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
            <h2 id="draft-editor-title">{isDraft ? "检查菜谱草稿" : "编辑菜谱"}</h2>
            <p className="sheet-subtitle">{isDraft ? "核对标题、食材和步骤后确认入库" : "修改后会立即重新匹配菜谱"}</p>
          </div>
          <button
            className="sheet-close-btn"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={isDraft ? "关闭草稿编辑" : "关闭菜谱编辑"}
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
                <span>{busy ? "正在保存..." : "保存修改"}</span>
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
  if (/^audio\/(webm|ogg|mpeg|mp3|wav|x-wav|flac|aac|aiff)/i.test(blob.type)) {
    return new Blob([blob], { type: blob.type.split(";")[0] });
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("当前浏览器不支持录音格式转换");
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(buffer);
  } finally {
    await context.close();
  }
}

function encodeWav(audioBuffer) {
  const samples = audioBuffer.getChannelData(0);
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
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  });
  return new Blob([data], { type: "audio/wav" });
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
