import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { formatIngredient } from "../utils/parseUtils";

export default function CollectionView({ saved, onSelect }) {
  const { isGuest } = useAuth();
  const [search, setSearch] = useState("");

  const filtered = saved.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();

    // Check title
    if (r.title.toLowerCase().includes(q)) return true;

    // Check ingredients (may be structured objects { amount, unit, name } or plain strings)
    if (r.ingredients.some((ing) => {
      const text = typeof ing === "string" ? ing : formatIngredient(ing);
      return text.toLowerCase().includes(q);
    })) return true;

    // Check instructions (may be strings or {text, images} objects)
    if (r.instructions.some((step) => {
      const text = typeof step === "string" ? step : step.text;
      return text.toLowerCase().includes(q);
    })) return true;

    return false;
  });

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
        <input
          className="search-input"
          type="text"
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {saved.length === 0 ? (
        <div className="empty-state"><p>No recipes saved yet.</p></div>
      ) : filtered.length === 0 ? (
        <p className="no-results">No recipes match "{search}"</p>
      ) : (
        <div className="recipe-grid">
          {filtered.map((r) => (
            <div key={r.id} className="recipe-card" onClick={() => onSelect(r)}>
              {r.image_url && (
                <img src={r.image_url} alt={r.title}
                  style={{ width: "100%", height: "140px", objectFit: "cover", borderRadius: "6px", marginBottom: "10px" }} />
              )}
              <h3>{r.title}</h3>
              <p className="recipe-card-meta">
                {r.ingredients.length} ingredient{r.ingredients.length !== 1 ? "s" : ""} · {r.instructions.length} step{r.instructions.length !== 1 ? "s" : ""}
                {r.language === "ko" && <span className="lang-tag">한국어</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}