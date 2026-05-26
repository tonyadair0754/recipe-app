import { createContext, useContext, useState, useEffect } from "react";
import { loginUser, signupUser, setupInterceptors, saveRecipe } from "../api";

const AuthContext = createContext(null);
const GUEST_RECIPES_KEY = 'rl_guest_recipes';
// Recents are stored as an ordered array of recipe IDs, most recent first.
// We cap the list at 10 so it doesn't grow indefinitely.
const RECENTS_KEY = 'rl_recents';
const RECENTS_MAX = 10;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wakingUp, setWakingUp] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [guestRecipes, setGuestRecipes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(GUEST_RECIPES_KEY)) || []; }
    catch { return []; }
  });

  // Recents are just IDs — both guests and auth users share the same localStorage key.
  // No backend needed: if a recipe is deleted its ID simply won't match anything and
  // CollectionView filters it out silently.
  const [recentIds, setRecentIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENTS_KEY)) || []; }
    catch { return []; }
  });

  // Persist guest recipes whenever they change
  useEffect(() => {
    localStorage.setItem(GUEST_RECIPES_KEY, JSON.stringify(guestRecipes));
  }, [guestRecipes]);

  // Persist recents whenever they change
  useEffect(() => {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recentIds));
  }, [recentIds]);

  useEffect(() => {
    const savedToken = localStorage.getItem("rl_token");
    const savedUser = localStorage.getItem("rl_user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
    setupInterceptors(logout);
  }, []);

  useEffect(() => { checkBackendHealth(); }, []);

  const checkBackendHealth = async () => {
    const BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";
    // Show waking up message after 2 seconds of no response
    const wakeTimer = setTimeout(() => setWakingUp(true), 2000);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      await fetch(`${BASE}/`, { signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (e) {
      // Backend unreachable — still let the app load
    } finally {
      clearTimeout(wakeTimer);
      setWakingUp(false);
    }
  };

  const login = async (email, password) => {
    const data = await loginUser(email, password);
    setToken(data.access_token);
    setUser(data.user);
    setIsGuest(false);
    localStorage.setItem("rl_token", data.access_token);
    localStorage.setItem("rl_user", JSON.stringify(data.user));
    return data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setIsGuest(false);
    localStorage.removeItem("rl_token");
    localStorage.removeItem("rl_user");
    // Recents are intentionally kept across logout so the tab still works
    // after logging back in, and guest IDs just become stale and are ignored.
  };

  const signup = async (email, password) => {
    await signupUser(email, password);
  };

  function enterGuestMode() {
    setIsGuest(true);
  }

  function addGuestRecipe(recipe) {
    // Labels default to an empty array if the caller didn't supply them.
    // This keeps the shape consistent with auth recipes from the backend.
    const newRecipe = { ...recipe, id: `guest_${Date.now()}`, language: recipe.language || 'en', labels: recipe.labels || [] };
    setGuestRecipes(prev => [newRecipe, ...prev]);
    return newRecipe;
  }

  function updateGuestRecipe(id, updates) {
    setGuestRecipes(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }

  function deleteGuestRecipe(id) {
    setGuestRecipes(prev => prev.filter(r => r.id !== id));
    // Also remove from recents so the tab doesn't show a ghost card
    setRecentIds(prev => prev.filter(rid => rid !== id));
  }

  // Records a recipe visit in the recents list.
  // Called by DetailView whenever a recipe is opened.
  // Moves the ID to the front if it's already in the list, then trims to RECENTS_MAX.
  function recordRecent(id) {
    setRecentIds(prev => {
      const withoutCurrent = prev.filter(rid => rid !== id);
      return [id, ...withoutCurrent].slice(0, RECENTS_MAX);
    });
  }

  // Returns the guest recipes array so the caller can POST them after signup.
  // Labels are included in the spread so they migrate along with everything else.
  async function migrateGuestRecipes(newToken) {
    const toMigrate = [...guestRecipes];
    if (toMigrate.length > 0) {
      await Promise.all(toMigrate.map(r =>
        saveRecipe({
          title: r.title,
          ingredients: r.ingredients,
          instructions: r.instructions,
          notes: r.notes || [],
          labels: r.labels || [],
          image_url: r.image_url || null,
        }, newToken)
      ));
    }
    setGuestRecipes([]);
    localStorage.removeItem(GUEST_RECIPES_KEY);
    // Keep recentIds — the migrated recipes will have new IDs from the DB,
    // so recents won't match, but that's preferable to clearing them entirely.
  }

  return (
    <AuthContext.Provider value={{
      user, token, loading, wakingUp,
      isGuest, guestRecipes,
      recentIds, recordRecent,
      enterGuestMode,
      addGuestRecipe, updateGuestRecipe, deleteGuestRecipe,
      migrateGuestRecipes,
      login, logout, signup,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}