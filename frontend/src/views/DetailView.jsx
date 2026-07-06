import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import RecipeEditor from "../components/RecipeEditor";
import {
  updateRecipe, deleteRecipe, translateRecipe, saveRecipe,
  uploadRecipeImage_toStorage, scaleRecipe, fetchRecipeById,
  shareRecipe, unshareRecipe,
} from "../api";
import { useAuth } from "../context/AuthContext";
import { tryScaleAll } from "../utils/scaleUtils";
import { formatIngredient } from "../utils/parseUtils";

const BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

const toItems = (arr) =>
  (arr || []).map((item, i) => {
    // Section headers pass through with their type intact
    if (item.type === "section") {
      return { ...item, id: item.id || `sec-${Date.now()}-${i}` };
    }
    return {
      id: `item-${Date.now()}-${i}`,
      // Ingredients are structured objects { amount, unit, name } —
      // format them back to a readable string for the editor's text field.
      // Instructions are objects with a text field.
      // Old recipes are plain strings. Handle all three.
      text: typeof item === "string"
        ? item
        : item.text !== undefined
          ? item.text
          : formatIngredient(item),
      images: typeof item === "string" ? [] : (item.images || []),
      // Preserve the structured object so RecipeEditor can skip re-parsing it
      structured: item.amount !== undefined ? item : undefined,
    };
  });

async function translateTextForGuest(recipe) {
  // Normalize instructions to plain strings for the API
  const instructions = (recipe.instructions || []).map((s) =>
    typeof s === "string" ? s : s.text
  );
  const res = await fetch(`${BASE}/translate-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: recipe.title,
      ingredients: recipe.ingredients,
      instructions,
    }),
  });
  if (!res.ok) throw new Error("Translation failed");
  return res.json();
}

export default function DetailView({ allRecipes, onUpdated, onDeleted, onSaved }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, isGuest, guestRecipes, updateGuestRecipe, deleteGuestRecipe, addGuestRecipe, recordRecent } = useAuth();

  // recipe is null while loading, then the full recipe object once fetched
  const [recipe, setRecipe] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editIngredients, setEditIngredients] = useState([]);
  const [editInstructions, setEditInstructions] = useState([]);
  const [editLabels, setEditLabels] = useState([]);

  const [editImageFile, setEditImageFile] = useState(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  const [translated, setTranslated] = useState(null);
  const [showingTranslation, setShowingTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationSaved, setTranslationSaved] = useState(false);

  const [originalServings, setOriginalServings] = useState(4);
  const [targetServings, setTargetServings] = useState(4);
  const [scaledIngredients, setScaledIngredients] = useState(null);
  const [scaling, setScaling] = useState(false);

  // Share state
  const [shareToken, setShareToken] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // The linked sub-recipe currently shown in the side panel, or null if closed
  const [subRecipe, setSubRecipe] = useState(null);

  // ── Load recipe ──
  // We depend on `id` so navigating from one recipe to another (e.g. via
  // the sub-recipe panel) re-fetches the new recipe automatically.
  useEffect(() => {
    setRecipe(null);
    setLoadError(null);
    setEditing(false);
    setTranslated(null);
    setShowingTranslation(false);
    setScaledIngredients(null);
    setShareToken(null);

    if (isGuest) {
      // Guests: find the recipe in localStorage-backed guestRecipes by ID
      const found = guestRecipes.find((r) => String(r.id) === String(id));
      if (found) {
        setRecipe(found);
        setShareToken(found.share_token || null);
        recordRecent(found.id);
      } else {
        setLoadError("Recipe not found.");
      }
    } else {
      // Auth users: fetch from backend so the detail view works on
      // direct navigation, page refresh, and deep links
      fetchRecipeById(id, token)
        .then((data) => {
          setRecipe(data);
          setShareToken(data.share_token || null);
          recordRecent(data.id);
        })
        .catch(() => setLoadError("Recipe not found or you don't have access."));
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) {
    return (
      <>
        <button className="detail-back" onClick={() => navigate("/collection")}>← My collection</button>
        <div className="empty-state" style={{ paddingTop: "48px" }}>
          <p>{loadError}</p>
        </div>
      </>
    );
  }

  if (!recipe) {
    return (
      <>
        <button className="detail-back" onClick={() => navigate("/collection")}>← My collection</button>
        <div className="loading-state" style={{ paddingTop: "48px" }}>
          <div>
            <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          </div>
        </div>
      </>
    );
  }

  const isKorean = recipe.language === "ko";
  const displayed = showingTranslation && translated ? translated : recipe;

  const startEditing = () => {
    setEditTitle(recipe.title);
    setEditIngredients(toItems(recipe.ingredients));
    setEditInstructions(toItems(recipe.instructions));
    setEditLabels(recipe.labels || []);
    setScaledIngredients(null);
    setEditing(true);
  };

  const handleSaveEdits = async (cleanedIngredients) => {
    // Use the parsed+cleaned list passed from RecipeEditor when available.
    // Korean recipes pass null (no parsing needed), so fall back to editIngredients.
    const finalIngredients = cleanedIngredients !== null
      ? cleanedIngredients
      : editIngredients;
    try {
      if (isGuest) {
        const image_url = editImageFile
          ? editImageFile
          : removeExistingImage ? null : recipe.image_url;
        const updated = {
          title: editTitle,
          ingredients: finalIngredients.map((i) =>
            i.type === "section" ? i : (i.structured || { amount: null, unit: null, name: i.text })
          ),
          // Filter out blank instruction rows before saving
          instructions: editInstructions
            .filter((i) => i.type === "section" || i.text.trim())
            .map((i) =>
              i.type === "section" ? i : { text: i.text, images: i.images || [] }
            ),
          labels: editLabels,
          image_url,
        };
        updateGuestRecipe(recipe.id, updated);
        const updatedRecipe = { ...recipe, ...updated };
        setRecipe(updatedRecipe);
        onUpdated(updatedRecipe);
        setEditing(false); setEditImageFile(null); setRemoveExistingImage(false);
        return;
      }
      let image_url = removeExistingImage ? null : recipe.image_url;
      if (editImageFile) {
        const result = await uploadRecipeImage_toStorage(editImageFile, token);
        image_url = result.image_url;
      }
      const ingredients = finalIngredients.map((i) =>
        i.type === "section" ? i : (i.structured || { amount: null, unit: null, name: i.text })
      );
      const instructions = editInstructions
        .filter((i) => i.type === "section" || i.text.trim())
        .map((i) =>
          i.type === "section" ? i : { text: i.text, images: i.images || [] }
        );
      await updateRecipe(recipe.id, {
        title: editTitle,
        ingredients,
        instructions,
        notes: recipe.notes || [],
        language: recipe.language,
        labels: editLabels,
        image_url,
      }, token);
      const updatedRecipe = {
        ...recipe,
        title: editTitle,
        ingredients,
        instructions,
        labels: editLabels,
        image_url,
      };
      setRecipe(updatedRecipe);
      onUpdated(updatedRecipe);
      setEditing(false); setEditImageFile(null);
      setTranslated(null); setShowingTranslation(false); setRemoveExistingImage(false);
    } catch (e) { alert("Update failed"); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this recipe?")) return;
    if (isGuest) {
      deleteGuestRecipe(recipe.id);
      onDeleted();
      return;
    }
    try {
      await deleteRecipe(recipe.id, token);
      onDeleted();
    } catch (e) { alert("Delete failed"); }
  };

  const handleTranslate = async () => {
    if (translated) { setShowingTranslation(true); return; }
    setTranslating(true);
    try {
      const data = isGuest
        ? await translateTextForGuest(recipe)
        : await translateRecipe(recipe.id, "Korean", token);
      setTranslated(data);
      setShowingTranslation(true);
    } catch (e) {
      alert("Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  const handleScale = async () => {
    setScaling(true);
    try {
      const ratio = targetServings / originalServings;

      // Normalize ingredients to plain strings for scaling.
      // Skip section headers — they have no quantity to scale.
      const ingredientStrings = displayed.ingredients
        .filter((item) => !item.type)
        .map((item) => typeof item === "string" ? item : formatIngredient(item));

      const { scaled, needsGemini } = tryScaleAll(ingredientStrings, ratio);

      if (needsGemini.length === 0) {
        setScaledIngredients(scaled);
        return;
      }

      const hardStrings = needsGemini.map((i) => ingredientStrings[i]);
      const data = await scaleRecipe(hardStrings, originalServings, targetServings);

      needsGemini.forEach((originalIndex, geminiIndex) => {
        scaled[originalIndex] = data.ingredients[geminiIndex];
      });

      setScaledIngredients(scaled);
    } catch (e) {
      alert("Scaling failed");
    } finally {
      setScaling(false);
    }
  };

  const handleSaveTranslation = async () => {
    try {
      const translatedInstructions = translated.instructions.map((step, i) => {
        const originalStep = recipe.instructions[i];
        const originalImages = originalStep
          ? (typeof originalStep === "string" ? [] : (originalStep.images || []))
          : [];
        return { text: step, images: originalImages };
      });

      // Always include "Korean" on the translated copy; carry other labels too
      const originalLabels = recipe.labels || [];
      const translationLabels = originalLabels.includes("Korean")
        ? originalLabels
        : ["Korean", ...originalLabels];

      if (isGuest) {
        addGuestRecipe({
          title: translated.title,
          ingredients: translated.ingredients.map((ing) =>
            typeof ing === "string" ? ing : formatIngredient(ing)
          ),
          instructions: translatedInstructions,
          notes: [],
          language: "ko",
          labels: translationLabels,
          image_url: recipe.image_url || null,
        });
        setTranslationSaved(true);
        onSaved();
        return;
      }
      const saved = await saveRecipe({
        title: translated.title,
        ingredients: translated.ingredients.map((ing) =>
          typeof ing === "string" ? ing : formatIngredient(ing)
        ),
        instructions: translatedInstructions,
        notes: [],
        language: "ko",
        labels: translationLabels,
        image_url: recipe.image_url || null,
      }, token);
      setTranslationSaved(true);
      onSaved();
      navigate(`/recipe/${saved.id}`);
    } catch (e) {
      console.error("Translation save failed:", e);
      alert("Could not save translation: " + (e.response?.data?.detail || e.message));
    }
  };

  // ── Share handlers ──

  const handleShare = async () => {
    setSharing(true);
    try {
      // If we already have a token (from a previous share), skip the API call
      const token_ = shareToken || (await shareRecipe(recipe.id, token)).share_token;
      if (!shareToken) setShareToken(token_);
      const url = `${window.location.origin}/shared/${token_}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      // Reset "Copied!" label after 2 seconds
      setTimeout(() => setShareCopied(false), 2000);
    } catch (e) {
      alert("Could not generate share link");
    } finally {
      setSharing(false);
    }
  };

  const handleUnshare = async () => {
    if (!window.confirm("Revoke the share link? Anyone with the link will no longer be able to view this recipe.")) return;
    try {
      await unshareRecipe(recipe.id, token);
      setShareToken(null);
      setShareCopied(false);
    } catch (e) {
      alert("Could not revoke share link");
    }
  };

  // Find the full recipe object for a given linked ID so we can show it in the panel
  const findLinkedRecipe = (linkedId) => (allRecipes || []).find((r) => r.id === linkedId) || null;

  const ingredientsLabel = isKorean ? "재료" : showingTranslation ? "재료" : "Ingredients";
  const instructionsLabel = isKorean ? "조리법" : showingTranslation ? "조리법" : "Instructions";

  // Tracks which non-section ingredient index we're on when building the scaled list
  // (sections have no entry in scaledIngredients, so we need a separate counter)
  let scaledIndex = 0;

  return (
    <>
      <button className="detail-back" onClick={() => navigate("/collection")}>← My collection</button>

      {!editing ? (
        <>
          <div className="detail-header">
            <h2>{displayed.title}</h2>
            <div className="detail-actions">
              {!isKorean && (
                !showingTranslation ? (
                  <button className="btn-translate" onClick={handleTranslate} disabled={translating}>
                    {translating ? "처리중…" : "한국어로 보기"}
                  </button>
                ) : (
                  <button className="btn-translate active" onClick={() => setShowingTranslation(false)}>
                    View in English
                  </button>
                )
              )}
              {/* Share button — guests can't generate server-side tokens so hide it */}
              {!isGuest && (
                shareToken ? (
                  // Already shared — show "Copy link" (reuses existing token) and "Revoke"
                  <>
                    <button className="btn-share active" onClick={handleShare} disabled={sharing}>
                      {shareCopied ? "✓ Copied!" : "🔗 Copy link"}
                    </button>
                    <button className="btn-secondary" onClick={handleUnshare} title="Revoke share link">
                      Unshare
                    </button>
                  </>
                ) : (
                  <button className="btn-share" onClick={handleShare} disabled={sharing}>
                    {sharing ? "Generating…" : "🔗 Share"}
                  </button>
                )
              )}
              <button className="btn-secondary" onClick={startEditing}>Edit</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>

          {/* Label pills in view mode */}
          {(recipe.labels || []).length > 0 && (
            <div className="label-pill-row view-mode" style={{ marginBottom: "12px" }}>
              {recipe.labels.map((label) => (
                <span key={label} className={`label-pill ${label === "Favorite" ? "favorite" : ""}`}>
                  {label === "Favorite" ? "⭐ Favorite" : label}
                </span>
              ))}
            </div>
          )}

          {/* Header image */}
          {recipe.image_url && !removeExistingImage && (
            <div style={{ marginBottom: "16px", marginTop: "12px" }}>
              <img
                src={recipe.image_url}
                alt={recipe.title}
                onClick={() => setLightboxUrl(recipe.image_url)}
                style={{ width: "100%", maxHeight: "300px", objectFit: "cover", borderRadius: "8px", cursor: "zoom-in" }}
              />
            </div>
          )}

          {translating && (
            <div className="loading-state" style={{ padding: "24px 0" }}>
              <div>
                <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
              </div>
              <p style={{ marginTop: "12px" }}>처리중…</p>
            </div>
          )}

          {!translating && (
            <>
              {/* Servings scaler */}
              <div className="scaler-bar">
                <span className="scaler-label">Scale recipe:</span>
                <label className="scaler-field">
                  From
                  <input
                    type="number" min="1" value={originalServings}
                    onChange={(e) => { setOriginalServings(Number(e.target.value)); setScaledIngredients(null); }}
                    className="scaler-input"
                  />
                  servings
                </label>
                <span className="scaler-arrow">→</span>
                <label className="scaler-field">
                  To
                  <input
                    type="number" min="1" value={targetServings}
                    onChange={(e) => { setTargetServings(Number(e.target.value)); setScaledIngredients(null); }}
                    className="scaler-input"
                  />
                  servings
                </label>
                <button
                  className="btn-secondary"
                  onClick={handleScale}
                  disabled={scaling || originalServings < 1 || targetServings < 1 || originalServings === targetServings}
                >
                  {scaling ? "Scaling…" : "Scale"}
                </button>
                {scaledIngredients && (
                  <button className="btn-add" onClick={() => setScaledIngredients(null)}>Reset</button>
                )}
              </div>

              <p className="section-heading">{ingredientsLabel}</p>
              <ul className="detail-list">
                {displayed.ingredients.map((item, i) => {
                  if (item.type === "section") {
                    return <p key={i} className="section-label">{item.text || "—"}</p>;
                  }

                  const displayText = scaledIngredients
                    ? scaledIngredients[scaledIndex]
                    : (typeof item === "string" ? item : formatIngredient(item));

                  const linkedId = item.linkedRecipeId ?? item.structured?.linkedRecipeId;
                  const currentScaledIndex = scaledIndex;
                  if (!item.type) scaledIndex++;

                  return (
                    <li key={i}>
                      {linkedId ? (
                        <button
                          className="linked-chip"
                          onClick={() => setSubRecipe(findLinkedRecipe(linkedId))}
                          title="View linked recipe"
                        >
                          <span className="linked-chip-icon">📖</span>
                          {displayText}
                        </button>
                      ) : displayText}
                      {scaledIngredients && currentScaledIndex === 0 && (
                        <span className="scaler-badge">×{(targetServings / originalServings).toFixed(2).replace(/\.?0+$/, "")}</span>
                      )}
                    </li>
                  );
                })}
              </ul>

              <p className="section-heading">{instructionsLabel}</p>
              <ol className="detail-list" style={{ listStyle: "none" }}>
                {/* FIX: separate step counter so section headers don't cause numbers to skip */}
                {(() => {
                  let stepNum = 0;
                  return displayed.instructions.map((step, i) => {
                    if (step.type === "section") {
                      return <p key={i} className="section-label">{step.text || "—"}</p>;
                    }
                    stepNum++;
                    const text = typeof step === "string" ? step : step.text;
                    const images = typeof step === "string" ? [] : (step.images || []);
                    return (
                      <li key={i} style={{ display: "flex", flexDirection: "column", marginBottom: "10px" }}>
                        <div><span className="step-num">{stepNum}</span>{text}</div>
                        {images.length > 0 && (
                          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                            {images.map((url, imgIndex) => (
                              <img
                                key={imgIndex} src={url} alt={`Step ${stepNum}`}
                                onClick={() => setLightboxUrl(url)}
                                style={{ width: "100%", maxHeight: "300px", objectFit: "cover", borderRadius: "8px", cursor: "zoom-in" }}
                              />
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  });
                })()}
              </ol>

              {showingTranslation && !translationSaved && (
                <div style={{ marginTop: "24px" }}>
                  <button className="btn-primary" onClick={handleSaveTranslation}>한국어 버전 저장</button>
                </div>
              )}
              {showingTranslation && translationSaved && (
                <p style={{ marginTop: "24px", fontSize: "13px", color: "#2d6a4f" }}>✓ 저장되었습니다</p>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <input className="title-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          {recipe.image_url && !removeExistingImage && (
            <div style={{ marginBottom: "16px", marginTop: "12px" }}>
              <img src={recipe.image_url} alt={recipe.title}
                style={{ width: "100%", maxHeight: "300px", objectFit: "cover", borderRadius: "8px" }} />
              <button className="btn-add" onClick={() => setRemoveExistingImage(true)} style={{ marginTop: "8px" }}>
                Remove photo
              </button>
            </div>
          )}
          <RecipeEditor
            ingredients={editIngredients}
            setIngredients={setEditIngredients}
            instructions={editInstructions}
            setInstructions={setEditInstructions}
            labels={editLabels}
            setLabels={setEditLabels}
            onSave={handleSaveEdits}
            onCancel={() => { setEditing(false); setEditImageFile(null); setRemoveExistingImage(false); }}
            saveLabel={isKorean ? "저장" : "Save changes"}
            hasExistingImage={!!recipe.image_url && !removeExistingImage}
            onImageChange={setEditImageFile}
            onRemoveExisting={() => setRemoveExistingImage(true)}
            hidePhotoHeading={!!recipe.image_url && !removeExistingImage}
            allRecipes={allRecipes}
          />
        </>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, cursor: "zoom-out", padding: "24px",
          }}
        >
          <img src={lightboxUrl} alt="Full size"
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "8px", objectFit: "contain" }} />
        </div>
      )}

      {/* Sub-recipe side panel */}
      {subRecipe && (
        <div className="sub-panel-overlay" onClick={() => setSubRecipe(null)}>
          <div className="sub-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sub-panel-header">
              <p className="sub-panel-title">{subRecipe.title}</p>
              <button className="sub-panel-close" onClick={() => setSubRecipe(null)}>×</button>
            </div>
            <div className="sub-panel-open-btn">
              <button
                className="btn-primary"
                style={{ width: "100%" }}
                onClick={() => { setSubRecipe(null); navigate(`/recipe/${subRecipe.id}`); }}
              >
                Open full recipe →
              </button>
            </div>
            <p className="section-heading">Ingredients</p>
            <ul className="detail-list">
              {subRecipe.ingredients.map((item, i) => {
                if (item.type === "section") return <p key={i} className="section-label">{item.text}</p>;
                return <li key={i}>{typeof item === "string" ? item : formatIngredient(item)}</li>;
              })}
            </ul>
            <p className="section-heading">Instructions</p>
            <ol className="detail-list" style={{ listStyle: "none" }}>
              {(() => {
                let stepNum = 0;
                return subRecipe.instructions.map((step, i) => {
                  if (step.type === "section") return <p key={i} className="section-label">{step.text}</p>;
                  stepNum++;
                  const text = typeof step === "string" ? step : step.text;
                  return <li key={i}><span className="step-num">{stepNum}</span>{text}</li>;
                });
              })()}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
