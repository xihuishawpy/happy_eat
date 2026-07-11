import {
  Bell,
  BookOpen,
  ChefHat,
  Check,
  ChevronLeft,
  ClipboardList,
  Clock3,
  FileText,
  Image,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const tabs = [
  { id: "today", label: "今天做什么", shortLabel: "今天", icon: Utensils },
  { id: "ingredients", label: "食材", icon: ClipboardList },
  { id: "recipes", label: "菜谱", icon: BookOpen },
  { id: "drafts", label: "草稿", icon: FileText },
];

const ingredientCategories = ["蔬菜", "肉禽蛋", "主食", "调味", "乳品", "其他"];

const ingredientStates = [
  { value: "none", label: "普通" },
  { value: "priority", label: "优先用掉" },
  { value: "expiring", label: "快过期" },
  { value: "frozen", label: "冷冻中" },
];

const stateLabels = {
  priority: "优先",
  expiring: "快过期",
  frozen: "冷冻",
  none: "",
};

const cookingMethods = ["炒", "煮", "蒸", "煎", "烤", "凉拌", "炖", "其他"];

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("familyAccessToken") || "");
  const [app, setApp] = useState(null);
  const [activeTab, setActiveTab] = useState("today");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [matchTab, setMatchTab] = useState("ready");
  const [recipeQuery, setRecipeQuery] = useState("");
  const [recipeMethod, setRecipeMethod] = useState("");
  const [recipeTime, setRecipeTime] = useState("");
  const [batchText, setBatchText] = useState("");
  const [showTodayIngredientInput, setShowTodayIngredientInput] = useState(false);
  const [draftSource, setDraftSource] = useState("text");
  const [draftText, setDraftText] = useState("");
  const [draftImageDataUrl, setDraftImageDataUrl] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [cookingRecipe, setCookingRecipe] = useState(null);
  const [ingredientEditor, setIngredientEditor] = useState(null);
  const [draftEditor, setDraftEditor] = useState(null);
  const [recipeEditor, setRecipeEditor] = useState(null);
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [syncState, setSyncState] = useState("synced");
  const busy = Boolean(pendingAction);
  const draftSourceReady = draftSource === "image" ? Boolean(draftImageDataUrl) : Boolean(draftText.trim());

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

  if (!token) {
    return <AccessGate onUnlock={(nextToken, nextApp) => {
      setToken(nextToken);
      setApp(nextApp);
    }} />;
  }

  if (!app) {
    return (
      <div className="loading">
        {error ? (
          <div className="loading-error" role="alert">
            <strong>家庭空间暂时无法打开</strong>
            <span>{error}</span>
            <button className="secondary-button" type="button" onClick={() => window.location.reload()}>重试</button>
          </div>
        ) : "正在打开家庭空间..."}
      </div>
    );
  }

  const visibleIngredients = filterIngredients(app.ingredients, selectedCategory, ingredientQuery);
  const filteredReady = activeTab === "recipes" ? filterRecipes(app.matches.ready, recipeQuery, recipeMethod, recipeTime) : app.matches.ready;
  const filteredMissing = activeTab === "recipes" ? filterRecipes(app.matches.missing, recipeQuery, recipeMethod, recipeTime) : app.matches.missing;
  const recipeMethods = [...new Set([...app.matches.ready, ...app.matches.missing].map((recipe) => recipe.method))];
  const readyCount = filteredReady.length;
  const missingCount = filteredMissing.length;

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

  async function addBatchIngredients() {
    if (!batchText.trim()) return;
    setPendingAction("batch");
    setSyncState("syncing");
    setError("");
    try {
      setApp(await api("/api/ingredients/batch", {
        token,
        method: "POST",
        body: { text: batchText },
      }));
      setBatchText("");
      setShowTodayIngredientInput(false);
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
      setApp(await api(editing ? `/api/ingredients/${ingredient.id}` : "/api/ingredients", {
        token,
        method: editing ? "PATCH" : "POST",
        body: {
          name: ingredient.name,
          category: ingredient.category,
          state: ingredient.state,
        },
      }));
      setSelectedCategory("全部");
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
      setApp(await api(`/api/ingredients/${id}`, {
        token,
        method: "DELETE",
      }));
      setSelectedCategory("全部");
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
      setActiveTab("drafts");
      setSyncState("synced");
    } catch (err) {
      setError(err.message);
      setSyncState("error");
    } finally {
      setPendingAction("");
    }
  }

  async function selectDraftImage(file) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setDraftImageDataUrl(dataUrl);
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
      const savedRecipe = findRecipeById(result.app.matches, result.savedRecipeId);

      if (savedRecipe) {
        setActiveTab("recipes");
        setMatchTab(savedRecipe.missing.length > 0 ? "missing" : "ready");
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

  async function generateRecipe() {
    setPendingAction("recipe-generate");
    setSyncState("syncing");
    setError("");
    try {
      const result = await api("/api/recipes/generate", { token, method: "POST" });
      setApp(result.app);
      setActiveTab("drafts");
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

  function clearRecipeFilters() {
    setRecipeQuery("");
    setRecipeMethod("");
    setRecipeTime("");
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="topbar">
        <div className="brand">
          <ChefHat size={31} aria-hidden="true" />
          <span>Happy Eat</span>
        </div>
        <div className="family-summary" aria-label={`家庭空间：${app.family.name}`}>
          <Users size={17} />
          <span>{app.family.name}</span>
          <span className="family-meta">单家庭</span>
        </div>
        <button className={`sync-button ${syncState}`} type="button" onClick={refresh} disabled={busy}>
          <RefreshCcw size={18} />
          <span>{syncState === "syncing" ? "同步中" : syncState === "error" ? "同步失败" : "已同步"}</span>
        </button>
      </header>

      {error && !ingredientEditor && (
        <div className="notice" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="关闭错误提示">
            <X size={18} />
          </button>
        </div>
      )}

      <main className="mobile-main" id="main-content">
        {activeTab === "ingredients" && (
          <section className="panel ingredient-panel" aria-labelledby="ingredient-title">
            <div className="section-title">
              <div>
                <h1 id="ingredient-title">更新可用食材清单</h1>
                <p>自然语言录入，系统归一并分类</p>
              </div>
              <button className="text-button" type="button" onClick={() => setBatchText("")}>清空</button>
            </div>

            <label className="input-wrap">
              <textarea
                value={batchText}
                onChange={(event) => setBatchText(event.target.value)}
                placeholder="家里还有什么食材？"
                rows={2}
              />
            </label>

            <div className="input-actions">
              <span className="example-chip">示例：鸡蛋、番茄、牛肉</span>
              <button className="primary-button" type="button" onClick={addBatchIngredients} disabled={busy}>
                <Sparkles size={18} />
                {pendingAction === "batch" ? "正在添加" : "解析并添加"}
              </button>
            </div>
          </section>
        )}

        {activeTab === "ingredients" && (
          <section className="ingredient-browser" aria-label="食材分类">
            <div className="ingredient-tools">
              <label className="search-field">
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={ingredientQuery}
                  onChange={(event) => setIngredientQuery(event.target.value)}
                  placeholder="搜索食材"
                  aria-label="搜索食材"
                />
              </label>
              <CategoryRail
                categories={app.categories}
                selectedCategory={selectedCategory}
                onSelect={setSelectedCategory}
                total={app.ingredients.length}
              />
            </div>
            <div className="chips-grid">
              {visibleIngredients.map((ingredient) => (
                <IngredientChip
                  key={ingredient.id}
                  ingredient={ingredient}
                  onEdit={() => openIngredient(ingredient)}
                  disabled={busy}
                />
              ))}
              {visibleIngredients.length === 0 && <div className="empty">没有找到食材。</div>}
            </div>
            <button className="ingredient-fab" type="button" onClick={openNewIngredient} aria-label="添加食材">
              <Plus size={22} />
            </button>
          </section>
        )}

        {(activeTab === "today" || activeTab === "recipes") && (
          <section className="panel matches-panel" aria-label="菜谱匹配">
            {activeTab === "recipes" && (
              <div className="recipe-filters" aria-label="菜谱筛选">
                <label className="search-field recipe-search">
                  <Search size={18} aria-hidden="true" />
                  <input
                    type="search"
                    value={recipeQuery}
                    onChange={(event) => setRecipeQuery(event.target.value)}
                    placeholder="搜索菜谱或食材"
                    aria-label="搜索菜谱或食材"
                  />
                </label>
                <div className="filter-row">
                  <label>
                    <span>烹饪方式</span>
                    <select value={recipeMethod} onChange={(event) => setRecipeMethod(event.target.value)}>
                      <option value="">全部</option>
                      {recipeMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>烹饪时间</span>
                    <select value={recipeTime} onChange={(event) => setRecipeTime(event.target.value)}>
                      <option value="">全部</option>
                      <option value="15">15 分钟内</option>
                      <option value="30">30 分钟内</option>
                      <option value="long">30 分钟以上</option>
                    </select>
                  </label>
                  {(recipeQuery || recipeMethod || recipeTime) && (
                    <button className="text-button" type="button" onClick={clearRecipeFilters}>清除</button>
                  )}
                </div>
              </div>
            )}
            <div className="match-tabs" role="tablist" aria-label="菜谱匹配结果">
              <button
                className={matchTab === "ready" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={matchTab === "ready"}
                onClick={() => setMatchTab("ready")}
              >
                可做菜谱（{readyCount}）
              </button>
              <button
                className={matchTab === "missing" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={matchTab === "missing"}
                onClick={() => setMatchTab("missing")}
              >
                待补食材（{missingCount}）
              </button>
            </div>
            {[...filteredReady, ...filteredMissing].some((recipe) => recipe.usesPriority) && (
              <p className="priority-note">当前结果包含会用到优先处理食材的菜谱。</p>
            )}
            <RecipeList
              recipes={matchTab === "ready" ? filteredReady : filteredMissing}
              onOpen={setSelectedRecipe}
              emptyMessage={matchTab === "ready"
                ? "当前还没有可做菜谱，补充食材后会自动更新。"
                : "目前没有待补食材菜谱。"}
            />
          </section>
        )}

        {activeTab === "today" && (
          <section className="panel today-ingredient-entry" aria-labelledby="today-ingredient-title">
            <div className="section-title compact">
              <div>
                <h2 id="today-ingredient-title">家里食材有变化？</h2>
                <p>更新后可做菜谱会立即重排。</p>
              </div>
              <button className="text-button" type="button" onClick={() => setShowTodayIngredientInput((current) => !current)}>
                {showTodayIngredientInput ? "收起" : "更新食材"}
              </button>
            </div>
            {showTodayIngredientInput && (
              <div className="today-ingredient-form">
                <label className="input-wrap">
                  <textarea
                    value={batchText}
                    onChange={(event) => setBatchText(event.target.value)}
                    placeholder="例如：鸡蛋、番茄、冷冻虾仁"
                    rows={2}
                    autoFocus
                  />
                </label>
                <button className="primary-button" type="button" onClick={addBatchIngredients} disabled={busy || !batchText.trim()}>
                  <Sparkles size={18} />
                  {pendingAction === "batch" ? "正在添加" : "解析并添加"}
                </button>
              </div>
            )}
          </section>
        )}

        {activeTab === "today" && (
          <section className="draft-action">
            <button
              className="wide-primary"
              type="button"
              onClick={generateRecipe}
              disabled={busy || !app.ai.configured || app.ingredients.length === 0}
            >
              <Sparkles size={22} />
              {pendingAction === "recipe-generate" ? "正在生成菜谱" : "AI 生成菜谱"}
            </button>
            <button className="secondary-button" type="button" onClick={() => setActiveTab("drafts")} disabled={busy}>
              <Plus size={24} />
              导入菜谱
            </button>
          </section>
        )}

        {activeTab === "drafts" && (
          <section className="panel draft-panel" aria-labelledby="draft-title">
            <div className="section-title compact">
              <div>
                <h2 id="draft-title">导入菜谱</h2>
                <p>解析后先检查草稿，确认后才进入菜谱库。</p>
              </div>
            </div>

            <div className="source-tabs" role="tablist" aria-label="导入来源">
              <button className={draftSource === "text" ? "active" : ""} type="button" role="tab" aria-selected={draftSource === "text"} onClick={() => setDraftSource("text")}>文本</button>
              <button className={draftSource === "image" ? "active" : ""} type="button" role="tab" aria-selected={draftSource === "image"} onClick={() => setDraftSource("image")}>
                <Image size={16} />图片
              </button>
              <button className={draftSource === "web" ? "active" : ""} type="button" role="tab" aria-selected={draftSource === "web"} onClick={() => setDraftSource("web")}>网页链接</button>
            </div>

            {draftSource === "image" ? (
              <div className="image-upload">
                <label>
                  <Image size={18} />
                  <span>{draftImageDataUrl ? "更换菜谱图片" : "选择菜谱图片"}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => selectDraftImage(event.target.files?.[0])}
                  />
                </label>
                {draftImageDataUrl && <img src={draftImageDataUrl} alt="菜谱图片预览" />}
                <textarea
                  className="draft-input"
                  value={draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                  rows={2}
                  placeholder="可选：补充图片来源或备注"
                />
              </div>
            ) : (
              <textarea
                className="draft-input"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                rows={draftSource === "web" ? 2 : 4}
                placeholder={draftSource === "web" ? "粘贴菜谱网页链接" : "粘贴菜谱文本"}
              />
            )}

            <button className="primary-button full" type="button" onClick={analyzeDraft} disabled={busy || !draftSourceReady}>
              <Sparkles size={18} />
              {pendingAction === "draft-analyze" ? "正在解析" : "解析为草稿"}
            </button>

            <DraftList
              drafts={app.drafts}
              onEdit={setDraftEditor}
              disabled={busy}
            />
          </section>
        )}

      </main>

      <nav className="bottom-nav" aria-label="主导航">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const count = tab.id === "drafts" ? app.drafts.length : 0;
          return (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              type="button"
              aria-label={tab.label}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon-wrap">
                <Icon size={25} />
                {count > 0 && <span className="badge">{count}</span>}
              </span>
              {tab.shortLabel || tab.label}
            </button>
          );
        })}
      </nav>

      {selectedRecipe && (
        <RecipeDetailSheet
          recipe={selectedRecipe}
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
          }}
        />
      )}

      {cookingRecipe && <CookingMode recipe={cookingRecipe} onClose={() => setCookingRecipe(null)} />}

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
  );
}

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
      const app = await api("/api/app", { token: result.token });
      onUnlock(result.token, app);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="access-page">
      <form className="access-card" onSubmit={unlock}>
        <div className="brand access-brand">
          <ChefHat size={34} />
          <span>Happy Eat</span>
        </div>
        <h1>打开家庭空间</h1>
        <p>输入家庭访问码，查看和维护真实家庭食材与菜谱。</p>
        <input
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          aria-label="家庭访问码"
          autoFocus
        />
        {error && <div className="notice">{error}</div>}
        <button className="wide-primary" type="submit" disabled={busy}>
          进入
        </button>
      </form>
    </main>
  );
}

function CategoryRail({ categories, selectedCategory, onSelect, total }) {
  const counts = useMemo(() => {
    const entries = new Map(categories.map((category) => [category.name, category.items.length]));
    entries.set("全部", total);
    return entries;
  }, [categories, total]);
  const ordered = ["全部", ...ingredientCategories];

  return (
    <div className="category-rail">
      {ordered.filter((name) => counts.has(name)).map((name) => (
        <button
          key={name}
          className={selectedCategory === name ? "active" : ""}
          type="button"
          onClick={() => onSelect(name)}
        >
          {name} <span>{counts.get(name)}</span>
        </button>
      ))}
    </div>
  );
}

function IngredientChip({ ingredient, onEdit, disabled }) {
  const stateLabel = stateLabels[ingredient.state] || "";

  return (
    <button
      className="ingredient-chip"
      type="button"
      onClick={onEdit}
      disabled={disabled}
      aria-label={`编辑${ingredient.name}`}
    >
      <span className="ingredient-summary">
        <span className="ingredient-name">{ingredient.name}</span>
        {stateLabel && <span className={`state-tag ${ingredient.state}`}>{stateLabel}</span>}
      </span>
      <Pencil size={15} aria-hidden="true" />
    </button>
  );
}

function RecipeList({ recipes, onOpen, emptyMessage }) {
  if (recipes.length === 0) {
    return <div className="empty">{emptyMessage}</div>;
  }

  return (
    <div className="recipe-list">
      {recipes.map((recipe) => (
        <article
          className="recipe-row"
          key={recipe.id}
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
          <div className="recipe-main">
            <div className="recipe-title-line">
              <h3>{recipe.title}</h3>
              {recipe.preferenceWarning && <span className="state-tag expiring">{recipe.preferenceWarning}</span>}
            </div>
            <div className="recipe-meta">
              <span><Clock3 size={15} />{recipe.minutes} 分钟</span>
              <span><ChefHat size={15} />{recipe.method}</span>
            </div>
            {recipe.missing.length > 0 ? (
              <p className="missing-line">缺：{recipe.missing.join("、")}</p>
            ) : (
              <p>{recipe.ingredients.filter((item) => item.required).map((item) => item.name).join("、")}</p>
            )}
            {recipe.substitutions.length > 0 && <p className="substitution">{recipe.substitutions[0]}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}

function IngredientEditorSheet({ ingredient, busy, deleting, error, onSave, onDelete, onClose }) {
  const editing = Boolean(ingredient.id);
  const [form, setForm] = useState({ ...ingredient });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event) {
      if (event.key === "Escape" && !busy) onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onClose]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSave({ ...form, name: form.name.trim() });
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <section
        className="ingredient-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ingredient-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <div>
            <h2 id="ingredient-sheet-title">{editing ? "编辑食材" : "添加食材"}</h2>
            <p>{editing ? "修改后会立即更新菜谱匹配。" : "记录家里现在能用来做饭的食材。"}</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} disabled={busy} aria-label="关闭食材编辑">
            <X size={23} />
          </button>
        </header>

        <form className="ingredient-form" onSubmit={submit}>
          <label className="form-field">
            <span>食材名称</span>
            <input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              maxLength={40}
              autoFocus
              required
            />
          </label>

          <fieldset className="option-field">
            <legend>食材分类</legend>
            <div className="option-grid category-options">
              {[{ value: "", label: "自动分类" }, ...ingredientCategories.map((category) => ({ value: category, label: category }))].map((option) => (
                <label key={option.label} className={form.category === option.value ? "selected" : ""}>
                  <input
                    type="radio"
                    name="ingredient-category"
                    value={option.value}
                    checked={form.category === option.value}
                    onChange={(event) => update("category", event.target.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="option-field">
            <legend>做饭提示</legend>
            <div className="option-grid state-options">
              {ingredientStates.map((option) => (
                <label key={option.value} className={form.state === option.value ? `selected ${option.value}` : ""}>
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

          {error && <div className="form-error" role="alert">{error}</div>}

          {confirmDelete ? (
            <div className="delete-confirmation">
              <p>确认删除“{form.name}”？可做菜谱会立即重新匹配。</p>
              <div>
                <button className="secondary-button" type="button" onClick={() => setConfirmDelete(false)} disabled={busy}>取消</button>
                <button className="danger-button solid" type="button" onClick={() => onDelete(form.id)} disabled={busy}>
                  {deleting ? "正在删除" : "确认删除"}
                </button>
              </div>
            </div>
          ) : (
            <div className="form-actions">
              {editing && (
                <button className="danger-button" type="button" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  <Trash2 size={18} />
                  删除食材
                </button>
              )}
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "正在保存" : editing ? "保存修改" : "保存食材"}
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateIngredient(index, field, value) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  }

  function removeIngredient(index) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, itemIndex) => itemIndex !== index),
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
      steps: current.steps.map((step, stepIndex) => stepIndex === index ? value : step),
    }));
  }

  function removeStep(index) {
    setForm((current) => ({
      ...current,
      steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
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
      ingredients: form.ingredients.map((item) => ({ ...item, name: item.name.trim(), quantityLabel: item.quantityLabel.trim() })),
      steps: form.steps.map((step) => step.trim()),
    };
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <section className="draft-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="draft-editor-title" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <div>
            <h2 id="draft-editor-title">{isDraft ? "检查菜谱草稿" : "编辑菜谱"}</h2>
            <p>{isDraft ? "确认标题、食材和步骤后再保存到菜谱库。" : "修改后会立即更新菜谱匹配。"}</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} disabled={busy} aria-label={isDraft ? "关闭草稿编辑" : "关闭菜谱编辑"}>
            <X size={23} />
          </button>
        </header>

        <form className="draft-editor-form" onSubmit={(event) => {
          event.preventDefault();
          onSave(payload(), isDraft && event.nativeEvent.submitter?.value === "confirm");
        }}>
          <label className="form-field">
            <span>菜谱标题</span>
            <input value={form.title} onChange={(event) => update("title", event.target.value)} maxLength={40} required />
          </label>

          <div className="draft-meta-fields">
            <label className="form-field">
              <span>烹饪方式</span>
              <select value={form.method} onChange={(event) => update("method", event.target.value)}>
                {cookingMethods.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>烹饪时间（分钟）</span>
              <input type="number" min="1" max="240" value={form.minutes} onChange={(event) => update("minutes", event.target.value)} required />
            </label>
          </div>

          <section className="draft-edit-section" aria-labelledby="draft-ingredients-title">
            <div className="draft-edit-heading">
              <h3 id="draft-ingredients-title">食材</h3>
              <button className="text-button" type="button" onClick={addIngredient} aria-label="添加食材项"><Plus size={16} />添加</button>
            </div>
            <div className="draft-edit-list">
              {form.ingredients.map((item, index) => (
                <div className="draft-ingredient-row" key={index}>
                  <label>
                    <span className="sr-only">食材名称 {index + 1}</span>
                    <input value={item.name} onChange={(event) => updateIngredient(index, "name", event.target.value)} placeholder="食材名称" required />
                  </label>
                  <label>
                    <span className="sr-only">食材用量 {index + 1}</span>
                    <input value={item.quantityLabel} onChange={(event) => updateIngredient(index, "quantityLabel", event.target.value)} placeholder="参考用量" />
                  </label>
                  <label className="required-toggle">
                    <input type="checkbox" checked={item.required} onChange={(event) => updateIngredient(index, "required", event.target.checked)} />
                    <span>必需</span>
                  </label>
                  <button className="icon-button" type="button" onClick={() => removeIngredient(index)} aria-label={`删除食材 ${index + 1}`} title="删除食材">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="draft-edit-section" aria-labelledby="draft-steps-title">
            <div className="draft-edit-heading">
              <h3 id="draft-steps-title">烹饪步骤</h3>
              <button className="text-button" type="button" onClick={addStep} aria-label="添加烹饪步骤"><Plus size={16} />添加</button>
            </div>
            <div className="draft-edit-list">
              {form.steps.map((step, index) => (
                <div className="draft-step-row" key={index}>
                  <span>{index + 1}</span>
                  <label>
                    <span className="sr-only">烹饪步骤 {index + 1}</span>
                    <textarea value={step} onChange={(event) => updateStep(index, event.target.value)} rows={2} required />
                  </label>
                  <button className="icon-button" type="button" onClick={() => removeStep(index)} aria-label={`删除步骤 ${index + 1}`} title="删除步骤">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="draft-editor-actions">
            {isDraft ? (
              <>
                <button className="secondary-button" type="submit" value="save" disabled={busy}>
                  <Save size={18} />
                  {busy ? "正在保存" : "保存草稿"}
                </button>
                <button className="primary-button" type="submit" value="confirm" disabled={busy}>
                  <Check size={18} />
                  {busy ? "正在保存" : "确认并保存"}
                </button>
              </>
            ) : (
              <button className="primary-button full" type="submit" disabled={busy}>
                <Save size={18} />
                {busy ? "正在保存" : "保存修改"}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function CookingMode({ recipe, onClose }) {
  const required = recipe.ingredients.filter((item) => item.required);
  const storageKey = `happy-eat-cooking-${recipe.id}`;
  const [progress, setProgress] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey)) || { ingredients: [], steps: [] };
    } catch {
      return { ingredients: [], steps: [] };
    }
  });

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(progress));
  }, [progress, storageKey]);

  function toggle(group, value) {
    setProgress((current) => ({
      ...current,
      [group]: current[group].includes(value)
        ? current[group].filter((item) => item !== value)
        : [...current[group], value],
    }));
  }

  const completed = progress.ingredients.length + progress.steps.length;
  const total = required.length + recipe.steps.length;

  return (
    <div className="cooking-mode" role="dialog" aria-modal="true" aria-labelledby="cooking-title">
      <header className="cooking-header">
        <button className="icon-button" type="button" onClick={onClose} aria-label="返回菜谱详情" title="返回">
          <ChevronLeft size={24} />
        </button>
        <div>
          <p>正在烹饪</p>
          <h2 id="cooking-title">{recipe.title}</h2>
        </div>
        <span>{completed}/{total}</span>
      </header>

      <main className="cooking-content">
        <section aria-labelledby="cooking-ingredients-title">
          <h3 id="cooking-ingredients-title">准备食材</h3>
          <div className="cooking-checklist">
            {required.map((item, index) => {
              const key = `${index}-${item.name}`;
              return (
                <label key={key}>
                  <input type="checkbox" checked={progress.ingredients.includes(key)} onChange={() => toggle("ingredients", key)} />
                  <span>{item.name}{item.quantityLabel && ` · ${item.quantityLabel}`}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="cooking-steps-title">
          <h3 id="cooking-steps-title">烹饪步骤</h3>
          <div className="cooking-checklist cooking-steps">
            {recipe.steps.map((step, index) => {
              const key = String(step.position);
              return (
                <label key={key}>
                  <input type="checkbox" checked={progress.steps.includes(key)} onChange={() => toggle("steps", key)} />
                  <span><strong>{index + 1}</strong>{step.text}</span>
                </label>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function RecipeDetailSheet({ recipe, busy, deleting, error, onEdit, onDelete, onClose, onStartCooking }) {
  const required = recipe.ingredients.filter((item) => item.required);
  const optional = recipe.ingredients.filter((item) => !item.required);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <section
        className="recipe-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <div>
            <h2 id="recipe-sheet-title">{recipe.title}</h2>
            <div className="recipe-meta">
              <span><Clock3 size={15} />{recipe.minutes} 分钟</span>
              <span><ChefHat size={15} />{recipe.method}</span>
            </div>
          </div>
          <button className="close-button" type="button" onClick={onClose} disabled={busy} aria-label="关闭菜谱详情">
            <X size={23} />
          </button>
        </header>

        {recipe.preferenceWarning && <p className="detail-warning">{recipe.preferenceWarning}</p>}
        {recipe.missing.length > 0 && <p className="detail-missing">缺：{recipe.missing.join("、")}</p>}
        {recipe.substitutions.length > 0 && (
          <div className="detail-block">
            <h3>替代建议</h3>
            <ul>
              {recipe.substitutions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}

        <div className="detail-block">
          <h3>必需食材</h3>
          <div className="mini-chips">
            {required.map((item) => (
              <span key={`required-${item.name}`}>{item.name}{item.quantityLabel && ` × ${item.quantityLabel}`}</span>
            ))}
          </div>
        </div>

        {optional.length > 0 && (
          <div className="detail-block">
            <h3>可选食材</h3>
            <div className="mini-chips">
              {optional.map((item) => (
                <span key={`optional-${item.name}`}>{item.name}{item.quantityLabel && ` × ${item.quantityLabel}`}</span>
              ))}
            </div>
          </div>
        )}

        <div className="detail-block">
          <h3>烹饪步骤</h3>
          <ol className="step-list">
            {recipe.steps.map((step) => (
              <li key={step.position}>{step.text}</li>
            ))}
          </ol>
        </div>

        {error && <div className="form-error recipe-detail-error" role="alert">{error}</div>}

        {confirmDelete ? (
          <div className="delete-confirmation recipe-delete-confirmation">
            <p>确认删除“{recipe.title}”？删除后无法恢复。</p>
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmDelete(false)} disabled={busy}>取消</button>
              <button className="danger-button solid" type="button" onClick={() => onDelete(recipe.id)} disabled={busy}>
                {deleting ? "正在删除" : "确认删除"}
              </button>
            </div>
          </div>
        ) : (
          <div className="recipe-detail-actions">
            <button className="secondary-button" type="button" onClick={onEdit} disabled={busy}>
              <Pencil size={18} />
              编辑菜谱
            </button>
            <button className="danger-button" type="button" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 size={18} />
              删除菜谱
            </button>
            <button className="primary-button" type="button" onClick={onStartCooking} disabled={busy}>
              <Play size={18} />
              开始烹饪
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function DraftList({ drafts, onEdit, disabled }) {
  if (drafts.length === 0) {
    return (
      <div className="draft-empty">
        <Bell size={18} />
        <span>解析后会先生成菜谱草稿，确认后才进入菜谱库。</span>
      </div>
    );
  }

  return (
    <div className="draft-list">
      {drafts.map((draft) => (
        <article key={draft.id} className="draft-card">
          <div className="draft-header">
            <h3>{draft.title}</h3>
            <span>{draft.method} · {draft.minutes} 分钟</span>
          </div>
          <div className="draft-columns">
            <div>
              <h4>必需食材</h4>
              <div className="mini-chips">
                {draft.ingredients.filter((item) => item.required).map((item) => (
                  <span key={`${draft.id}-${item.name}`}>{item.name}{item.quantityLabel && ` × ${item.quantityLabel}`}</span>
                ))}
              </div>
            </div>
            <div>
              <h4>步骤</h4>
              <ol>
                {draft.steps.slice(0, 3).map((step) => (
                  <li key={step.position}>{step.text}</li>
                ))}
              </ol>
            </div>
          </div>
          <button className="primary-button full" type="button" onClick={() => onEdit(draft)} disabled={disabled}>
            <Pencil size={17} />
            检查草稿
          </button>
        </article>
      ))}
    </div>
  );
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
    const matchesQuery = !normalizedQuery
      || recipe.title.includes(normalizedQuery)
      || recipe.ingredients.some((item) => item.name.includes(normalizedQuery));
    const matchesMethod = !method || recipe.method === method;
    const matchesTime = !time
      || (time === "long" ? recipe.minutes > 30 : recipe.minutes <= Number(time));
    return matchesQuery && matchesMethod && matchesTime;
  });
}

function normalizeSearchTerm(value) {
  const query = String(value || "").trim();
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
  return aliases.get(query) || query;
}

function findRecipeById(matches, recipeId) {
  return [...matches.ready, ...matches.missing].find((recipe) => recipe.id === recipeId);
}

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  };
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "请求失败");
    error.status = response.status;
    throw error;
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
