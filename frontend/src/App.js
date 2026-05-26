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

  const handleUpdated = (r) => {
    // Always update selected immediately so DetailView re-renders with the
    // new data (including labels) without waiting for the network.
    setSelected(r);

    if (!isGuest) {
      // Also patch the recipe in the saved list directly so that navigating
      // back to the collection and reopening the recipe doesn't show stale
      // data from before the edit. Without this, the user sees the correct
      // data in the detail view (from setSelected), but as soon as they go
      // back and re-open the recipe, handleSelect pulls from `saved` which
      // still has the pre-edit version — causing labels (and any other edits)
      // to appear to vanish.
      setSaved(prev => prev.map(recipe => recipe.id === r.id ? r : recipe));

      // Still refetch in the background so saved stays fully in sync with
      // the backend (e.g. if the server transforms any fields on write).
      loadRecipes();
    }
  };

  const handleNavigate = (r) => { setSelected(r); setView("detail"); };

  // Push a history entry each time the view changes so the browser back
  // button works within the app. Without this, all views share one URL
  // and the back button exits the app entirely.
  useEffect(() => {
    // Push a new entry so the back button has somewhere to go
    window.history.pushState({ view }, "", window.location.pathname);
  }, [view]);

  useEffect(() => {
    const handlePopState = (e) => {
      // When the user hits back, restore the view from the history state.
      // If there's no state (they've gone back to the very first entry), go home.
      const prev = e.state?.view;
      if (prev === "collection") { setView("collection"); setSelected(null); }
      else if (prev === "detail" && selected) setView("detail");
      else setView("home");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selected]);

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

      {view === "home" && <HomeView onSaved={handleSaved} allRecipes={displayedRecipes} />}
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
          allRecipes={displayedRecipes}
        />
      )}

      {/* Footer — outside all views so it appears on every page */}
      <footer className="app-footer">
        Made by Tony Adair.{" "}
        <a
          href="https://tonyadair0754.github.io#projects"
          target="_blank"
          rel="noreferrer"
        >
          Check out my other projects!
        </a>
      </footer>
    </div>
  );
}