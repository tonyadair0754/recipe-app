import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { fetchRecipes } from "./api";
import { useAuth } from "./context/AuthContext";
import HomeView from "./views/HomeView";
import CollectionView from "./views/CollectionView";
import DetailView from "./views/DetailView";
import SharedRecipeView from "./views/SharedRecipeView";
import AuthView from "./views/AuthView";
import "./App.css";

// ── Shell ──
// The Shell renders the topbar, footer, and the route-specific content.
// It's a separate component (rather than putting everything in App) so that
// useNavigate() — which only works inside a <BrowserRouter> — is available here.
function Shell() {
  const { user, token, logout, isGuest, guestRecipes, loading, wakingUp } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState([]);

  const loadRecipes = useCallback(async () => {
    try {
      const data = await fetchRecipes(token);
      setSaved(data);
    } catch (e) { console.log(e); }
  }, [token]);

  useEffect(() => {
    if (token) loadRecipes();
  }, [token, loadRecipes]);

  const handleLogout = () => {
    if (window.confirm("Sign out of RecipeLens?")) logout();
  };

  // For guests, the "saved" list is just their localStorage recipes
  const displayedRecipes = isGuest ? guestRecipes : saved;
  const collectionCount = displayedRecipes.length;

  // Called after a recipe is saved so the collection stays in sync.
  const handleSaved = useCallback(() => {
    if (!isGuest) loadRecipes();
    navigate("/collection");
  }, [isGuest, loadRecipes, navigate]);

  // Called by DetailView after a successful edit so the collection list
  // reflects the change immediately without waiting for a refetch.
  const handleUpdated = useCallback((r) => {
    setSaved(prev => prev.map(recipe => recipe.id === r.id ? r : recipe));
    if (!isGuest) loadRecipes();
  }, [isGuest, loadRecipes]);

  // Called by DetailView after a recipe is deleted.
  const handleDeleted = useCallback(() => {
    if (!isGuest) loadRecipes();
    navigate("/collection");
  }, [isGuest, loadRecipes, navigate]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading-state" style={{ paddingTop: "80px" }}>
          <div>
            <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
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
            <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
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

  // The topbar is hidden on the auth screen because AuthView renders its own
  // logo inside the card — showing the topbar too would duplicate "RecipeLens".
  // It's also hidden on shared recipe pages (/shared/:token) for anonymous
  // visitors who have no collection to navigate to.
  const showTopbar = user || isGuest;

  return (
    <div className="app">
      <div className="accent-bar" />

      {showTopbar && (
        <div className="topbar">
          <div className="logo" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
            <div className="logo-dot" />
            RecipeLens
          </div>
          <div className="nav-right">
            <button
              className="nav-link"
              onClick={() => navigate("/")}
              style={{
                color: window.location.pathname === "/" ? "#2d6a4f" : undefined,
                fontWeight: window.location.pathname === "/" ? 500 : undefined,
              }}
            >
              Add recipe
            </button>
            <button
              className="nav-link"
              onClick={() => navigate("/collection")}
              style={{
                color: window.location.pathname.startsWith("/collection") || window.location.pathname.startsWith("/recipe") ? "#2d6a4f" : undefined,
                fontWeight: window.location.pathname.startsWith("/collection") || window.location.pathname.startsWith("/recipe") ? 500 : undefined,
              }}
            >
              My collection ({collectionCount})
            </button>
            {isGuest ? (
              <button className="nav-link" onClick={() => window.location.reload()}>Sign in</button>
            ) : (
              <button className="nav-link" onClick={handleLogout}>Sign out</button>
            )}
          </div>
        </div>
      )}

      <Routes>
        {/* Public route — no auth needed, works for anonymous visitors */}
        <Route path="/shared/:shareToken" element={<SharedRecipeView allRecipes={displayedRecipes} />} />

        {/* Auth-gated routes — show the login screen if not signed in */}
        {!user && !isGuest ? (
          <Route path="*" element={<AuthView />} />
        ) : (
          <>
            <Route
              path="/"
              element={<HomeView onSaved={handleSaved} allRecipes={displayedRecipes} />}
            />
            <Route
              path="/collection"
              element={<CollectionView saved={displayedRecipes} />}
            />
            <Route
              path="/recipe/:id"
              element={
                <DetailView
                  allRecipes={displayedRecipes}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                  onSaved={handleSaved}
                />
              }
            />
            {/* Catch-all — redirect unknown paths to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>

      <footer className="app-footer">
        Made by Tony Adair.{" "}
        <a href="https://tonyadair0754.github.io#projects" target="_blank" rel="noreferrer">
          Check out my other projects!
        </a>
      </footer>
    </div>
  );
}

// ── App root ──
// BrowserRouter must wrap everything that uses react-router hooks.
// Shell is a separate child component so it can call useNavigate(),
// which only works inside a <BrowserRouter>.
export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}