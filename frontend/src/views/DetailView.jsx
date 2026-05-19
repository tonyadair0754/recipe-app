import { useState } from "react";
import RecipeEditor from "../components/RecipeEditor";
import { updateRecipe, deleteRecipe, translateRecipe, saveRecipe, uploadRecipeImage_toStorage, scaleRecipe } from "../api";
import { useAuth } from "../context/AuthContext";
import { tryScaleAll } from "../utils/scaleUtils";

const BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

const toItems = (arr) =>
  (arr || []).map((item, i) => ({
    id: `item-${Date.now()}-${i}`,
    text: typeof item === "string" ? item : item.text,
    images: typeof item === "string" ? [] : (item.images || []),
  }));

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

export default function DetailView({ recipe, onBack, onDeleted, onUpdated, onSaved, onNavigate }) {
  const { token, isGuest, updateGuestRecipe, deleteGuestRecipe, addGuestRecipe } = useAuth();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editIngredients, setEditIngredients] = useState([]);
  const [editInstructions, setEditInstructions] = useState([]);
  const [editImageFile, setEditImageFile] = useState(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);

  const [translated, setTranslated] = useState(null);
  const [showingTranslation, setShowingTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationSaved, setTranslationSaved] = useState(false);

  const [originalServings, setOriginalServings] = useState(4);
  const [targetServings, setTargetServings] = useState(4);
  const [scaledIngredients, setScaledIngredients] = useState(null);
  const [scaling, setScaling] = useState(false);


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
        // editImageFile is already a base64 string for guests (converted inside RecipeEditor)
        const image_url = editImageFile
          ? editImageFile
          : removeExistingImage ? null : recipe.image_url;
        const updated = {
          title: editTitle,
          ingredients: editIngredients.map((i) => i.text),
          instructions: editInstructions.map((i) => ({ text: i.text, images: i.images || [] })),
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
      await updateRecipe(recipe.id, {
        title: editTitle,
        ingredients: editIngredients.map((i) => i.text),
        instructions: editInstructions.map((i) => ({ text: i.text, images: i.images || [] })),
        notes: recipe.notes || [],
        language: recipe.language,
        image_url,
      }, token);
      onUpdated({
        ...recipe,
        title: editTitle,
        ingredients: editIngredients.map((i) => i.text),
        instructions: editInstructions.map((i) => ({ text: i.text, images: i.images || [] })),
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
      const ingredients = displayed.ingredients.map((item) =>
        typeof item === "string" ? item : item.text
      );
      const ratio = targetServings / originalServings;

      // First pass: scale everything we can with math
      const { scaled, needsGemini } = tryScaleAll(ingredients, ratio);

      if (needsGemini.length === 0) {
        // All ingredients parsed successfully — no API call needed
        setScaledIngredients(scaled);
        return;
      }

      // Second pass: send only the unparseable ingredients to Gemini
      const hardIngredients = needsGemini.map((i) => ingredients[i]);
      const data = await scaleRecipe(hardIngredients, originalServings, targetServings);

      // Splice Gemini's results back into the correct positions
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
          ingredients: translated.ingredients,
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
        ingredients: translated.ingredients,
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

  const ingredientsLabel = isKorean ? "재료" : showingTranslation ? "재료" : "Ingredients";
  const instructionsLabel = isKorean ? "조리법" : showingTranslation ? "조리법" : "Instructions";

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

          {recipe.image_url && !removeExistingImage && (
            <div style={{ marginBottom: "16px", marginTop: "12px" }}>
              <img src={recipe.image_url} alt={recipe.title}
                style={{ width: "100%", maxHeight: "300px", objectFit: "cover", borderRadius: "8px" }} />
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
                {(scaledIngredients || displayed.ingredients).map((item, i) => (
                  <li key={i}>
                    {item}
                    {/* Show a subtle tag on scaled ingredients so the user knows they're looking at scaled amounts */}
                    {scaledIngredients && i === 0 && (
                      <span className="scaler-badge">×{(targetServings / originalServings).toFixed(2).replace(/\.?0+$/, "")}</span>
                    )}
                  </li>
                ))}
              </ul>

              <p className="section-heading">{instructionsLabel}</p>
              <ol className="detail-list" style={{ listStyle: "none" }}>
                {displayed.instructions.map((step, i) => {
                  const text = typeof step === "string" ? step : step.text;
                  const images = typeof step === "string" ? [] : (step.images || []);
                  return (
                    <li key={i} style={{ display: "flex", flexDirection: "column", marginBottom: "16px" }}>
                      <div><span className="step-num">{i + 1}</span>{text}</div>
                      {images.length > 0 && (
                        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          {images.map((url, imgIndex) => (
                            <img key={imgIndex} src={url} alt={`Step ${i + 1}`}
                              style={{ width: "100%", maxHeight: "300px", objectFit: "cover", borderRadius: "8px" }} />
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
          />
        </>
      )}
    </>
  );
}