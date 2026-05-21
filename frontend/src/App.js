import { useState, useEffect, useCallback } from "react";
import { fetchRecipes } from "./api";
import { useAuth } from "./context/AuthContext";
import HomeView from "./views/HomeView";
import CollectionView from "./views/CollectionView";
import DetailView from "./views/DetailView";
import AuthView from "./views/AuthView";
import "./App.css";

export default function App() {
  const { user, token, logout, isGuest, guestRecipes, loading, wakingUp } = useAuth();
  const [view, setView] = useState("home");
  const [saved, setSaved] = useState([]);
  const [selected, setSelected] = useState(null);

  const loadRecipes = useCallback(async () => {
    try {
      const data = await fetchRecipes(token);
      setSaved(data);
    } catch (e) { console.log(e); }
  }, [token]);

  const handleLogout = () => {
    if (window.confirm("Sign out of RecipeLens?")) logout();
  };

  useEffect(() => {
    if (token) loadRecipes();
  }, [token, loadRecipes]);

  // For guests, the "saved" list is just their localStorage recipes
  const displayedRecipes = isGuest ? guestRecipes : saved;
  const collectionCount = displayedRecipes.length;

  const goHome = () => setView("home");
  const goCollection = () => { setView("collection"); setSelected(null); };
  const handleSaved = () => { if (!isGuest) loadRecipes(); goCollection(); };
  const handleSelect = (r) => { setSelected(r); setView("detail"); };
  const handleDeleted = () => { if (!isGuest) loadRecipes(); goCollection(); };
  const handleUpdated = (r) => { setSelected(r); if (!isGuest) loadRecipes(); };
  const handleNavigate = (r) => { setSelected(r); setView("detail"); };

  if (loading) {
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

  if (wakingUp) {
    return (
      <div className="app">
        <div className="loading-state" style={{ paddingTop: "80px" }}>
          <div>
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
          <div style={{ marginTop: "24px", maxWidth: "280px", margin: "24px auto 0", textAlign: "center" }}>
            <p style={{ fontSize: "14px", color: "#555", lineHeight: "1.6", marginBottom: "8px" }}>
              The server is waking up after a period of inactivity.
            </p>
            <p style={{ fontSize: "13px", color: "#aaa", lineHeight: "1.6" }}>
              This usually takes under a minute — thank you for your patience.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user && !isGuest) return <AuthView />;

  return (
    <div className="app">
      <div className="accent-bar" />
      <div className="topbar">
        <div className="logo" onClick={goHome} style={{ cursor: "pointer" }}>
          <div className="logo-dot" />
          RecipeLens
        </div>
        <div className="nav-right">
          <button className={`nav-link ${view === "home" ? "active" : ""}`} onClick={goHome}>
            Add recipe
          </button>
          <button
            className={`nav-link ${view === "collection" || view === "detail" ? "active" : ""}`}
            onClick={goCollection}
          >
            My collection ({collectionCount})
          </button>
          {isGuest ? (
            <button className="nav-link" onClick={() => { /* navigate to auth */ window.location.reload(); }}>
              Sign in
            </button>
          ) : (
            <button className="nav-link" onClick={handleLogout}>
              Sign out
            </button>
          )}
        </div>
      </div>

      {view === "home" && <HomeView onSaved={handleSaved} />}
      {view === "collection" && (
        <CollectionView
          saved={displayedRecipes}
          onSelect={handleSelect}
        />
      )}
      {view === "detail" && selected && (
        <DetailView
          recipe={selected}
          onBack={goCollection}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
          onSaved={isGuest ? () => {} : loadRecipes}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}