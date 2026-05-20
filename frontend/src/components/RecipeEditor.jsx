import { useState, useEffect } from "react";
import EditableList from "./EditableList";
import { uploadRecipeImage_toStorage, parseIngredients } from "../api";
import { useAuth } from "../context/AuthContext";
import { imageToBase64 } from "../utils/imageUtils";
import { tryParseIngredient, formatIngredient } from "../utils/parseUtils";

export default function RecipeEditor({
  ingredients,
  setIngredients,
  instructions,
  setInstructions,
  onSave,
  onCancel,
  saveLabel,
  imageFile,
  hasExistingImage,
  onImageChange,
  onRemoveExisting,
}) {
  const { token, isGuest } = useAuth();
  const [preview, setPreview] = useState(null);
  const [saveImage, setSaveImage] = useState(false);
  // For guests, hold the base64 string so we can restore it if the user
  // unchecks then rechecks "save this image"
  const [base64Cache, setBase64Cache] = useState(null);

  const [isParsing, setIsParsing] = useState(false);

  // When a scanned image is passed in, show it as the preview automatically
  useEffect(() => {
    if (!imageFile) return;
    if (isGuest) {
      imageToBase64(imageFile).then((b64) => {
        setPreview(b64);
        setBase64Cache(b64);
        setSaveImage(false); // unchecked by default — user must confirm
      }).catch((e) => console.error("Preview generation failed:", e));
    } else {
      setPreview(URL.createObjectURL(imageFile));
      setSaveImage(false); // unchecked by default — user must confirm
    }
  }, [imageFile, isGuest]);

  const handleImagePick = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (isGuest) {
        // Guests: convert to base64 so it survives localStorage and page refresh
        const b64 = await imageToBase64(f);
        setPreview(b64);
        setBase64Cache(b64);
        setSaveImage(true); // user actively chose this image, so default to checked
        onImageChange?.(b64); // pass base64 string up, not the File
      } else {
        // Auth users: pass the raw File up so the parent can upload to Supabase Storage
        setPreview(URL.createObjectURL(f));
        setSaveImage(true); // user actively chose this image, so default to checked
        onImageChange?.(f);
      }
    } catch (e) {
      console.error("Image pick failed:", e);
      alert("Could not load image. Please try another file.");
    }
  };

  const handleRemoveImage = () => {
    setPreview(null);
    setBase64Cache(null);
    setSaveImage(false);
    onImageChange?.(null);
    onRemoveExisting?.();
  };

  const handleSaveImageToggle = (e) => {
    setSaveImage(e.target.checked);
    if (isGuest) {
      // Restore from cache for guests (base64 string), not the imageFile prop
      onImageChange?.(e.target.checked ? base64Cache : null);
    } else {
      // Auth users restore the original File object for Supabase upload
      onImageChange?.(e.target.checked ? imageFile : null);
    }
  };

  // Upload a step image immediately and add its URL to that instruction's images array
  const handleStepImagePick = async (e, index) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      let imageUrl;
      if (isGuest) {
        // Guests: convert to base64 — no Supabase Storage access without auth
        imageUrl = await imageToBase64(f);
      } else {
        // Auth users: upload to Supabase Storage and get back a public URL
        const result = await uploadRecipeImage_toStorage(f, token);
        imageUrl = result.image_url;
      }
      const updated = [...instructions];
      const currentImages = updated[index].images || [];
      updated[index] = { ...updated[index], images: [...currentImages, imageUrl] };
      setInstructions(updated);
    } catch (err) {
      console.error("Step image upload failed:", err);
      alert("Image upload failed");
    }
  };

  const handleRemoveStepImage = (stepIndex, imageIndex) => {
    const updated = [...instructions];
    const currentImages = [...(updated[stepIndex].images || [])];
    currentImages.splice(imageIndex, 1);
    updated[stepIndex] = { ...updated[stepIndex], images: currentImages };
    setInstructions(updated);
  };

  const handleSaveClick = async () => {
    setIsParsing(true);
    try {
      const results = [];
      const needsGemini = [];

      for (let i = 0; i < ingredients.length; i++) {
        const raw = ingredients[i].text.trim();
        if (!raw) continue;

        if (typeof ingredients[i].structured === "object" && ingredients[i].structured !== null) {
          results.push({ index: i, parsed: ingredients[i].structured });
          continue;
        }

        const parsed = tryParseIngredient(raw);
        if (parsed !== null) {
          results.push({ index: i, parsed });
        } else {
          results.push({ index: i, parsed: null });
          needsGemini.push({ resultIndex: results.length - 1, text: raw });
        }
      }

      if (needsGemini.length > 0) {
        const geminiResult = await parseIngredients(needsGemini.map((g) => g.text));
        needsGemini.forEach(({ resultIndex }, geminiIndex) => {
          results[resultIndex].parsed = geminiResult.ingredients[geminiIndex];
        });
      }

      // Update ingredients with structured objects and call onSave directly —
      // no confirmation step needed since formatting handles display correctly
      const updatedItems = results.map((r) => ({
        id: ingredients[r.index]?.id || `ing-${Date.now()}-${r.index}`,
        text: formatIngredient(r.parsed),
        structured: r.parsed,
      }));

      setIngredients(updatedItems);
      onSave();
    } catch (e) {
      console.error("Parsing failed:", e);
      alert("Could not parse ingredients");
    } finally {
      setIsParsing(false);
    }
  };

  // This is the renderExtra function passed to EditableList for instructions
  const renderStepImages = (item, i) => (
    <div style={{ marginTop: "8px", paddingLeft: "28px" }}>
      {(item.images || []).map((url, imgIndex) => (
        <div key={imgIndex} style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginRight: "8px", marginBottom: "8px" }}>
          <img
            src={url}
            alt={`Step ${i + 1}`}
            style={{ height: "80px", width: "80px", objectFit: "cover", borderRadius: "6px" }}
          />
          <button
            className="btn-remove"
            onClick={() => handleRemoveStepImage(i, imgIndex)}
            title="Remove image"
          >
            ×
          </button>
        </div>
      ))}
      <label className="btn-add" style={{ cursor: "pointer", fontSize: "12px" }}>
        + Add image
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => handleStepImagePick(e, i)}
        />
      </label>
    </div>
  );

  return (
    <div className="recipe-editor">
      <p className="section-heading">Photo</p>
      {preview ? (
        <div style={{ marginBottom: "12px" }}>
          <img
            src={preview}
            alt="Recipe"
            style={{ width: "100%", maxHeight: "240px", objectFit: "cover", borderRadius: "8px" }}
          />
          {imageFile && (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", fontSize: "14px" }}>
              <input
                type="checkbox"
                checked={saveImage}
                onChange={handleSaveImageToggle}
              />
              Save this image with the recipe
            </label>
          )}
          <button className="btn-add" onClick={handleRemoveImage} style={{ marginTop: "8px" }}>
            Remove photo
          </button>
        </div>
      ) : (
        !hasExistingImage && (
          <div style={{ marginBottom: "12px" }}>
            <label className="btn-add" style={{ cursor: "pointer" }}>
              + Add photo
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImagePick}
              />
            </label>
          </div>
        )
      )}

      <p className="section-heading">Ingredients</p>
      <EditableList
        items={ingredients}
        setItems={setIngredients}
        ordered={false}
        idPrefix="ing"
      />
      <button className="btn-add" onClick={() => setIngredients([...ingredients, { id: `ing-${Date.now()}`, text: "" }])}>
        + Add ingredient
      </button>

      <p className="section-heading">Instructions</p>
      <EditableList
        items={instructions}
        setItems={setInstructions}
        ordered={true}
        idPrefix="ins"
        renderExtra={renderStepImages} /* ← only instructions get this */
      />
      <button className="btn-add" onClick={() => setInstructions([...instructions, { id: `ins-${Date.now()}`, text: "", images: [] }])}>
        + Add step
      </button>

      <div className="editor-actions">
        {/* handleSaveClick parses ingredients silently before saving */}
        <button className="btn-primary" onClick={handleSaveClick} disabled={isParsing}>
          {isParsing ? "Parsing…" : (saveLabel || "Save")}
        </button>
        {onCancel && (
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </div>
  );
}