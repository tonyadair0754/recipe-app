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

  // Parsing state — holds the structured ingredient objects during the
  // confirmation step, or null when not in confirmation mode
  const [parsedIngredients, setParsedIngredients] = useState(null);
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

  // Called when the user clicks Save. Parses ingredients before actually saving.
  const handleSaveClick = async () => {
    setIsParsing(true);
    try {
      const results = [];
      const needsGemini = []; // indices of ingredients that couldn't be parsed client-side

      for (let i = 0; i < ingredients.length; i++) {
        const raw = ingredients[i].text.trim();

        // Skip empty rows — the user may have added a blank ingredient accidentally
        if (!raw) continue;

        // Check if this ingredient is already structured (e.g. came from a scanned recipe)
        // If so, no parsing needed
        if (typeof ingredients[i].structured === "object" && ingredients[i].structured !== null) {
          results.push({ index: i, parsed: ingredients[i].structured });
          continue;
        }

        const parsed = tryParseIngredient(raw);
        if (parsed !== null) {
          results.push({ index: i, parsed });
        } else {
          // Couldn't parse client-side — queue for Gemini
          results.push({ index: i, parsed: null });
          needsGemini.push({ resultIndex: results.length - 1, text: raw });
        }
      }

      // Send unparseable ingredients to Gemini in one batch
      if (needsGemini.length > 0) {
        const geminiResult = await parseIngredients(needsGemini.map((g) => g.text));
        // Splice Gemini's results back into the correct positions
        needsGemini.forEach(({ resultIndex }, geminiIndex) => {
          results[resultIndex].parsed = geminiResult.ingredients[geminiIndex];
        });
      }

      // Show confirmation UI with the parsed results
      setParsedIngredients(results.map((r) => ({
        // The original text the user typed, for display in the confirmation UI
        original: ingredients[r.index].text,
        // The structured object we'll save if the user confirms
        parsed: r.parsed,
        // Whether the user has edited this row in the confirmation UI
        // We start with the formatted version of the parsed result
        confirmed: formatIngredient(r.parsed),
      })));
    } catch (e) {
      console.error("Parsing failed:", e);
      alert("Could not parse ingredients");
    } finally {
      setIsParsing(false);
    }
  };

  // Called when the user confirms the parsed ingredients and actually saves
  const handleConfirmSave = () => {
    // Convert confirmed strings back to structured objects for storage.
    // The user may have edited the confirmed text, so we re-parse it.
    // If re-parsing fails, we fall back to storing it as { amount: null, unit: null, name: text }
    // so nothing is lost.
    const finalIngredients = parsedIngredients.map((item) => {
      const reParsed = tryParseIngredient(item.confirmed);
      return reParsed || { amount: null, unit: null, name: item.confirmed };
    });

    // Update the ingredients list with the final structured objects,
    // keeping the existing id and images fields intact
    const updatedItems = finalIngredients.map((parsed, i) => ({
      id: ingredients[i]?.id || `ing-${Date.now()}-${i}`,
      text: formatIngredient(parsed),
      structured: parsed,
    }));

    setIngredients(updatedItems);
    setParsedIngredients(null);
    onSave();
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

  // ── Confirmation UI ──
  // Shown after parsing, before the actual save
  if (parsedIngredients) {
    return (
      <div className="recipe-editor">
        <p className="section-heading">Confirm ingredients</p>
        <p style={{ fontSize: "13px", color: "#666", marginBottom: "16px" }}>
          Review how your ingredients were parsed. You can edit any line before saving.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
          {parsedIngredients.map((item, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {/* Show the original text in grey so the user can compare */}
              <span style={{ fontSize: "12px", color: "#999" }}>Original: {item.original}</span>
              <input
                className="editable-input"
                value={item.confirmed}
                onChange={(e) => {
                  // Let the user edit the confirmed text inline
                  const updated = [...parsedIngredients];
                  updated[i] = { ...updated[i], confirmed: e.target.value };
                  setParsedIngredients(updated);
                }}
              />
            </div>
          ))}
        </div>
        <div className="editor-actions">
          <button className="btn-primary" onClick={handleConfirmSave}>
            {saveLabel || "Save"}
          </button>
          <button className="btn-secondary" onClick={() => setParsedIngredients(null)}>
            Back
          </button>
        </div>
      </div>
    );
  }

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
        {/* handleSaveClick parses ingredients first, then shows confirmation UI */}
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