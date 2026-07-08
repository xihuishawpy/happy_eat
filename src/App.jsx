import {
  Bell,
  BookOpen,
  Bookmark,
  ChefHat,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  FileText,
  Image,
  Mic,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const tabs = [
  { id: "today", label: "今天做什么", icon: Utensils },
  { id: "ingredients", label: "食材", icon: ClipboardList },
  { id: "recipes", label: "菜谱", icon: BookOpen },
  { id: "drafts", label: "草稿", icon: FileText },
  { id: "prefs", label: "偏好", icon: Settings },
];

const stateLabels = {
  priority: "优先",
  expiring: "快过期",
  frozen: "冷冻",
  none: "",
};

const stateCycle = ["none", "priority", "expiring", "frozen"];

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("familyAccessToken") || "");
  const [app, setApp] = useState(null);
  const [activeTab, setActiveTab] = useState("today");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [matchTab, setMatchTab] = useState("ready");
  const [batchText, setBatchText] = useState("鸡蛋、番茄、牛肉");
  const [draftSource, setDraftSource] = useState("text");
  const [draftText, setDraftText] = useState("番茄鸡蛋面\n番茄2个、鸡蛋2个、面条100克、盐、生抽、香油、葱花。先炒番茄，再加水煮面，最后淋入蛋液。");
  const [draftImageDataUrl, setDraftImageDataUrl] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    api("/api/app", { token })
      .then((nextApp) => {
        setError("");
        setApp(nextApp);
      })
      .catch(() => {
        localStorage.removeItem("familyAccessToken");
        setToken("");
      });
  }, [token]);

  if (!token) {
    return <AccessGate onUnlock={(nextToken, nextApp) => {
      setToken(nextToken);
      setApp(nextApp);
    }} />;
  }

  if (!app) {
    return <div className="loading">正在打开家庭空间...</div>;
  }

  const visibleIngredients = filterIngredients(app.ingredients, selectedCategory);
  const ingredientPreview = activeTab === "today" ? sortTodayIngredients(visibleIngredients).slice(0, 4) : visibleIngredients;
  const readyCount = app.matches.ready.length;
  const missingCount = app.matches.missing.length;

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setApp(await api("/api/app", { token }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addBatchIngredients() {
    if (!batchText.trim()) return;
    setBusy(true);
    setError("");
    try {
      setApp(await api("/api/ingredients/batch", {
        token,
        method: "POST",
        body: { text: batchText },
      }));
      setBatchText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cycleIngredientState(ingredient) {
    const currentIndex = stateCycle.indexOf(ingredient.state);
    const state = stateCycle[(currentIndex + 1) % stateCycle.length];
    setBusy(true);
    setError("");
    try {
      setApp(await api(`/api/ingredients/${ingredient.id}`, {
        token,
        method: "PATCH",
        body: { state },
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeIngredient(id) {
    setBusy(true);
    setError("");
    try {
      setApp(await api(`/api/ingredients/${id}`, {
        token,
        method: "DELETE",
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function analyzeDraft() {
    setBusy(true);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function selectDraftImage(file) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setDraftImageDataUrl(dataUrl);
  }

  async function confirmDraft(id) {
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/drafts/${id}/confirm`, {
        token,
        method: "POST",
      });
      setApp(result.app);
      const savedRecipe = findRecipeById(result.app.matches, result.savedRecipeId);

      if (savedRecipe) {
        setActiveTab("recipes");
        setMatchTab(savedRecipe.missing.length > 0 ? "missing" : "ready");
        setSelectedRecipe(savedRecipe);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <ChefHat size={31} aria-hidden="true" />
          <span>Happy Eat</span>
        </div>
        <button className="family-button" type="button">
          <Users size={17} />
          <span>{app.family.name}</span>
          <span className="family-meta">单家庭</span>
          <ChevronDown size={16} />
        </button>
        <button className="sync-button" type="button" onClick={refresh} disabled={busy}>
          <RefreshCcw size={18} />
          <span>已同步</span>
        </button>
      </header>

      {error && <div className="notice">{error}</div>}

      <main className="mobile-main">
        {(activeTab === "today" || activeTab === "ingredients") && (
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
              <Mic size={21} aria-hidden="true" />
            </label>

            <div className="input-actions">
              <span className="example-chip">示例：鸡蛋、番茄、牛肉</span>
              <button className="primary-button" type="button" onClick={addBatchIngredients} disabled={busy}>
                <Sparkles size={18} />
                解析并添加
              </button>
            </div>
          </section>
        )}

        {(activeTab === "today" || activeTab === "ingredients") && (
          <section className="ingredient-browser" aria-label="食材分类">
            <CategoryRail
              categories={app.categories}
              selectedCategory={selectedCategory}
              onSelect={setSelectedCategory}
              total={app.ingredients.length}
            />
            <div className="chips-grid">
              {ingredientPreview.map((ingredient) => (
                <IngredientChip
                  key={ingredient.id}
                  ingredient={ingredient}
                  onCycleState={() => cycleIngredientState(ingredient)}
                  onRemove={() => removeIngredient(ingredient.id)}
                />
              ))}
              <button className="add-chip" type="button" onClick={() => setSelectedCategory("全部")}>
                <Plus size={16} />
                添加食材
              </button>
              {activeTab === "today" && visibleIngredients.length > ingredientPreview.length && (
                <button className="add-chip" type="button" onClick={() => setActiveTab("ingredients")}>
                  <MoreHorizontal size={16} />
                  查看全部
                </button>
              )}
            </div>
          </section>
        )}

        {(activeTab === "today" || activeTab === "recipes") && (
          <section className="panel matches-panel" aria-labelledby="matches-title">
            <div className="match-tabs" role="tablist" aria-labelledby="matches-title">
              <button
                className={matchTab === "ready" ? "active" : ""}
                type="button"
                onClick={() => setMatchTab("ready")}
              >
                可做菜谱（{readyCount}）
              </button>
              <button
                className={matchTab === "missing" ? "active" : ""}
                type="button"
                onClick={() => setMatchTab("missing")}
              >
                待补食材（{missingCount}）
              </button>
            </div>
            <RecipeList
              recipes={matchTab === "ready" ? app.matches.ready : app.matches.missing}
              onOpen={setSelectedRecipe}
            />
          </section>
        )}

        {(activeTab === "today" || activeTab === "drafts") && (
          <section className="draft-action">
            <button className="wide-primary" type="button" onClick={() => setActiveTab("drafts")}>
              <Plus size={24} />
              导入菜谱（AI 识别）
            </button>
          </section>
        )}

        {(activeTab === "today" || activeTab === "drafts") && (
          <section className="panel draft-panel" aria-labelledby="draft-title">
            <div className="section-title compact">
              <div>
                <h2 id="draft-title">AI 导入草稿</h2>
                <p>{app.ai?.configured ? `千问已配置：${app.ai.textModel}` : "未配置千问，使用本地解析"}</p>
              </div>
              <span className="status-pill">预览中</span>
            </div>

            <div className="source-tabs" role="tablist" aria-label="导入来源">
              <button className={draftSource === "text" ? "active" : ""} type="button" onClick={() => setDraftSource("text")}>文本</button>
              <button className={draftSource === "image" ? "active" : ""} type="button" onClick={() => setDraftSource("image")}>
                <Image size={16} />图片
              </button>
              <button className={draftSource === "web" ? "active" : ""} type="button" onClick={() => setDraftSource("web")}>网页链接</button>
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

            <button className="primary-button full" type="button" onClick={analyzeDraft} disabled={busy}>
              <Sparkles size={18} />
              AI 解析
            </button>

            <DraftList drafts={app.drafts} onConfirm={confirmDraft} />
          </section>
        )}

        {activeTab === "prefs" && (
          <section className="panel prefs-panel">
            <div className="section-title">
              <div>
                <h1>偏好设置</h1>
                <p>用于排序和忌口提示，不作为医疗级过滤</p>
              </div>
              <CircleHelp size={19} />
            </div>
            <div className="preference-list">
              {["少辣", "少油", "孩子能吃", "不吃香菜"].map((item) => (
                <label key={item} className="toggle-row">
                  <span>{item}</span>
                  <input type="checkbox" defaultChecked={item !== "不吃香菜"} />
                </label>
              ))}
            </div>
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
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon-wrap">
                <Icon size={25} />
                {count > 0 && <span className="badge">{count}</span>}
              </span>
              {tab.label}
            </button>
          );
        })}
      </nav>

      {selectedRecipe && (
        <RecipeDetailSheet
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
        />
      )}
    </div>
  );
}

function AccessGate({ onUnlock }) {
  const [accessCode, setAccessCode] = useState("happy-eat");
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
  const ordered = ["全部", "蔬菜", "肉禽蛋", "主食", "调味", "乳品", "其他"];

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
      <button className="icon-filter" type="button" aria-label="筛选">
        <SlidersHorizontal size={20} />
      </button>
    </div>
  );
}

function IngredientChip({ ingredient, onCycleState, onRemove }) {
  const stateLabel = stateLabels[ingredient.state] || "";

  return (
    <div className="ingredient-chip">
      <button type="button" onClick={onCycleState}>
        <span>{ingredient.name}</span>
        {ingredient.quantityLabel && <span className="quantity">× {ingredient.quantityLabel}</span>}
        {stateLabel && <span className={`state-tag ${ingredient.state}`}>{stateLabel}</span>}
      </button>
      <button className="delete-chip" type="button" onClick={onRemove} aria-label={`删除 ${ingredient.name}`}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function RecipeList({ recipes, onOpen }) {
  if (recipes.length === 0) {
    return <div className="empty">没有匹配结果，先更新可用食材清单。</div>;
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
              {recipe.usesPriority && <span className="state-tag priority">优先用掉食材</span>}
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
          <button
            className="bookmark-button"
            type="button"
            aria-label={`收藏 ${recipe.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <Bookmark size={23} />
          </button>
        </article>
      ))}
    </div>
  );
}

function RecipeDetailSheet({ recipe, onClose }) {
  const required = recipe.ingredients.filter((item) => item.required);
  const optional = recipe.ingredients.filter((item) => !item.required);

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
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
          <button className="close-button" type="button" onClick={onClose} aria-label="关闭菜谱详情">
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
      </section>
    </div>
  );
}

function DraftList({ drafts, onConfirm }) {
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
          <button className="primary-button full" type="button" onClick={() => onConfirm(draft.id)}>
            确认并保存到菜谱库
          </button>
        </article>
      ))}
    </div>
  );
}

function filterIngredients(ingredients, category) {
  if (category === "全部") return ingredients;
  return ingredients.filter((ingredient) => ingredient.category === category);
}

function sortTodayIngredients(ingredients) {
  const stateRank = {
    expiring: 0,
    priority: 1,
    frozen: 2,
    none: 3,
  };

  return [...ingredients].sort((a, b) => {
    const byState = (stateRank[a.state] ?? 3) - (stateRank[b.state] ?? 3);
    if (byState !== 0) return byState;
    return a.name.localeCompare(b.name, "zh-CN");
  });
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
    throw new Error(payload.error || "请求失败");
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
