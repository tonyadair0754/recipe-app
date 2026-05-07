import { useState, useEffect } from "react";
import { fetchRecipes } from "./api";
import HomeView from "./views/HomeView";
import CollectionView from "./views/CollectionView";
import DetailView from "./views/DetailView";
import "./App.css";

export default function App() {
  const [view, setView] = useState("home");
  const [saved, setSaved] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => { loadRecipes(); }, []);

  const loadRecipes = async () => {
    try {
      const data = await fetchRecipes();
      setSaved(data);
    } catch (e) { console.log(e); }
  };

  const goHome = () => { setView("home"); };
  const goCollection = () => { setView("collection"); setSelected(null); };

  const handleSaved = () => { loadRecipes(); goCollection(); };
  const handleSelect = (r) => { setSelected(r); setView("detail"); };
  const handleDeleted = () => { loadRecipes(); goCollection(); };
  const handleUpdated = (r) => { setSelected(r); loadRecipes(); };
  const handleNavigate = (r) => { setSelected(r); setView("detail"); };

  return (
    <div className="app">
      <div className="accent-bar" />

      <div className="topbar">
        <div className="logo" onClick={goHome} style={{ cursor: "pointer" }}>
          <div className="logo-dot" />
          RecipeLens
        </div>
        <div className="nav-right">
          <button
            className={`nav-link ${view === "home" ? "active" : ""}`}
            onClick={goHome}
          >
            Add recipe
          </button>
          <button
            className={`nav-link ${view === "collection" || view === "detail" ? "active" : ""}`}
            onClick={goCollection}
          >
            My collection ({saved.length})
          </button>
        </div>
      </div>

      {view === "home" && <HomeView onSaved={handleSaved} />}
      {view === "collection" && <CollectionView saved={saved} onSelect={handleSelect} />}
      {view === "detail" && selected && (
        <DetailView
          recipe={selected}
          onBack={goCollection}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
          onSaved={loadRecipes}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}