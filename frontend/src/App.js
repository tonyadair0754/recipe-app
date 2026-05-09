import { useState, useEffect, useCallback } from "react";
import { fetchRecipes } from "./api";
import { useAuth } from "./context/AuthContext";
import HomeView from "./views/HomeView";
import CollectionView from "./views/CollectionView";
import DetailView from "./views/DetailView";
import AuthView from "./views/AuthView";
import "./App.css";

export default function App() {
  const { user, token, logout, loading: authLoading } = useAuth();
  const [view, setView] = useState("home");
  const [saved, setSaved] = useState([]);
  const [selected, setSelected] = useState(null);

  const loadRecipes = useCallback(async () => {
    try {
      const data = await fetchRecipes(token);
      setSaved(data);
    } catch (e) { console.log(e); }
  }, [token]);

  useEffect(() => {
    if (token) loadRecipes();
  }, [token, loadRecipes]);

  const goHome = () => setView("home");
  const goCollection = () => { setView("collection"); setSelected(null); };
  const handleSaved = () => { loadRecipes(); goCollection(); };
  const handleSelect = (r) => { setSelected(r); setView("detail"); };
  const handleDeleted = () => { loadRecipes(); goCollection(); };
  const handleUpdated = (r) => { setSelected(r); loadRecipes(); };
  const handleNavigate = (r) => { setSelected(r); setView("detail"); };

  if (authLoading) {
    return (
      <div className="app">
        <div className="loading-state" style={{ paddingTop: "80px" }}>
          <div>
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <AuthView />;

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
          <button className="nav-link" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      {view === "home" && (
        <HomeView onSaved={handleSaved} token={token} />
      )}
      {view === "collection" && (
        <CollectionView saved={saved} onSelect={handleSelect} />
      )}
      {view === "detail" && selected && (
        <DetailView
          recipe={selected}
          onBack={goCollection}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
          onSaved={loadRecipes}
          onNavigate={handleNavigate}
          token={token}
        />
      )}
    </div>
  );
}