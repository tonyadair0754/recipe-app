import { useState } from "react";
import RecipeEditor from "../components/RecipeEditor";
import { uploadRecipeImage, saveRecipe, uploadRecipeImage_toStorage } from "../api";
import { useAuth } from "../context/AuthContext";
import { formatIngredient } from "../utils/parseUtils";

const toItems = (arr) =>
  (arr || []).map((item, i) => ({
    id: `item-${Date.now()}-${i}`,
    text: typeof item === "string"
      ? item
      : item.text !== undefined
        ? item.text
        : formatIngredient(item),
    images: typeof item === "string" ? [] : (item.images || []),
    // Preserve the structured object so RecipeEditor can skip re-parsing it
    structured: item.amount !== undefined ? item : undefined,
  }));

export default function HomeView({ onSaved, allRecipes }) {
  const { token, isGuest, addGuestRecipe } = useAuth();
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [editedTitle, setEditedTitle] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualActive, setManualActive] = useState(false);
  const [manualIngredients, setManualIngredients] = useState([]);
  const [manualInstructions, setManualInstructions] = useState([]);
  const [imageToSave, setImageToSave] = useState(null);
  const [manualImageToSave, setManualImageToSave] = useState(null);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("Only image files are supported (JPG, PNG, HEIC, etc).");
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setRecipe(null);
    try {
      //upload endpoint works without auth — token is optional
      const data = await uploadRecipeImage(file, token);
      setRecipe(data);
      setEditedTitle(data.title);
      setIngredients(toItems(data.ingredients));
      setInstructions(toItems(data.instructions));
    } catch (e) {
      alert(e.response ? JSON.stringify(e.response.data) : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUploaded = async () => {
    try {
      if (isGuest) {
        const image_url = imageToSave || null;
        addGuestRecipe({
          title: editedTitle,
          // Use structured object if present, otherwise fall back to plain string —
          // same pattern as DetailView so storage is always consistent
          ingredients: ingredients.map((i) =>
            i.type === "section" ? i : (i.structured || { amount: null, unit: null, name: i.text })
          ),
          // Preserve step images — don't flatten to i.text
          instructions: instructions.map((i) =>
            i.type === "section" ? i : { text: i.text, images: i.images || [] }
          ),
          notes: recipe.notes || [],
          image_url,
        });
        setRecipe(null);
        setFile(null);
        setImageToSave(null);
        onSaved();
        return;
      }
      let image_url = null;
      if (imageToSave) {
        const result = await uploadRecipeImage_toStorage(imageToSave, token);
        image_url = result.image_url;
      }
      await saveRecipe({
        title: editedTitle,
        ingredients: ingredients.map((i) =>
          i.type === "section" ? i : (i.structured || { amount: null, unit: null, name: i.text })
        ),
        // Preserve step images here too — the previous code was flattening to i.text
        instructions: instructions.map((i) =>
          i.type === "section" ? i : { text: i.text, images: i.images || [] }
        ),
        notes: recipe.notes || [],
        image_url,
      }, token);
      setRecipe(null);
      setFile(null);
      setImageToSave(null);
      onSaved();
    } catch (e) {
      console.error("Save failed:", e);
      alert("Save failed: " + e.message);
    }
  };

  const startManual = () => {
    if (!manualTitle.trim()) return;
    setManualIngredients([{ id: `ing-${Date.now()}`, text: "" }]);
    setManualInstructions([{ id: `ins-${Date.now()}`, text: "" }]);
    setManualActive(true);
  };

  const handleSaveManual = async () => {
    try {
      if (isGuest) {
        const image_url = manualImageToSave || null;
        addGuestRecipe({
          title: manualTitle,
          ingredients: manualIngredients
            .filter((i) => i.type === "section" || i.text.trim())
            .map((i) => i.type === "section" ? i : (i.structured || { amount: null, unit: null, name: i.text })),
          instructions: manualInstructions
            .filter((i) => i.type === "section" || i.text.trim())
            .map((i) => i.type === "section" ? i : { text: i.text, images: i.images || [] }),
          notes: [],
          image_url,
        });
        setManualTitle("");
        setManualActive(false);
        setManualIngredients([]);
        setManualInstructions([]);
        setManualImageToSave(null);
        onSaved();
        return;
      }
      let image_url = null;
      if (manualImageToSave) {
        const result = await uploadRecipeImage_toStorage(manualImageToSave, token);
        image_url = result.image_url;
      }
      await saveRecipe({
        title: manualTitle,
        ingredients: manualIngredients
          .filter((i) => i.type === "section" || i.text.trim())
          .map((i) => i.type === "section" ? i : (i.structured || { amount: null, unit: null, name: i.text })),
        instructions: manualInstructions
          .filter((i) => i.type === "section" || i.text.trim())
          .map((i) => i.type === "section" ? i : { text: i.text, images: i.images || [] }),
        notes: [],
        image_url,
      }, token);
      setManualTitle("");
      setManualActive(false);
      setManualIngredients([]);
      setManualInstructions([]);
      setManualImageToSave(null);
      onSaved();
    } catch (e) { alert("Save failed"); }
  };

  if (manualActive) {
    return (
      <div className="recipe-editor">
        <input
          className="title-input"
          value={manualTitle}
          onChange={(e) => setManualTitle(e.target.value)}
          placeholder="Recipe name..."
        />
        <RecipeEditor
          ingredients={manualIngredients}
          setIngredients={setManualIngredients}
          instructions={manualInstructions}
          setInstructions={setManualInstructions}
          onSave={handleSaveManual}
          onCancel={() => { setManualActive(false); setManualTitle(""); }}
          saveLabel="Save to collection"
          onImageChange={setManualImageToSave}
          allRecipes={allRecipes}
        />
      </div>
    );
  }

  return (
    <>
      <div className="hero">
        <h1>Your recipes,<br /><span>all in one place</span></h1>
        <p>Scan a photo or write from scratch — we'll keep everything organized.</p>
      </div>

      <div className="entry-cards">
        <div className="card featured">
          <p className="card-label">From a photo</p>
          <h2>Scan a recipe</h2>
          <p>Upload any recipe image — printed, handwritten, or a cookbook page.</p>
          <div
            className="drop-zone"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
            style={{ borderColor: dragOver ? "#2d6a4f" : undefined }}
            onClick={() => document.getElementById("file-input").click()}
          >
            <input
              id="file-input"
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            {file
              ? <p style={{ color: "#2d6a4f" }}>{file.name}</p>
              : <p>Drop an image here, or</p>
            }
            <button
              className="btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                file ? handleUpload() : document.getElementById("file-input").click();
              }}
              disabled={loading}
            >
              {loading ? "Analyzing…" : file ? "Analyze recipe" : "Choose file"}
            </button>
          </div>
        </div>

        <div className="card">
          <p className="card-label">From scratch</p>
          <h2>Write a recipe</h2>
          <p>Add ingredients and steps manually.</p>
          <input
            className="text-input"
            style={{ marginTop: "18px" }}
            type="text"
            placeholder="Recipe name..."
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startManual()}
          />
          <button className="btn-primary full" onClick={startManual}>
            Start writing →
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <div>
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
          <p style={{ marginTop: "14px" }}>Reading your recipe…</p>
        </div>
      )}

      {recipe && !loading && (
        <div className="recipe-editor">
          <input
            className="title-input"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            placeholder="Recipe name..."
          />
          <RecipeEditor
            ingredients={ingredients}
            setIngredients={setIngredients}
            instructions={instructions}
            setInstructions={setInstructions}
            onSave={handleSaveUploaded}
            onCancel={() => { setRecipe(null); setFile(null); setEditedTitle(""); }}
            saveLabel="Save to collection"
            imageFile={file}
            onImageChange={setImageToSave}
            allRecipes={allRecipes}
          />
        </div>
      )}
    </>
  );
}