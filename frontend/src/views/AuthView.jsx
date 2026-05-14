import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function AuthView() {
  const { login, signup, enterGuestMode, migrateGuestRecipes } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(email, password);
        // After signup, log users in and migrate any guest recipes
        const data = await login(email, password);
        await migrateGuestRecipes(data.access_token);
      }
    } catch (e) {
      setError(e.response?.data?.detail || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo" style={{ marginBottom: "24px" }}>
          <div className="logo-dot" />
          RecipeLens
        </div>

        <h2 className="auth-title">
          {mode === "login" ? "Welcome back" : "Create an account"}
        </h2>
        <p className="auth-sub">
          {mode === "login"
            ? "Sign in to access your recipe collection."
            : "Save and organize your recipes in one place."}
        </p>

        {message && <p className="auth-message">{message}</p>}
        {error && <p className="auth-error">{error}</p>}

        <div className="auth-fields">
          <input
            className="text-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <input
            className="text-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        <button
          className="btn-primary"
          style={{ width: "100%", marginTop: "12px" }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <p className="auth-switch">
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button
            className="btn-ghost"
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setMessage(null); }}
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            onClick={enterGuestMode}
            style={{ background: 'none', border: 'none', color: '#2d6a4f', cursor: 'pointer',
                     textDecoration: 'underline', fontSize: '0.9rem' }}
          >
            Continue without an account
          </button>
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.4rem' }}>
            Your recipes will be saved locally on this device.
          </p>
        </div>
      </div>
    </div>
  );
}