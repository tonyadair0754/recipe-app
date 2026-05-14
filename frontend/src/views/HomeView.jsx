import { useState } from "react";
import RecipeEditor from "../components/RecipeEditor";
import { uploadRecipeImage, saveRecipe, uploadRecipeImage_toStorage } from "../api";
import { useAuth } from "../context/AuthContext";

const toItems = (arr) =>
  (arr || []).map((text, i) => ({ id: `item-${Date.now()}-${i}`, text }));

export default function HomeView({ onSaved }) {
  const { token } = useAuth();
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [manualTitle, setManualTitle] = useState("");
  const [manualActive, setManualActive] = useState(false);
  const [manualIngredients, setManualIngredients] = useState([]);
  const [manualInstructions, setManualInstructions] = useState([]);
  const [imageToSave, setImageToSave] = useState(null);
  const [manualImageToSave, setManualImageToSave] = useState(null);

  const handleFile = (f) => { if (f) setFile(f); };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setRecipe(null);
    try {
      const data = await uploadRecipeImage(file, token);
      console.log("Upload response:", data);
      setRecipe(data);
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
      let image_url = null;
      if (imageToSave) {
        const result = await uploadRecipeImage_toStorage(imageToSave, token);
        image_url = result.image_url;
      }
      await saveRecipe({
        title: recipe.title,
        ingredients: ingredients.map((i) => i.text),
        instructions: instructions.map((i) => i.text),
        notes: recipe.notes || [],
        image_url,
      }, token);
      setRecipe(null);
      setFile(null);
      setImageToSave(null);
      onSaved();
    } catch (e) { alert("Save failed"); }
  };

  const startManual = () => {
    if (!manualTitle.trim()) return;
    setManualIngredients([{ id: `ing-${Date.now()}`, text: "" }]);
    setManualInstructions([{ id: `ins-${Date.now()}`, text: "" }]);
    setManualActive(true);
  };

  const handleSaveManual = async () => {
    try {
      let image_url = null;
      if (manualImageToSave) {
        const result = await uploadRecipeImage_toStorage(manualImageToSave, token);
        image_url = result.image_url;
      }
      await saveRecipe({
        title: manualTitle,
        ingredients: manualIngredients.map((i) => i.text).filter(Boolean),
        instructions: manualInstructions.map((i) => i.text).filter(Boolean),
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
          <h2>{recipe.title}</h2>
          <RecipeEditor
            ingredients={ingredients}
            setIngredients={setIngredients}
            instructions={instructions}
            setInstructions={setInstructions}
            onSave={handleSaveUploaded}
            onCancel={() => { setRecipe(null); setFile(null); }}
            saveLabel="Save to collection"
            imageFile={file}
            onImageChange={setImageToSave}
          />
        </div>
      )}
    </>
  );
}