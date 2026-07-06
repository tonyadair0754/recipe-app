import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchSharedRecipe, saveSharedRecipe } from "../api";
import { useAuth } from "../context/AuthContext";
import { formatIngredient } from "../utils/parseUtils";

export default function SharedRecipeView() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  const { token, isGuest, user, addGuestRecipe } = useAuth();

  const [recipe, setRecipe] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSharedRecipe(shareToken)
      .then(setRecipe)
      .catch(() => setLoadError("This recipe link is invalid or has been revoked."));
  }, [shareToken]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const recipeData = {
        title: recipe.title,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        notes: recipe.notes || [],
        language: recipe.language || "en",
        labels: recipe.labels || [],
        image_url: recipe.image_url || null,
      };
      if (isGuest) {
        addGuestRecipe(recipeData);
      } else {
        await saveSharedRecipe(recipeData, token);
      }
      setSaved(true);
    } catch (e) {
      alert("Could not save recipe. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="app">
        <div className="empty-state" style={{ paddingTop: "80px" }}>
          <p>{loadError}</p>
          <button className="btn-primary" style={{ marginTop: "16px" }} onClick={() => navigate("/")}>
            Go to RecipeLens
          </button>
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="loading-state" style={{ paddingTop: "80px" }}>
        <div>
          <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
        </div>
      </div>
    );
  }

  // ── Step counter (same pattern as DetailView — sections don't count) ──
  let stepNum = 0;

  return (
    <>
      {/* ── Save banner ── */}
      <div className="shared-banner">
        <div className="shared-banner-left">
          <span className="shared-banner-label">Shared via RecipeLens</span>
          <span className="shared-banner-title">{recipe.title}</span>
        </div>
        <div className="shared-banner-right">
          {saved ? (
            <span className="shared-banner-saved">✓ Saved to your collection</span>
          ) : (user || isGuest) ? (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save to my collection"}
            </button>
          ) : (
            // Not logged in and not a guest — prompt to sign up
            <button className="btn-primary" onClick={() => navigate("/")}>
              Sign up to save this recipe
            </button>
          )}
        </div>
      </div>

      {/* ── Recipe content (read-only) ── */}
      <div style={{ paddingTop: "24px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 500, letterSpacing: "-0.3px", marginBottom: "12px" }}>
          {recipe.title}
        </h2>

        {/* Label pills */}
        {(recipe.labels || []).length > 0 && (
          <div className="label-pill-row view-mode" style={{ marginBottom: "16px" }}>
            {recipe.labels.map((label) => (
              <span key={label} className={`label-pill ${label === "Favorite" ? "favorite" : ""}`}>
                {label === "Favorite" ? "⭐ Favorite" : label}
              </span>
            ))}
          </div>
        )}

        {/* Header image */}
        {recipe.image_url && (
          <div style={{ marginBottom: "20px" }}>
            <img
              src={recipe.image_url}
              alt={recipe.title}
              style={{ width: "100%", maxHeight: "300px", objectFit: "cover", borderRadius: "8px" }}
            />
          </div>
        )}

        <p className="section-heading">Ingredients</p>
        <ul className="detail-list">
          {recipe.ingredients.map((item, i) => {
            if (item.type === "section") {
              return <p key={i} className="section-label">{item.text || "—"}</p>;
            }
            return (
              <li key={i}>
                {typeof item === "string" ? item : formatIngredient(item)}
              </li>
            );
          })}
        </ul>

        <p className="section-heading">Instructions</p>
        <ol className="detail-list" style={{ listStyle: "none" }}>
          {recipe.instructions.map((step, i) => {
            if (step.type === "section") {
              return <p key={i} className="section-label">{step.text || "—"}</p>;
            }
            stepNum++;
            const text = typeof step === "string" ? step : step.text;
            return (
              <li key={i} style={{ display: "flex", flexDirection: "column", marginBottom: "10px" }}>
                <div><span className="step-num">{stepNum}</span>{text}</div>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
