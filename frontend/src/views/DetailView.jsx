import { useState } from "react";
import RecipeEditor from "../components/RecipeEditor";
import { updateRecipe, deleteRecipe, translateRecipe, saveRecipe, uploadRecipeImage_toStorage } from "../api";
import { useAuth } from "../context/AuthContext";

const toItems = (arr) =>
  (arr || []).map((text, i) => ({ id: `item-${Date.now()}-${i}`, text }));

export default function DetailView({ recipe, onBack, onDeleted, onUpdated, onSaved, onNavigate }) {
  const { token } = useAuth();  // ← get token from context instead of prop
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editIngredients, setEditIngredients] = useState([]);
  const [editInstructions, setEditInstructions] = useState([]);
  const [editImageFile, setEditImageFile] = useState(null);  // ← new
  const [translated, setTranslated] = useState(null);
  const [showingTranslation, setShowingTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationSaved, setTranslationSaved] = useState(false);

  const isKorean = recipe.language === "ko";
  const displayed = showingTranslation && translated ? translated : recipe;

  const startEditing = () => {
    setEditTitle(recipe.title);
    setEditIngredients(toItems(recipe.ingredients));
    setEditInstructions(toItems(recipe.instructions));
    setEditing(true);
  };

  const handleSaveEdits = async () => {
  try {
    let image_url = recipe.image_url;  // default to existing image
    if (editImageFile) {
      const result = await uploadRecipeImage_toStorage(editImageFile, token);
      image_url = result.image_url;
    }
    await updateRecipe(recipe.id, {
      title: editTitle,
      ingredients: editIngredients.map((i) => i.text),
      instructions: editInstructions.map((i) => i.text),
      notes: recipe.notes || [],
      language: recipe.language,
      image_url,
    }, token);
    onUpdated({
      ...recipe,
      title: editTitle,
      ingredients: editIngredients.map((i) => i.text),
      instructions: editInstructions.map((i) => i.text),
      image_url,
    });
    setEditing(false);
    setEditImageFile(null);
    setTranslated(null);
    setShowingTranslation(false);
  } catch (e) { alert("Update failed"); }
};

  const handleDelete = async () => {
    if (!window.confirm("Delete this recipe?")) return;
    try {
      await deleteRecipe(recipe.id, token);
      onDeleted();
    } catch (e) { alert("Delete failed"); }
  };

  const handleTranslate = async () => {
    if (translated) { setShowingTranslation(true); return; }
    setTranslating(true);
    try {
      const data = await translateRecipe(recipe.id, "Korean", token);
      setTranslated(data);
      setShowingTranslation(true);
    } catch (e) {
      alert("Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  const handleSaveTranslation = async () => {
    try {
      const saved = await saveRecipe({
        title: translated.title,
        ingredients: translated.ingredients,
        instructions: translated.instructions,
        notes: [],
        language: "ko",
      }, token);
      setTranslationSaved(true);
      onSaved();
      onNavigate(saved);
    } catch (e) {
      console.error("Save error:", e);
      alert("Could not save translation: " + (e.response?.data?.detail || e.message));
    }
  };

  const ingredientsLabel = isKorean ? "재료" : showingTranslation ? "재료" : "Ingredients";
  const instructionsLabel = isKorean ? "조리법" : showingTranslation ? "조리법" : "Instructions";

  return (
    <>
      <button className="detail-back" onClick={onBack}>
        ← My collection
      </button>

      {!editing ? (
        <>
          <div className="detail-header">
            <h2>{displayed.title}</h2>

            {recipe.image_url && (
              <img
                src={recipe.image_url}
                alt={recipe.title}
                style={{ width: "100%", maxHeight: "300px", objectFit: "cover", borderRadius: "8px", marginBottom: "16px" }}
              />
            )}

            <div className="detail-actions">
              {!isKorean && (
                !showingTranslation ? (
                  <button
                    className="btn-translate"
                    onClick={handleTranslate}
                    disabled={translating}
                  >
                    {translating ? "처리중…" : "한국어로 보기"}
                  </button>
                ) : (
                  <button
                    className="btn-translate active"
                    onClick={() => setShowingTranslation(false)}
                  >
                    View in English
                  </button>
                )
              )}
              <button className="btn-secondary" onClick={startEditing}>
                Edit
              </button>
              <button className="btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>

          {translating && (
            <div className="loading-state" style={{ padding: "24px 0" }}>
              <div>
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span className="loading-dot" />
              </div>
              <p style={{ marginTop: "12px" }}>처리중…</p>
            </div>
          )}

          {!translating && (
            <>
              <p className="section-heading">{ingredientsLabel}</p>
              <ul className="detail-list">
                {displayed.ingredients.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>

              <p className="section-heading">{instructionsLabel}</p>
              <ol className="detail-list" style={{ listStyle: "none" }}>
                {displayed.instructions.map((step, i) => (
                  <li key={i}>
                    <span className="step-num">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>

              {showingTranslation && !translationSaved && (
                <div style={{ marginTop: "24px" }}>
                  <button className="btn-primary" onClick={handleSaveTranslation}>
                    한국어 버전 저장
                  </button>
                </div>
              )}

              {showingTranslation && translationSaved && (
                <p style={{ marginTop: "24px", fontSize: "13px", color: "#2d6a4f" }}>
                  ✓ 저장되었습니다
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <input
            className="title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <RecipeEditor
            ingredients={editIngredients}
            setIngredients={setEditIngredients}
            instructions={editInstructions}
            setInstructions={setEditInstructions}
            onSave={handleSaveEdits}
            onCancel={() => setEditing(false)}
            saveLabel={isKorean ? "저장" : "Save changes"}
            onImageChange={setEditImageFile}
          />
        </>
      )}
    </>
  );
}