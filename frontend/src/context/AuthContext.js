import { createContext, useContext, useState, useEffect } from "react";
import { loginUser, signupUser, setupInterceptors } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wakingUp, setWakingUp] = useState(false);

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("rl_token");
    localStorage.removeItem("rl_user");
  };

  useEffect(() => {
    const savedToken = localStorage.getItem("rl_token");
    const savedUser = localStorage.getItem("rl_user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
    setupInterceptors(logout);
    checkBackendHealth();
  }, []);

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
    localStorage.setItem("rl_token", data.access_token);
    localStorage.setItem("rl_user", JSON.stringify(data.user));
    return data;
  };

  const signup = async (email, password) => {
    await signupUser(email, password);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}