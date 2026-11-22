import {
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  LoaderCircle,
  Plus,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PREGNANCY_DISCLAIMER,
  PREGNANCY_LEVEL_META,
  evaluateIngredientPregnancy,
} from "../shared/pregnancy.js";
import {
  CATEGORY_EMOJI,
  getIngredientEmoji,
  getMethodEmoji,
  getRecipeVisual,
} from "./foodEmoji.js";

const RECENT_COOKED_KEY = "happy-eat-recent-cooked-meals";
const RECENT_PLAN_PREFIX = "happy-eat-recent-plan-";

function readStoredTitleList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.map((t) => String(t || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function appendStoredTitleList(key, titles, maxLen = 16) {
  const incoming = (Array.isArray(titles) ? titles : []).map((t) => String(t || "").trim()).filter(Boolean);
  if (incoming.length === 0) return readStoredTitleList(key);
  const existing = readStoredTitleList(key).filter((t) => !incoming.includes(t));
  const next = [...existing, ...incoming].slice(-maxLen);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Ignore storage quota / private mode errors
  }
  return next;
}

export function recordCookedMealTitle(title) {
  if (!title) return;
  appendStoredTitleList(RECENT_COOKED_KEY, [title], 10);
}

export function PregnancyBadge({ level, compact = false }) {
  if (!level) return null;
  const meta = PREGNANCY_LEVEL_META[level] || PREGNANCY_LEVEL_META.unknown;
  const icon = level === "safe" ? "✓" : level === "caution" ? "⚠" : level === "avoid" ? "✕" : "?";
  return (
    <span className={`preg-pill preg-${level} ${compact ? "compact" : ""}`}>
      <span aria-hidden="true">{icon}</span>
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </span>
  );
}

export function PregnancyInfoBox({ name, stored = null, compact = false }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const info = evaluateIngredientPregnancy(trimmed, stored);

  return (
    <div className={`preg-info-box preg-${info.level} ${compact ? "compact" : ""}`} role="status">
      <div className="preg-info-head">
        {info.level === "safe" ? (
          <ShieldCheck size={15} aria-hidden="true" />
        ) : (
          <ShieldAlert size={15} aria-hidden="true" />
        )}
        <strong>孕期食用提示：{info.label}</strong>
      </div>
      <p className="preg-info-note">{info.note}</p>
      {!compact && <span className="preg-disclaimer">{PREGNANCY_DISCLAIMER}</span>}
    </div>
  );
}

export function PregnancyAlertBanner({ alert, onClose }) {
  if (!alert || !Array.isArray(alert.items) || alert.items.length === 0) return null;

  const avoidItems = alert.items.filter((i) => i.pregnancyLevel === "avoid");
  const cautionItems = alert.items.filter((i) => i.pregnancyLevel === "caution");
  const unknownItems = alert.items.filter((i) => i.pregnancyLevel === "unknown");
  const safeCount = alert.items.filter((i) => i.pregnancyLevel === "safe").length;
  const flagged = [...avoidItems, ...cautionItems, ...unknownItems];
  const severity = avoidItems.length > 0 ? "avoid" : cautionItems.length > 0 ? "caution" : "unknown";

  return (
    <section className={`preg-alert-card preg-${severity}`} role="alert" aria-label="新增食材孕期提醒">
      <div className="preg-alert-head">
        <div className="preg-alert-title">
          <ShieldAlert size={17} aria-hidden="true" />
          <strong>
            {avoidItems.length > 0
              ? `新增食材含 ${avoidItems.length} 项孕期建议避免`
              : cautionItems.length > 0
                ? `新增食材含 ${cautionItems.length} 项孕期慎吃`
                : `新增食材中有 ${unknownItems.length} 项建议核实`}
          </strong>
        </div>
        <button type="button" className="preg-alert-close" onClick={onClose} aria-label="关闭孕期提醒">
          <X size={16} />
        </button>
      </div>

      <ul className="preg-alert-list">
        {flagged.map((item) => (
          <li key={`${item.name}-${item.pregnancyLevel}`}>
            <div className="preg-alert-item-head">
              <strong>
                {getIngredientEmoji(item.name, item.category)} {item.name}
              </strong>
              <PregnancyBadge level={item.pregnancyLevel} compact />
            </div>
            <p>{item.pregnancyNote}</p>
          </li>
        ))}
      </ul>

      {safeCount > 0 && (
        <p className="preg-alert-safe-note">其余 {safeCount} 种新增食材均适合孕期食用。</p>
      )}
      <p className="preg-disclaimer">{PREGNANCY_DISCLAIMER}</p>
    </section>
  );
}

export function ShoppingPlanCard({
  plan,
  pregnancyMode,
  busy,
  onToggleItem,
  onRemoveItem,
  onAddManualItem,
  onCommit,
  onClear,
  onOpenPlanner,
  onCookMeal,
}) {
  const [manualText, setManualText] = useState("");
  const [saveMeals, setSaveMeals] = useState(true);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [expandedMealTitle, setExpandedMealTitle] = useState("");
  const composingRef = useRef(false);

  const items = plan?.items || [];
  const meals = plan?.meals || [];
  const checkedItems = items.filter((item) => item.checked);
  const manualPregPreview = useMemo(() => {
    const trimmed = manualText.trim();
    if (!trimmed || !pregnancyMode) return null;
    const info = evaluateIngredientPregnancy(trimmed);
    return info.level === "avoid" || info.level === "caution" ? info : null;
  }, [manualText, pregnancyMode]);

  if (!plan || (items.length === 0 && meals.length === 0)) return null;

  async function copyList() {
    const lines = [];
    lines.push(`🛒 ${plan.title || "家庭买菜清单"}`);
    if (meals.length > 0) {
      lines.push(`计划菜单：${meals.map((m) => m.title).join("、")}${plan.staple ? ` + ${plan.staple}` : ""}`);
    }
    for (const item of items) {
      const mark = item.checked ? "[已买]" : "[ ]";
      const qty = item.quantityLabel ? ` ${item.quantityLabel}` : "";
      const warn = pregnancyMode && item.pregnancyLevel === "avoid"
        ? "（孕期避免）"
        : pregnancyMode && item.pregnancyLevel === "caution"
          ? "（孕期慎吃）"
          : "";
      lines.push(`${mark} ${item.name}${qty}${warn}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  }

  function submitManualItem() {
    const trimmed = manualText.trim();
    if (!trimmed || busy) return;
    onAddManualItem(trimmed);
    setManualText("");
  }

  return (
    <section className="shopping-card" aria-label="家庭买菜清单">
      <div className="shopping-head">
        <div className="shopping-head-title">
          <span className="shopping-icon" aria-hidden="true">🛒</span>
          <div>
            <h2>{plan.title || "家庭买菜清单"}</h2>
            <p>
              已买 {checkedItems.length} / {items.length} 样
              {plan.staple ? ` · 主食：${plan.staple}` : ""}
            </p>
          </div>
        </div>
        <div className="shopping-head-btns">
          <button type="button" className="btn-ghost-xs" onClick={copyList} disabled={busy}>
            <Copy size={13} aria-hidden="true" />
            <span>{copied ? "已复制" : "复制"}</span>
          </button>
          <button type="button" className="btn-ghost-xs" onClick={onOpenPlanner} disabled={busy}>
            重规划
          </button>
          {confirmClear ? (
            <button
              type="button"
              className="btn-danger-xs"
              onClick={() => {
                setConfirmClear(false);
                onClear();
              }}
              disabled={busy}
            >
              确认清空
            </button>
          ) : (
            <button type="button" className="btn-ghost-xs danger" onClick={() => setConfirmClear(true)} disabled={busy}>
              清空
            </button>
          )}
        </div>
      </div>

      {meals.length > 0 && (
        <div className="shopping-meals-strip">
          <span className="shopping-strip-label">买完可做</span>
          <div className="shopping-meal-pills">
            {meals.map((meal) => {
              const expanded = expandedMealTitle === meal.title;
              return (
                <button
                  key={meal.title}
                  type="button"
                  className={`shopping-meal-chip ${expanded ? "active" : ""}`}
                  onClick={() => setExpandedMealTitle(expanded ? "" : meal.title)}
                >
                  <span>{getRecipeVisual(meal).emoji}</span>
                  <span>{meal.title}</span>
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              );
            })}
          </div>

          {expandedMealTitle && (() => {
            const activeMeal = meals.find((m) => m.title === expandedMealTitle);
            if (!activeMeal) return null;
            return (
              <div className="shopping-meal-preview">
                <div className="shopping-meal-preview-head">
                  <strong>
                    {activeMeal.title} · {activeMeal.minutes} 分钟 · {activeMeal.method}
                  </strong>
                  <button
                    type="button"
                    className="btn-primary-xs"
                    onClick={() => onCookMeal(activeMeal)}
                  >
                    直接开做
                  </button>
                </div>
                {activeMeal.pregnancyTip && (
                  <p className="meal-preg-tip">🤰 {activeMeal.pregnancyTip}</p>
                )}
                <ol className="mini-step-list">
                  {activeMeal.steps.map((step, idx) => (
                    <li key={idx}>{step.text}</li>
                  ))}
                </ol>
              </div>
            );
          })()}
        </div>
      )}

      <div className="shopping-items-list">
        {items.map((item) => {
          const flagged = pregnancyMode && (item.pregnancyLevel === "avoid" || item.pregnancyLevel === "caution");
          return (
            <div key={item.id} className={`shopping-item-row ${item.checked ? "is-checked" : ""}`}>
              <label className="shopping-item-check">
                <input
                  type="checkbox"
                  checked={Boolean(item.checked)}
                  onChange={() => onToggleItem(item.id)}
                  disabled={busy}
                />
                <span className="shopping-item-main">
                  <span className="shopping-item-top">
                    <span aria-hidden="true">{getIngredientEmoji(item.name, item.category)}</span>
                    <strong>{item.name}</strong>
                    {item.quantityLabel && <small className="shop-qty">{item.quantityLabel}</small>}
                    {flagged && <PregnancyBadge level={item.pregnancyLevel} compact />}
                  </span>
                  {item.forDishes?.length > 0 && (
                    <span className="shopping-item-sub">用于：{item.forDishes.join("、")}</span>
                  )}
                  {flagged && item.pregnancyNote && (
                    <span className={`shopping-item-warn preg-${item.pregnancyLevel}`}>
                      {item.pregnancyNote}
                    </span>
                  )}
                </span>
              </label>
              <button
                type="button"
                className="shopping-item-del"
                onClick={() => onRemoveItem(item.id)}
                disabled={busy}
                aria-label={`移除待买食材${item.name}`}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Manual Self-Entry into Shopping List */}
      <div className="shopping-manual-add">
        <div className="shopping-manual-row">
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && !composingRef.current) {
                e.preventDefault();
                submitManualItem();
              }
            }}
            placeholder="自己加一样想买的菜，如：排骨、生菜"
            aria-label="手动添加待买食材"
            disabled={busy}
          />
          <button
            type="button"
            className="btn-soft-sm"
            onClick={submitManualItem}
            disabled={busy || !manualText.trim()}
          >
            <Plus size={14} />
            添加
          </button>
        </div>
        {manualPregPreview && (
          <div className={`shopping-manual-warn preg-${manualPregPreview.level}`}>
            <PregnancyBadge level={manualPregPreview.level} compact />
            <span>{manualPregPreview.note}</span>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="shopping-footer">
          {meals.length > 0 && (
            <label className="shopping-save-meals-opt">
              <input
                type="checkbox"
                checked={saveMeals}
                onChange={(e) => setSaveMeals(e.target.checked)}
                disabled={busy}
              />
              <span>同时把推荐菜单存入菜谱库</span>
            </label>
          )}
          <button
            type="button"
            className="btn-primary full"
            onClick={() => onCommit({ saveMeals })}
            disabled={busy || checkedItems.length === 0}
          >
            <Check size={16} />
            {checkedItems.length > 0
              ? `已买 ${checkedItems.length} 项一键入库`
              : "勾选已买食材后一键入库"}
          </button>
        </div>
      )}
    </section>
  );
}

export function MealPlannerSheet({
  initialMode = "use_existing",
  app,
  busy,
  onSuggest,
  onCookMeal,
  onSaveMealToLibrary,
  onApplyShoppingPlan,
  onClose,
}) {
  const settings = app.settings || { pregnancyMode: true, dietaryNotes: "", defaultMealStyle: "2菜+主食" };
  const nonPantryCount = useMemo(
    () => app.ingredients.filter((item) => item.category !== "调味").length,
    [app.ingredients],
  );

  const [mode, setMode] = useState(initialMode);
  // Default: 2 dishes + staple per family habit
  const [combo, setCombo] = useState("2_staple");
  const [style, setStyle] = useState("");
  const [maxMinutes, setMaxMinutes] = useState(0);
  const [shoppingMode, setShoppingMode] = useState(nonPantryCount <= 3 ? "fresh" : "top_up");
  const [mealsCount, setMealsCount] = useState(1);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState([]);
  const [pickerExpanded, setPickerExpanded] = useState(false);

  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [localError, setLocalError] = useState("");
  const [savedTitles, setSavedTitles] = useState([]);
  const [expandedSteps, setExpandedSteps] = useState({});

  const focusCandidates = useMemo(() => {
    const stateWeight = { expiring: 0, priority: 1, frozen: 2, none: 3 };
    const nonSeasoning = app.ingredients.filter((item) => item.category !== "调味");
    const list = nonSeasoning.length > 0 ? nonSeasoning : app.ingredients;
    return [...list].sort((a, b) => {
      if (settings.pregnancyMode) {
        const aAvoid = a.pregnancyLevel === "avoid" ? 1 : 0;
        const bAvoid = b.pregnancyLevel === "avoid" ? 1 : 0;
        if (aAvoid !== bAvoid) return aAvoid - bAvoid;
      }
      return (stateWeight[a.state] ?? 3) - (stateWeight[b.state] ?? 3);
    });
  }, [app.ingredients, settings.pregnancyMode]);

  const selectedFocusNames = useMemo(
    () => app.ingredients.filter((item) => selectedIngredientIds.includes(item.id)).map((item) => item.name),
    [app.ingredients, selectedIngredientIds],
  );

  function toggleFocusIngredient(id) {
    setSelectedIngredientIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event) {
      if (event.key === "Escape" && !busy && !loading) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, loading, onClose]);

  const dishCount = combo === "1_quick" ? 1 : combo === "3_staple" ? 3 : 2;
  const includeStaple = combo !== "1_quick";

  async function runSuggest({ reroll = false, overrideMode = mode } = {}) {
    setLoading(true);
    setLocalError("");
    try {
      const storageKey = `${RECENT_PLAN_PREFIX}${overrideMode}`;
      const maxRemember = overrideMode === "shopping_plan" ? 18 : 12;
      const recentPlanned = readStoredTitleList(storageKey);
      const recentCooked = readStoredTitleList(RECENT_COOKED_KEY).slice(-6);
      const currentTitles = (reroll || plan?.mode === overrideMode) && plan?.meals
        ? plan.meals.map((m) => m.title)
        : [];
      const mergedExclude = [...new Set([...recentCooked, ...recentPlanned, ...currentTitles])].slice(-maxRemember);

      const result = await onSuggest({
        mode: overrideMode,
        dishCount: overrideMode === "shopping_plan" ? 2 : dishCount,
        includeStaple: overrideMode === "shopping_plan" ? true : includeStaple,
        mealsCount: overrideMode === "shopping_plan" ? mealsCount : 1,
        style,
        maxMinutes: overrideMode === "use_existing" ? maxMinutes : 0,
        excludeTitles: mergedExclude,
        shoppingMode,
        selectedIngredientIds: overrideMode === "use_existing" ? selectedIngredientIds : [],
      });
      setPlan(result);
      if (Array.isArray(result?.meals) && result.meals.length > 0) {
        appendStoredTitleList(
          storageKey,
          result.meals.map((m) => m.title),
          maxRemember,
        );
      }
      setExpandedSteps({});
    } catch (err) {
      setLocalError(err.message || "生成建议失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveMeal(meal) {
    setLocalError("");
    try {
      await onSaveMealToLibrary(meal);
      setSavedTitles((prev) => (prev.includes(meal.title) ? prev : [...prev, meal.title]));
    } catch (err) {
      setLocalError(err.message || "收藏菜谱失败");
    }
  }

  async function handleAdoptShoppingPlan() {
    if (!plan) return;
    setLocalError("");
    try {
      await onApplyShoppingPlan({
        title: plan.title,
        summary: plan.summary,
        staple: plan.staple,
        meals: plan.meals || [],
        items: plan.shoppingItems || [],
      });
      onClose();
    } catch (err) {
      setLocalError(err.message || "保存买菜清单失败");
    }
  }

  const formalTitles = useMemo(
    () => new Set([...app.matches.ready, ...app.matches.missing].map((r) => r.title)),
    [app.matches],
  );
  const availableSet = useMemo(
    () => new Set([...app.ingredients.map((i) => i.name), ...(app.pantry || [])]),
    [app.ingredients, app.pantry],
  );

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && !loading && onClose()}>
      <section
        className="bottom-sheet editor-sheet tall planner-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-planner-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <header className="sheet-top-row padded">
          <div>
            <h2 id="meal-planner-title">今日点菜与买菜规划</h2>
            <p className="sheet-subtitle">
              {settings.pregnancyMode
                ? "🤰 孕期饮食守护已开启 · 默认每顿 2 道菜 + 主食"
                : "默认按每顿 2 道菜 + 主食为您搭配"}
            </p>
          </div>
          <button
            className="sheet-close-btn"
            type="button"
            onClick={onClose}
            disabled={busy || loading}
            aria-label="关闭点菜规划"
          >
            <X size={18} />
          </button>
        </header>

        <div className="planner-tabs-wrap">
          <div className="segmented-control" role="tablist" aria-label="规划模式">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "use_existing"}
              className={mode === "use_existing" ? "active" : ""}
              onClick={() => {
                setMode("use_existing");
                setPlan(null);
                setLocalError("");
              }}
              disabled={loading}
            >
              <span>🍳 用现有食材吃什么</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "shopping_plan"}
              className={mode === "shopping_plan" ? "active" : ""}
              onClick={() => {
                setMode("shopping_plan");
                setPlan(null);
                setLocalError("");
              }}
              disabled={loading}
            >
              <span>🛒 没菜了·买什么菜</span>
            </button>
          </div>
        </div>

        <div className="sheet-scroll-body planner-body">
          {mode === "use_existing" ? (
            <div className="planner-controls">
              <div className="planner-control-row">
                <span className="planner-label">餐桌搭配</span>
                <div className="planner-pill-row">
                  {[
                    { id: "2_staple", label: "2 道菜 + 主食" },
                    { id: "1_quick", label: "1 道快手菜" },
                    { id: "3_staple", label: "2 菜 1 汤 + 主食" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`filter-chip ${combo === opt.id ? "active" : ""}`}
                      aria-pressed={combo === opt.id}
                      onClick={() => setCombo(opt.id)}
                      disabled={loading}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="planner-control-row">
                <span className="planner-label">口味偏好</span>
                <div className="planner-pill-row">
                  {["", "清淡营养", "家常下饭", "暖胃汤羹"].map((val) => (
                    <button
                      key={val || "any"}
                      type="button"
                      className={`filter-chip ${style === val ? "active" : ""}`}
                      aria-pressed={style === val}
                      onClick={() => setStyle(val)}
                      disabled={loading}
                    >
                      {val || "不限"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="planner-control-row">
                <span className="planner-label">做菜时间</span>
                <div className="planner-pill-row">
                  {[
                    { val: 0, label: "不限" },
                    { val: 15, label: "15 分钟内" },
                    { val: 30, label: "30 分钟内" },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      className={`filter-chip ${maxMinutes === opt.val ? "active" : ""}`}
                      aria-pressed={maxMinutes === opt.val}
                      onClick={() => setMaxMinutes(opt.val)}
                      disabled={loading}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {focusCandidates.length > 0 && (
                <div className="planner-focus-box">
                  <button
                    type="button"
                    className="planner-focus-toggle"
                    aria-expanded={pickerExpanded}
                    onClick={() => setPickerExpanded((prev) => !prev)}
                    disabled={loading}
                  >
                    <div className="planner-focus-toggle-text">
                      <span className="planner-label">指定想用的食材（可选）</span>
                      <small>
                        {selectedFocusNames.length > 0
                          ? `已指定 ${selectedFocusNames.length} 样：${selectedFocusNames.slice(0, 3).join("、")}${selectedFocusNames.length > 3 ? "…" : ""}`
                          : "不选则自动优先消耗快过期食材"}
                      </small>
                    </div>
                    {pickerExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {pickerExpanded && (
                    <div className="planner-focus-panel">
                      <div className="planner-focus-grid">
                        {focusCandidates.map((item) => {
                          const selected = selectedIngredientIds.includes(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`planner-focus-pill ${selected ? "selected" : ""}`}
                              aria-label={`指定食材${item.name}`}
                              aria-pressed={selected}
                              onClick={() => toggleFocusIngredient(item.id)}
                              disabled={loading}
                            >
                              {selected ? (
                                <Check size={13} strokeWidth={2.8} aria-hidden="true" />
                              ) : (
                                <span aria-hidden="true">{getIngredientEmoji(item.name, item.category)}</span>
                              )}
                              <span>{item.name}</span>
                              {item.state === "expiring" && <em className="mini-state expiring">快过期</em>}
                              {item.state === "priority" && <em className="mini-state priority">优先用</em>}
                            </button>
                          );
                        })}
                      </div>
                      {selectedIngredientIds.length > 0 && (
                        <button
                          type="button"
                          className="btn-ghost-xs"
                          onClick={() => setSelectedIngredientIds([])}
                          disabled={loading}
                        >
                          清空已选食材
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {app.ingredients.length === 0 && (
                <div className="subtle-info-note">
                  家里目前还没有登记食材，建议切换到「🛒 没菜了·买什么菜」直接生成买菜与菜单方案。
                </div>
              )}

              <button
                type="button"
                className="btn-primary full"
                onClick={() => runSuggest({ reroll: false })}
                disabled={loading || busy}
              >
                {loading ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}
                <span>
                  {loading
                    ? "正在为你搭配这顿饭..."
                    : selectedIngredientIds.length > 0
                      ? `用已选 ${selectedIngredientIds.length} 种食材搭配`
                      : "帮我搭配这顿饭"}
                </span>
              </button>
            </div>
          ) : (
            <div className="planner-controls">
              <div className="planner-control-row">
                <span className="planner-label">采购方式</span>
                <div className="planner-pill-row">
                  <button
                    type="button"
                    className={`filter-chip ${shoppingMode === "top_up" ? "active" : ""}`}
                    aria-pressed={shoppingMode === "top_up"}
                    onClick={() => setShoppingMode("top_up")}
                    disabled={loading}
                  >
                    顺路补少量食材（结合现有）
                  </button>
                  <button
                    type="button"
                    className={`filter-chip ${shoppingMode === "fresh" ? "active" : ""}`}
                    aria-pressed={shoppingMode === "fresh"}
                    onClick={() => setShoppingMode("fresh")}
                    disabled={loading}
                  >
                    冰箱空了·从零规划采购
                  </button>
                </div>
              </div>

              <div className="planner-control-row">
                <span className="planner-label">规划顿数（每顿 2 菜 + 主食）</span>
                <div className="planner-pill-row">
                  {[
                    { count: 1, label: "下顿 1 顿" },
                    { count: 2, label: "未来 2 顿" },
                    { count: 3, label: "未来 2 天（3顿）" },
                  ].map((opt) => (
                    <button
                      key={opt.count}
                      type="button"
                      className={`filter-chip ${mealsCount === opt.count ? "active" : ""}`}
                      aria-pressed={mealsCount === opt.count}
                      onClick={() => setMealsCount(opt.count)}
                      disabled={loading}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="planner-control-row">
                <span className="planner-label">饮食侧重</span>
                <div className="planner-pill-row">
                  {["", "清淡营养", "家常下饭", "补铁补钙"].map((val) => (
                    <button
                      key={val || "any"}
                      type="button"
                      className={`filter-chip ${style === val ? "active" : ""}`}
                      aria-pressed={style === val}
                      onClick={() => setStyle(val)}
                      disabled={loading}
                    >
                      {val || "营养均衡"}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn-primary full"
                onClick={() => runSuggest({ reroll: false })}
                disabled={loading || busy}
              >
                {loading ? <LoaderCircle size={17} className="spin" /> : <ShoppingCart size={17} />}
                <span>{loading ? "正在生成菜单与买菜清单..." : "生成买菜与菜单方案"}</span>
              </button>
            </div>
          )}

          {localError && (
            <div className="form-error" role="alert">
              {localError}
            </div>
          )}

          {/* Plan Result */}
          {plan && (
            <div className="planner-result">
              <div className="planner-result-banner">
                <div className="planner-result-head">
                  <strong>{plan.title}</strong>
                  <span className="tag-pill tag-green">
                    {plan.generatedBy === "ai" ? "AI 定制" : "智能推荐"}
                  </span>
                </div>
                {plan.summary && <p>{plan.summary}</p>}
                {plan.staple && (
                  <div className="planner-staple-pill">
                    <UtensilsCrossed size={14} aria-hidden="true" />
                    <span>主食搭配：{plan.staple}</span>
                  </div>
                )}
              </div>

              {/* Recommended Dishes */}
              {plan.meals?.length > 0 && (
                <div className="planner-meal-cards">
                  {plan.meals.map((meal, index) => {
                    const visual = getRecipeVisual(meal);
                    const isSaved = formalTitles.has(meal.title) || savedTitles.includes(meal.title);
                    const stepsShown = Boolean(expandedSteps[meal.title]);
                    return (
                      <article key={`${meal.title}-${index}`} className="planner-dish-card">
                        <div className="planner-dish-head">
                          <div className={`rc-cover sm tone-${visual.tone}`} aria-hidden="true">
                            {visual.emoji}
                          </div>
                          <div className="planner-dish-info">
                            <h3>{meal.title}</h3>
                            <div className="rc-meta">
                              <span>⏱ {meal.minutes} 分钟</span>
                              <span>
                                {getMethodEmoji(meal.method)} {meal.method}
                              </span>
                            </div>
                          </div>
                        </div>

                        {meal.reason && <p className="planner-dish-reason">✨ {meal.reason}</p>}
                        {settings.pregnancyMode && meal.pregnancyTip && (
                          <p className="meal-preg-tip">🤰 {meal.pregnancyTip}</p>
                        )}

                        <div className="planner-ing-pills">
                          {meal.ingredients.map((ing) => {
                            const hasIt = availableSet.has(ing.name);
                            return (
                              <span
                                key={ing.name}
                                className={`planner-ing-pill ${hasIt ? "have" : ing.required ? "need" : "opt"}`}
                              >
                                {getIngredientEmoji(ing.name)} {ing.name}
                                {ing.quantityLabel ? ` ${ing.quantityLabel}` : ""}
                                {!hasIt && ing.required ? " · 需买" : ""}
                              </span>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          className="planner-steps-toggle"
                          onClick={() =>
                            setExpandedSteps((prev) => ({ ...prev, [meal.title]: !prev[meal.title] }))
                          }
                        >
                          <span>{stepsShown ? "收起做法步骤" : `查看做法步骤（共 ${meal.steps.length} 步）`}</span>
                          {stepsShown ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>

                        {stepsShown && (
                          <ol className="mini-step-list">
                            {meal.steps.map((step, idx) => (
                              <li key={idx}>{step.text}</li>
                            ))}
                          </ol>
                        )}

                        <div className="planner-dish-actions">
                          <button
                            type="button"
                            className="btn-soft flex1"
                            onClick={() => handleSaveMeal(meal)}
                            disabled={busy || isSaved}
                          >
                            {isSaved ? <Check size={15} /> : <BookmarkPlus size={15} />}
                            <span>{isSaved ? "已在菜谱库" : "收藏菜谱"}</span>
                          </button>
                          <button
                            type="button"
                            className="btn-primary flex1"
                            onClick={() => {
                              onCookMeal(meal);
                              onClose();
                            }}
                            disabled={busy}
                          >
                            <span>直接开做</span>
                            <ArrowRight size={15} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {/* Shopping List Preview */}
              {mode === "shopping_plan" && plan.shoppingItems?.length > 0 && (
                <div className="planner-shop-preview">
                  <div className="section-head">
                    <h3>🛒 需要采购（{plan.shoppingItems.length} 样）</h3>
                    <span>已自动排除家里已有食材</span>
                  </div>
                  <div className="planner-shop-items">
                    {plan.shoppingItems.map((item) => (
                      <div key={item.id || item.name} className="planner-shop-row">
                        <div className="planner-shop-main">
                          <span aria-hidden="true">{getIngredientEmoji(item.name, item.category)}</span>
                          <strong>{item.name}</strong>
                          <small>{CATEGORY_EMOJI[item.category]} {item.category}</small>
                          {item.quantityLabel && <span className="shop-qty">{item.quantityLabel}</span>}
                        </div>
                        <div className="planner-shop-right">
                          {settings.pregnancyMode && (
                            <PregnancyBadge level={item.pregnancyLevel} compact />
                          )}
                        </div>
                        {item.forDishes?.length > 0 && (
                          <div className="planner-shop-sub">用于：{item.forDishes.join("、")}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="planner-bottom-actions">
                <button
                  type="button"
                  className="btn-soft"
                  onClick={() => runSuggest({ reroll: true })}
                  disabled={loading || busy}
                >
                  <RefreshCcw size={15} />
                  <span>换一桌方案</span>
                </button>
                {mode === "shopping_plan" && (
                  <button
                    type="button"
                    className="btn-primary flex1"
                    onClick={handleAdoptShoppingPlan}
                    disabled={loading || busy}
                  >
                    <ShoppingCart size={16} />
                    <span>采用并同步到买菜清单</span>
                  </button>
                )}
              </div>

              {settings.pregnancyMode && <p className="preg-disclaimer">{PREGNANCY_DISCLAIMER}</p>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
