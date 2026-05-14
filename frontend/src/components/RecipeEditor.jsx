import { useState, useEffect } from "react";
import EditableList from "./EditableList";

export default function RecipeEditor({
  ingredients,
  setIngredients,
  instructions,
  setInstructions,
  onSave,
  onCancel,
  saveLabel,
  imageFile,
  onImageChange,
  onRemoveExisting,
}) {

  const [preview, setPreview] = useState(null);
  const [saveImage, setSaveImage] = useState(false);

  // When a scanned image is passed in, show it as the preview automatically
  useEffect(() => {
    if (imageFile) {
      setPreview(URL.createObjectURL(imageFile));
      setSaveImage(false); // unchecked by default — user must confirm
    }
  }, [imageFile]);

  const handleImagePick = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setSaveImage(true); // user actively chose this image, so default to checked
    onImageChange?.(f);
  };

  const handleRemoveImage = () => {
    setPreview(null);
    setSaveImage(false);
    onImageChange?.(null);
    onRemoveExisting?.();
  };

  const handleSaveImageToggle = (e) => {
    setSaveImage(e.target.checked);
    // If unchecked, tell parent no image should be saved
    onImageChange?.(e.target.checked ? imageFile : null);
  };

  return (
    <div className="recipe-editor">

      {/* Image section */}
      <p className="section-heading">Photo</p>
      {preview ? (
        <div style={{ marginBottom: "12px" }}>
          <img
            src={preview}
            alt="Recipe"
            style={{ width: "100%", maxHeight: "240px", objectFit: "cover", borderRadius: "8px" }}
          />
          {imageFile && (
            // Show confirm checkbox only for scanned images passed in as prop
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
      )}

      <p className="section-heading">Ingredients</p>
      <EditableList items={ingredients} setItems={setIngredients} ordered={false} idPrefix="ing" />
      <button className="btn-add" onClick={() => setIngredients([...ingredients, { id: `ing-${Date.now()}`, text: "" }])}>
        + Add ingredient
      </button>

      <p className="section-heading">Instructions</p>
      <EditableList items={instructions} setItems={setInstructions} ordered={true} idPrefix="ins" />
      <button className="btn-add" onClick={() => setInstructions([...instructions, { id: `ins-${Date.now()}`, text: "" }])}>
        + Add step
      </button>

      <div className="editor-actions">
        <button className="btn-primary" onClick={onSave}>
          {saveLabel || "Save"}
        </button>
        {onCancel && (
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}