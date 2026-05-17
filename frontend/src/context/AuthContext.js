import { createContext, useContext, useState, useEffect } from "react";
import { loginUser, signupUser, setupInterceptors, saveRecipe } from "../api";

const AuthContext = createContext(null);
const GUEST_RECIPES_KEY = 'rl_guest_recipes';

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

  // Persist guest recipes whenever they change
  useEffect(() => {
    localStorage.setItem(GUEST_RECIPES_KEY, JSON.stringify(guestRecipes));
  }, [guestRecipes]);

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
  };

  const signup = async (email, password) => {
    await signupUser(email, password);
  };

  function enterGuestMode() {
    setIsGuest(true);
  }

  function addGuestRecipe(recipe) {
    const newRecipe = { ...recipe, id: `guest_${Date.now()}`, language: 'en' };
    setGuestRecipes(prev => [newRecipe, ...prev]);
    return newRecipe;
  }

  function updateGuestRecipe(id, updates) {
    setGuestRecipes(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }

  function deleteGuestRecipe(id) {
    setGuestRecipes(prev => prev.filter(r => r.id !== id));
  }

  // Returns the guest recipes array so the caller can POST them after signup
  async function migrateGuestRecipes(newToken) {
    const toMigrate = [...guestRecipes];
    if (toMigrate.length > 0) {
      await Promise.all(toMigrate.map(r =>
        saveRecipe({
          title: r.title,
          ingredients: r.ingredients,
          instructions: r.instructions,
          notes: r.notes || [],
          image_url: r.image_url || null,
        }, newToken)
      ));
    }
    setGuestRecipes([]);
    localStorage.removeItem(GUEST_RECIPES_KEY);
  }

  return (
    <AuthContext.Provider value={{
      user, token, loading, wakingUp,
      isGuest, guestRecipes,
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