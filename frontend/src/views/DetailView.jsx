import { useState } from "react";
import RecipeEditor from "../components/RecipeEditor";
import { updateRecipe, deleteRecipe, translateRecipe, saveRecipe, uploadRecipeImage_toStorage, scaleRecipe } from "../api";
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
      // Ingredients are now structured objects { amount, unit, name } —
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

export default function DetailView({ recipe, onBack, onDeleted, onUpdated, onSaved, onNavigate, allRecipes }) {
  const { token, isGuest, updateGuestRecipe, deleteGuestRecipe, addGuestRecipe } = useAuth();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editIngredients, setEditIngredients] = useState([]);
  const [editInstructions, setEditInstructions] = useState([]);

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

  // The linked sub-recipe currently shown in the side panel, or null if closed
  const [subRecipe, setSubRecipe] = useState(null);

  const isKorean = recipe.language === "ko";
  const displayed = showingTranslation && translated ? translated : recipe;

  const startEditing = () => {
    setEditTitle(recipe.title);
    setEditIngredients(toItems(recipe.ingredients));
    setEditInstructions(toItems(recipe.instructions));
    setScaledIngredients(null);
    setEditing(true);
  };

  const handleSaveEdits = async () => {
    try {
      if (isGuest) {
        const image_url = editImageFile
          ? editImageFile
          : removeExistingImage ? null : recipe.image_url;
        const updated = {
          title: editTitle,
          // Use the structured object if present, otherwise fall back to
          // { amount: null, unit: null, name: text } so storage is always consistent.
          // Section headers pass through as-is (type: "section").
          ingredients: editIngredients.map((i) =>
            i.type === "section" ? i : (i.structured || { amount: null, unit: null, name: i.text })
          ),
          instructions: editInstructions.map((i) =>
            i.type === "section" ? i : { text: i.text, images: i.images || [] }
          ),
          image_url,
        };
        updateGuestRecipe(recipe.id, updated);
        onUpdated({ ...recipe, ...updated });
        setEditing(false);
        setEditImageFile(null);
        setRemoveExistingImage(false);
        return;
      }
      let image_url = removeExistingImage ? null : recipe.image_url;
      if (editImageFile) {
        const result = await uploadRecipeImage_toStorage(editImageFile, token);
        image_url = result.image_url;
      }
      // Same structured serialization for auth users
      const ingredients = editIngredients.map((i) =>
        i.type === "section" ? i : (i.structured || { amount: null, unit: null, name: i.text })
      );
      await updateRecipe(recipe.id, {
        title: editTitle,
        ingredients,
        instructions: editInstructions.map((i) =>
          i.type === "section" ? i : { text: i.text, images: i.images || [] }
        ),
        notes: recipe.notes || [],
        language: recipe.language,
        image_url,
      }, token);
      onUpdated({
        ...recipe,
        title: editTitle,
        ingredients,
        instructions: editInstructions.map((i) =>
          i.type === "section" ? i : { text: i.text, images: i.images || [] }
        ),
        image_url,
      });
      setEditing(false);
      setEditImageFile(null);
      setTranslated(null);
      setShowingTranslation(false);
      setRemoveExistingImage(false);
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
      // Korean ingredients are already plain strings; English ones may be
      // structured objects that need formatting first.
      const ingredientStrings = displayed.ingredients
        .filter((item) => !item.type)
        .map((item) => typeof item === "string" ? item : formatIngredient(item));

      // First pass: try client-side math for everything
      const { scaled, needsGemini } = tryScaleAll(ingredientStrings, ratio);

      if (needsGemini.length === 0) {
        setScaledIngredients(scaled);
        return;
      }

      // Second pass: send unparseable ingredients to Gemini as plain strings.
      // For Korean recipes this will be all ingredients; for English recipes
      // just the ones tryScaleAll couldn't handle (e.g. "juice of 1 lemon").
      // We send plain strings here regardless — /scale-text handles both.
      const hardStrings = needsGemini.map((i) => ingredientStrings[i]);
      const data = await scaleRecipe(hardStrings, originalServings, targetServings);

      // Splice results back into the correct positions
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
      // Carry step images from the original recipe if the step count matches.
      // Gemini returns plain strings, so we convert them to objects and attach
      // the original images where possible.
      const translatedInstructions = translated.instructions.map((step, i) => {
        const originalStep = recipe.instructions[i];
        const originalImages = originalStep
          ? (typeof originalStep === "string" ? [] : (originalStep.images || []))
          : [];
        return { text: step, images: originalImages };
      });

      if (isGuest) {
        addGuestRecipe({
          title: translated.title,
          // translated.ingredients are plain Korean strings from Gemini — store them as-is.
          // Don't pass them through structuring since Korean word order breaks our formatter.
          ingredients: translated.ingredients.map((ing) =>
            typeof ing === "string" ? ing : formatIngredient(ing)
          ),
          instructions: translatedInstructions,
          notes: [],
          language: "ko",
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
        image_url: recipe.image_url || null,
      }, token);
      setTranslationSaved(true);
      onSaved();
      onNavigate(saved);
    } catch (e) {
      console.error("Translation save failed:", e);
      alert("Could not save translation: " + (e.response?.data?.detail || e.message));
    }
  };

  // Find the full recipe object for a given linked ID so we can show it in the panel
  const findLinkedRecipe = (id) => (allRecipes || []).find((r) => r.id === id) || null;

  const ingredientsLabel = isKorean ? "재료" : showingTranslation ? "재료" : "Ingredients";
  const instructionsLabel = isKorean ? "조리법" : showingTranslation ? "조리법" : "Instructions";

  // Tracks which non-section ingredient index we're on when building the scaled list
  // (sections have no entry in scaledIngredients, so we need a separate counter)
  let scaledIndex = 0;

  return (
    <>
      <button className="detail-back" onClick={onBack}>← My collection</button>

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
              <button className="btn-secondary" onClick={startEditing}>Edit</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>

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
              {/* Servings scaler — only shown for authenticated users on non-Korean recipes in view mode */}
              <div className="scaler-bar">
                <span className="scaler-label">Scale recipe:</span>

                {/* Original servings — what the recipe currently makes */}
                <label className="scaler-field">
                  From
                  <input
                    type="number"
                    min="1"
                    value={originalServings}
                    onChange={(e) => {
                      setOriginalServings(Number(e.target.value));
                      // Clear any existing scaled result when the inputs change,
                      // so the displayed ingredients always match the current inputs
                      setScaledIngredients(null);
                    }}
                    className="scaler-input"
                  />
                  servings
                </label>

                <span className="scaler-arrow">→</span>

                {/* Target servings — what the user wants */}
                <label className="scaler-field">
                  To
                  <input
                    type="number"
                    min="1"
                    value={targetServings}
                    onChange={(e) => {
                      setTargetServings(Number(e.target.value));
                      setScaledIngredients(null);
                    }}
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

                {/* Reset button only appears once we have a scaled result */}
                {scaledIngredients && (
                  <button
                    className="btn-add"
                    onClick={() => setScaledIngredients(null)}
                  >
                    Reset
                  </button>
                )}
              </div>

              <p className="section-heading">{ingredientsLabel}</p>
              <ul className="detail-list">
                {displayed.ingredients.map((item, i) => {
                  // Section headers render as a label, not a list item
                  if (item.type === "section") {
                    return (
                      <p key={i} className="section-label">{item.text || "—"}</p>
                    );
                  }

                  // For scaled view, pull from scaledIngredients using a
                  // separate counter that skips section rows
                  const displayText = scaledIngredients
                    ? scaledIngredients[scaledIndex]
                    : (typeof item === "string" ? item : formatIngredient(item));

                  // Does this ingredient link to another recipe?
                  const linkedId = item.linkedRecipeId ?? item.structured?.linkedRecipeId;

                  const currentScaledIndex = scaledIndex;
                  if (!item.type) scaledIndex++;

                  return (
                    <li key={i}>
                      {linkedId ? (
                        // Clickable chip that opens the side panel
                        <>
                          <button
                            className="linked-chip"
                            onClick={() => setSubRecipe(findLinkedRecipe(linkedId))}
                            title="View linked recipe"
                          >
                            <span className="linked-chip-icon">📖</span>
                            {displayText}
                          </button>
                        </>
                      ) : (
                        /* Format structured ingredients as readable strings.
                           Scaled ingredients are already plain strings from tryScaleAll/Gemini.
                           Old recipes are plain strings too — typeof check handles both. */
                        displayText
                      )}
                      {scaledIngredients && currentScaledIndex === 0 && (
                        <span className="scaler-badge">×{(targetServings / originalServings).toFixed(2).replace(/\.?0+$/, "")}</span>
                      )}
                    </li>
                  );
                })}
              </ul>

              <p className="section-heading">{instructionsLabel}</p>
              <ol className="detail-list" style={{ listStyle: "none" }}>
                {displayed.instructions.map((step, i) => {
                  // Section headers in instructions
                  if (step.type === "section") {
                    return <p key={i} className="section-label">{step.text || "—"}</p>;
                  }

                  const text = typeof step === "string" ? step : step.text;
                  const images = typeof step === "string" ? [] : (step.images || []);
                  return (
                    <li key={i} style={{ display: "flex", flexDirection: "column", marginBottom: "10px" }}>
                      <div><span className="step-num">{i + 1}</span>{text}</div>
                      {images.length > 0 && (
                        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          {/* Step images */}
                          {images.map((url, imgIndex) => (
                            <img
                              key={imgIndex}
                              src={url}
                              alt={`Step ${i + 1}`}
                              onClick={() => setLightboxUrl(url)}
                              style={{ width: "100%", maxHeight: "300px", objectFit: "cover", borderRadius: "8px", cursor: "zoom-in" }}
                            />
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
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
            onSave={handleSaveEdits}
            onCancel={() => { setEditing(false); setEditImageFile(null); setRemoveExistingImage(false); }}
            saveLabel={isKorean ? "저장" : "Save changes"}
            hasExistingImage={!!recipe.image_url && !removeExistingImage}
            onImageChange={setEditImageFile}
            onRemoveExisting={() => setRemoveExistingImage(true)}
            hidePhotoHeading={!!recipe.image_url && !removeExistingImage}
            allRecipes={allRecipes} /* ← pass through for the link picker */
          />
        </>
      )}

      {/* Lightbox — clicking any image opens it here at full size */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, cursor: "zoom-out", padding: "24px",
          }}
        >
          <img
            src={lightboxUrl}
            alt="Full size"
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "8px", objectFit: "contain" }}
          />
        </div>
      )}

      {/* Sub-recipe side panel — slides in from the right when a linked ingredient is clicked */}
      {subRecipe && (
        <div className="sub-panel-overlay" onClick={() => setSubRecipe(null)}>
          <div className="sub-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sub-panel-header">
              <p className="sub-panel-title">{subRecipe.title}</p>
              <button className="sub-panel-close" onClick={() => setSubRecipe(null)}>×</button>
            </div>

            {/* Open full recipe button — navigates to that recipe's DetailView */}
            <div className="sub-panel-open-btn">
              <button
                className="btn-primary"
                style={{ width: "100%" }}
                onClick={() => { setSubRecipe(null); onNavigate(subRecipe); }}
              >
                Open full recipe →
              </button>
            </div>

            <p className="section-heading">Ingredients</p>
            <ul className="detail-list">
              {subRecipe.ingredients.map((item, i) => {
                if (item.type === "section") return <p key={i} className="section-label">{item.text}</p>;
                return (
                  <li key={i}>
                    {typeof item === "string" ? item : formatIngredient(item)}
                  </li>
                );
              })}
            </ul>

            <p className="section-heading">Instructions</p>
            <ol className="detail-list" style={{ listStyle: "none" }}>
              {subRecipe.instructions.map((step, i) => {
                if (step.type === "section") return <p key={i} className="section-label">{step.text}</p>;
                const text = typeof step === "string" ? step : step.text;
                return (
                  <li key={i}>
                    <span className="step-num">{i + 1}</span>{text}
                  </li>
                );
              })}
            </ol>

          </div>
        </div>
      )}
    </>
  );
}