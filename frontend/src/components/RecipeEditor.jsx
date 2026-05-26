import { useState, useEffect } from "react";
import EditableList from "./EditableList";
import { uploadRecipeImage_toStorage, parseIngredients } from "../api";
import { useAuth } from "../context/AuthContext";
import { imageToBase64 } from "../utils/imageUtils";
import { tryParseIngredient, formatIngredient, normalizeSearch } from "../utils/parseUtils";

export default function RecipeEditor({
  ingredients,
  setIngredients,
  instructions,
  setInstructions,
  labels,
  setLabels,
  onSave,
  onCancel,
  saveLabel,
  imageFile,
  hasExistingImage,
  onImageChange,
  onRemoveExisting,
  hidePhotoHeading,
  allRecipes,
  language,
}) {
  const { token, isGuest } = useAuth();
  const [preview, setPreview] = useState(null);
  const [saveImage, setSaveImage] = useState(false);
  // For guests, hold the base64 string so we can restore it if the user
  // unchecks then rechecks "save this image"
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [base64Cache, setBase64Cache] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  // Index of the ingredient row whose link picker is currently open, or null
  const [openPickerIndex, setOpenPickerIndex] = useState(null);
  // Search string inside the link picker dropdown
  const [pickerSearch, setPickerSearch] = useState("");
  // The text currently typed in the label input field
  const [labelInput, setLabelInput] = useState("");

  // Safely normalize the labels prop — it may be undefined on older recipes
  // that predate the labels feature, so we always fall back to an empty array.
  const currentLabels = labels || [];
  const isFavorite = currentLabels.includes("Favorite");

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

  // Close the link picker if the user clicks anywhere outside it
  useEffect(() => {
    if (openPickerIndex === null) return;
    const handler = () => setOpenPickerIndex(null);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openPickerIndex]);

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

  // Link a recipe to the ingredient at the given index.
  // We store the link in item.structured.linkedRecipeId so it round-trips
  // through the save path without any schema changes.
  const handleLinkRecipe = (ingredientIndex, recipeId) => {
    const updated = [...ingredients];
    const item = updated[ingredientIndex];
    const existing = item.structured || { amount: null, unit: null, name: item.text };
    updated[ingredientIndex] = {
      ...item,
      structured: { ...existing, linkedRecipeId: recipeId },
    };
    setIngredients(updated);
    setOpenPickerIndex(null);
    setPickerSearch(""); // clear search so it's fresh next time the picker opens
  };

  const handleUnlinkRecipe = (ingredientIndex) => {
    const updated = [...ingredients];
    const item = updated[ingredientIndex];
    if (!item.structured) return;
    // Remove the link but keep the rest of the structured data intact
    const { linkedRecipeId, ...rest } = item.structured;
    updated[ingredientIndex] = { ...item, structured: rest };
    setIngredients(updated);
    setOpenPickerIndex(null);
    setPickerSearch("");
  };

  // ── Label helpers ──

  // Adds a label if it's non-empty and not already present (case-insensitive check).
  // Called when the user presses Enter or comma in the label input.
  const addLabel = (raw) => {
    const trimmed = raw.trim().replace(/,$/, ""); // strip trailing comma
    if (!trimmed) return;
    // Prevent duplicates regardless of capitalization
    const alreadyExists = currentLabels.some(
      (l) => l.toLowerCase() === trimmed.toLowerCase()
    );
    if (!alreadyExists) {
      setLabels([...currentLabels, trimmed]);
    }
    setLabelInput("");
  };

  const removeLabel = (label) => {
    setLabels(currentLabels.filter((l) => l !== label));
  };

  // The Favorite toggle is a special-case: it adds/removes the exact string "Favorite"
  // so CollectionView can filter on it without any hardcoded logic in the DB.
  const toggleFavorite = () => {
    if (isFavorite) {
      setLabels(currentLabels.filter((l) => l !== "Favorite"));
    } else {
      // Put Favorite first so it always appears at the start of the pill row
      setLabels(["Favorite", ...currentLabels.filter((l) => l !== "Favorite")]);
    }
  };

  const handleLabelKeyDown = (e) => {
    // Enter or comma both commit the current input as a new label
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault(); // stop Enter from submitting any parent form
      addLabel(labelInput);
    }
    // Backspace on an empty input removes the last label — a common tag-input pattern
    if (e.key === "Backspace" && labelInput === "" && currentLabels.length > 0) {
      setLabels(currentLabels.slice(0, -1));
    }
  };

  const handleSaveClick = async () => {
    // Korean ingredients are plain strings — the English regex parser can't handle them,
    // and they don't need structuring. Skip parsing entirely and save as-is.
    if (language === "ko") {
      onSave(null, null); // null signals "use state as-is"
      return;
    }

    // If there are no non-blank, non-section ingredients, skip parsing and save directly
    const nonEmpty = ingredients.filter((i) => i.text.trim() || i.type === "section");
    if (nonEmpty.length === 0) {
      onSave([], null);
      return;
    }

    setIsParsing(true);
    try {
      const results = [];
      const needsGemini = [];

      for (let i = 0; i < ingredients.length; i++) {
        // Section headers aren't ingredients — pass them through unchanged
        if (ingredients[i].type === "section") {
          results.push({ index: i, parsed: null, isSection: true });
          continue;
        }

        const raw = ingredients[i].text.trim();
        // Skip blank rows — they won't be included in the saved result
        if (!raw) continue;

        if (typeof ingredients[i].structured === "object" && ingredients[i].structured !== null) {
          const existing = ingredients[i].structured;
          const formattedFromStructured = formatIngredient(existing);
          const userChangedName = raw !== formattedFromStructured;
          if (userChangedName) {
            const reparsed = tryParseIngredient(raw);
            const linkedRecipeId = existing.linkedRecipeId;
            if (reparsed) {
              results.push({ index: i, parsed: linkedRecipeId ? { ...reparsed, linkedRecipeId } : reparsed });
            } else {
              results.push({ index: i, parsed: null, linkedRecipeId });
              needsGemini.push({ resultIndex: results.length - 1, text: raw });
            }
          } else {
            results.push({ index: i, parsed: existing });
          }
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
        needsGemini.forEach(({ resultIndex, linkedRecipeId }, geminiIndex) => {
          const parsed = geminiResult.ingredients[geminiIndex];
          results[resultIndex].parsed = linkedRecipeId ? { ...parsed, linkedRecipeId } : parsed;
        });
      }

      // Build the final cleaned ingredient list.
      // Blank items were skipped above with `continue`, so they're absent here —
      // this prevents blank boxes from being saved and reappearing as uneditable ghosts.
      const finalIngredients = results.map((r) => {
        if (r.isSection) return ingredients[r.index];
        return {
          id: ingredients[r.index]?.id || `ing-${Date.now()}-${r.index}`,
          text: formatIngredient(r.parsed),
          structured: r.parsed,
        };
      });

      // Pass the cleaned list directly to onSave so the parent doesn't need to
      // re-read from React state (which would still hold the stale pre-save value).
      setIngredients(finalIngredients);
      onSave(finalIngredients, null);
    } catch (e) {
      console.error("Parsing failed:", e);
      alert("Could not parse ingredients");
    } finally {
      setIsParsing(false);
    }
  };

  const renderStepImageButton = (item, i) => (
    <label
      className="btn-add step-add-image-btn"
      style={{ cursor: "pointer", fontSize: "12px", width: "auto", marginTop: 0, whiteSpace: "nowrap", flexShrink: 0 }}
    >
      + Add image
      <input
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => handleStepImagePick(e, i)}
      />
    </label>
  );

  const renderStepImages = (item, i) => {
    if (!item.images || item.images.length === 0) return null;
    return (
      <div className="step-images-container" style={{ marginTop: "8px" }}>
        {item.images.map((url, imgIndex) => (
          <div
            key={imgIndex}
            className="step-image-row"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginRight: "8px", marginBottom: "8px" }}
          >
            <img
              src={url}
              alt={`Step ${i + 1}`}
              className="step-image-thumb"
              onClick={() => setLightboxUrl(url)}
              style={{ height: "80px", width: "80px", objectFit: "cover", borderRadius: "6px", cursor: "zoom-in" }}
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
      </div>
    );
  };

  // This is the renderActions function passed to EditableList for ingredients.
  // It renders a small link button next to each ingredient row that opens a
  // recipe picker — so you can link e.g. "sponge cake" to another recipe.
  const renderIngredientLink = (item, i) => {
    const linkedId = item.structured?.linkedRecipeId;
    const isOpen = openPickerIndex === i;
    // Filter the recipe list by the search string typed in the picker
    const pickableRecipes = (allRecipes || []).filter((r) =>
      !pickerSearch || normalizeSearch(r.title).includes(normalizeSearch(pickerSearch))
    );
    // Look up the name of the currently linked recipe for the confirmation label
    const linkedRecipeName = linkedId
      ? (allRecipes || []).find((r) => r.id === linkedId)?.title
      : null;

    return (
      <div style={{ position: "relative", flexShrink: 0 }} onMouseDown={(e) => e.stopPropagation()}>
        <button
          className={`link-btn ${linkedId ? "linked" : ""}`}
          title={linkedId ? "Linked — click to change" : "Link to another recipe"}
          onClick={() => {
            setOpenPickerIndex(isOpen ? null : i);
            if (!isOpen) setPickerSearch(""); // reset search when opening
          }}
        >
          🔗
        </button>

        {/* Confirmation label shown beneath the ingredient when a link is active */}
        {linkedRecipeName && (
          <div className="link-confirm" title={linkedRecipeName}>
            → {linkedRecipeName}
          </div>
        )}

        {isOpen && (
          <div className="link-picker" onMouseDown={(e) => e.stopPropagation()}>
            {/* Search bar to filter recipes — useful once the collection grows */}
            <div style={{ padding: "8px 10px 4px" }}>
              <input
                className="text-input"
                placeholder="Search recipes…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                autoFocus
                style={{ fontSize: "12px", padding: "6px 10px" }}
              />
            </div>
            {pickableRecipes.length === 0 ? (
              <p style={{ padding: "10px 16px", fontSize: "13px", color: "#aaa" }}>
                {pickerSearch ? "No matches." : "No other recipes saved yet."}
              </p>
            ) : (
              pickableRecipes.map((r) => (
                <button
                  key={r.id}
                  className={`link-picker-item ${linkedId === r.id ? "active" : ""}`}
                  onClick={() => handleLinkRecipe(i, r.id)}
                >
                  {r.title}
                </button>
              ))
            )}
            {linkedId && (
              <button className="link-picker-unlink" onClick={() => handleUnlinkRecipe(i)}>
                Remove link
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="recipe-editor">
      {!hidePhotoHeading && <p className="section-heading">Photo</p>}
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
        renderActions={renderIngredientLink}
      />
      {/* Two add buttons: one for a regular ingredient, one for a section divider */}
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          className="btn-add"
          style={{ flex: 1 }}
          onClick={() => setIngredients([...ingredients, { id: `ing-${Date.now()}`, text: "" }])}
        >
          + Add ingredient
        </button>
        <button
          className="btn-add"
          style={{ flex: 1 }}
          onClick={() => setIngredients([...ingredients, { id: `sec-${Date.now()}`, type: "section", text: "" }])}
        >
          + Add section
        </button>
      </div>

      <p className="section-heading">Instructions</p>
      <EditableList
        items={instructions}
        setItems={setInstructions}
        ordered={true}
        idPrefix="ins"
        renderExtra={renderStepImages} /* ← only instructions get step images */
        renderActions={renderStepImageButton}
      />
      {/* Same two-button pattern for instructions */}
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          className="btn-add"
          style={{ flex: 1 }}
          onClick={() => setInstructions([...instructions, { id: `ins-${Date.now()}`, text: "", images: [] }])}
        >
          + Add step
        </button>
        <button
          className="btn-add"
          style={{ flex: 1 }}
          onClick={() => setInstructions([...instructions, { id: `sec-${Date.now()}`, type: "section", text: "" }])}
        >
          + Add section
        </button>
      </div>

      {/* ── Labels ── */}
      <p className="section-heading">Labels</p>
      <div className="label-editor">
        {/* One-click Favorite toggle — separate from free-text labels so it's
            always easy to find even if the user has many custom labels */}
        <button
          className={`label-favorite-btn ${isFavorite ? "active" : ""}`}
          onClick={toggleFavorite}
          title={isFavorite ? "Remove from favorites" : "Mark as favorite"}
        >
          {isFavorite ? "⭐ Favorite" : "☆ Favorite"}
        </button>

        {/* Existing label pills — each has an × to remove it */}
        <div className="label-pill-row">
          {currentLabels
            .filter((l) => l !== "Favorite") // Favorite is shown via the button above
            .map((label) => (
              <span key={label} className="label-pill">
                {label}
                <button
                  className="label-pill-remove"
                  onClick={() => removeLabel(label)}
                  title={`Remove "${label}"`}
                >
                  ×
                </button>
              </span>
            ))}

          {/* Tag input — Enter or comma commits the typed text as a new label */}
          <input
            className="label-input"
            type="text"
            placeholder="Add a label…"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={handleLabelKeyDown}
            onBlur={() => addLabel(labelInput)} // also commit on blur (clicking away)
          />
        </div>
      </div>

      <div className="editor-actions">
        {/* handleSaveClick parses ingredients silently before saving */}
        <button className="btn-primary" onClick={handleSaveClick} disabled={isParsing}>
          {isParsing ? "Parsing…" : (saveLabel || "Save")}
        </button>
        {onCancel && (
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
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
      </div>
    </div>
  );
}