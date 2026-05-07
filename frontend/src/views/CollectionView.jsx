import { useState } from "react";

export default function CollectionView({ saved, onSelect }) {
  const [search, setSearch] = useState("");

  const filtered = saved.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
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
        <div className="empty-state">
          <p>No recipes saved yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="no-results">No recipes match "{search}"</p>
      ) : (
        <div className="recipe-grid">
          {filtered.map((r) => (
            <div key={r.id} className="recipe-card" onClick={() => onSelect(r)}>
              <h3>{r.title}</h3>
              <p className="recipe-card-meta">
                {r.ingredients.length} ingredients · {r.instructions.length} steps
                {r.language === "ko" && <span className="lang-tag">한국어</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}