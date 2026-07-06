import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatIngredient, normalizeSearch } from "../utils/parseUtils";

const TABS = ["All", "Favorites", "Recent"];

export default function CollectionView({ saved }) {
  const { isGuest, recentIds } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  // Set of label strings the user has clicked to filter by.
  // A recipe must have ALL active filter labels to appear (AND logic).
  const [activeFilters, setActiveFilters] = useState(new Set());

  // ── Derive the list of all labels across the collection ──
  // Sort alphabetically, but put "Favorite" first so it's always easy to find.
  const allLabels = Array.from(
    new Set(saved.flatMap((r) => r.labels || []))
  ).sort((a, b) => {
    if (a === "Favorite") return -1;
    if (b === "Favorite") return 1;
    return a.localeCompare(b);
  });

  const toggleFilter = (label) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  // ── Build the list for the current tab ──

  const recentRecipes = (recentIds || [])
    .map((id) => saved.find((r) => String(r.id) === String(id)))
    .filter(Boolean);

  const baseList =
    activeTab === "Favorites"
      ? saved.filter((r) => (r.labels || []).includes("Favorite"))
      : activeTab === "Recent"
      ? recentRecipes
      : saved;

  const labelFiltered =
    activeFilters.size === 0
      ? baseList
      : baseList.filter((r) =>
          [...activeFilters].every((label) => (r.labels || []).includes(label))
        );

  const filtered = labelFiltered.filter((r) => {
    if (!search) return true;
    const q = normalizeSearch(search);
    if (normalizeSearch(r.title).includes(q)) return true;
    if (r.ingredients.some((ing) => {
      if (ing.type === "section") return normalizeSearch(ing.text || "").includes(q);
      const text = typeof ing === "string" ? ing : formatIngredient(ing);
      return normalizeSearch(text).includes(q);
    })) return true;
    if (r.instructions.some((step) => {
      if (step.type === "section") return normalizeSearch(step.text || "").includes(q);
      const text = typeof step === "string" ? step : step.text;
      return normalizeSearch(text).includes(q);
    })) return true;
    if ((r.labels || []).some((l) => normalizeSearch(l).includes(q))) return true;
    return false;
  });

  const emptyMessage =
    saved.length === 0
      ? "No recipes saved yet."
      : activeTab === "Favorites" && baseList.length === 0
      ? "No favorites yet — open a recipe and mark it ⭐ while editing."
      : activeTab === "Recent" && baseList.length === 0
      ? "You haven't opened any recipes yet."
      : filtered.length === 0 && search
      ? `No recipes match "${search}"`
      : filtered.length === 0 && activeFilters.size > 0
      ? "No recipes match the selected labels."
      : null;

  return (
    <>
      {isGuest && (
        <div style={{
          background: '#fef08a', padding: '10px 16px', borderRadius: '8px',
          marginBottom: '16px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: '12px'
        }}>
          <span style={{ fontSize: '0.875rem' }}>
            Recipes saved locally — sign up to sync across devices.
          </span>
          <button
            className="btn-primary"
            style={{ whiteSpace: 'nowrap', padding: '6px 14px', fontSize: '0.85rem' }}
            onClick={() => window.location.reload()}
          >
            Sign up free
          </button>
        </div>
      )}

      <div className="collection-header">
        <h2>My collection</h2>
        {activeTab !== "Recent" && (
          <input
            className="search-input"
            type="text"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="collection-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`collection-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => {
              setActiveTab(tab);
              setActiveFilters(new Set());
              setSearch("");
            }}
          >
            {tab === "Favorites" && "⭐ "}{tab}
            {tab === "Favorites" && (
              <span className="tab-badge">
                {saved.filter((r) => (r.labels || []).includes("Favorite")).length}
              </span>
            )}
            {tab === "Recent" && (
              <span className="tab-badge">{recentRecipes.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Label filter pills ── */}
      {activeTab !== "Recent" && allLabels.length > 0 && (
        <div className="label-filter-row">
          <span className="label-filter-hint">Filter:</span>
          {allLabels.map((label) => (
            <button
              key={label}
              className={`label-filter-pill ${activeFilters.has(label) ? "active" : ""}`}
              onClick={() => toggleFilter(label)}
            >
              {label === "Favorite" ? "⭐ Favorite" : label}
            </button>
          ))}
          {activeFilters.size > 0 && (
            <button className="label-filter-clear" onClick={() => setActiveFilters(new Set())}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Recipe grid ── */}
      {emptyMessage ? (
        <div className="empty-state"><p>{emptyMessage}</p></div>
      ) : (
        <div className="recipe-grid">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="recipe-card"
              onClick={() => navigate(`/recipe/${r.id}`)}
            >
              {r.image_url && (
                <img src={r.image_url} alt={r.title}
                  style={{ width: "100%", height: "140px", objectFit: "cover", borderRadius: "6px", marginBottom: "10px" }} />
              )}
              <h3>{r.title}</h3>
              <p className="recipe-card-meta">
                {r.ingredients.length} ingredient{r.ingredients.length !== 1 ? "s" : ""} · {r.instructions.length} step{r.instructions.length !== 1 ? "s" : ""}
                {r.language === "ko" && <span className="lang-tag">한국어</span>}
              </p>
              {(r.labels || []).length > 0 && (
                <div className="card-label-row">
                  {r.labels.slice(0, 3).map((label) => (
                    <span key={label} className={`card-label-pill ${label === "Favorite" ? "favorite" : ""}`}>
                      {label === "Favorite" ? "⭐" : label}
                    </span>
                  ))}
                  {r.labels.length > 3 && (
                    <span className="card-label-pill overflow">+{r.labels.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
