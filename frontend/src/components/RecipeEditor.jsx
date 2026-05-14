import { useState, useEffect } from "react";
import EditableList from "./EditableList";
import { uploadRecipeImage_toStorage } from "../api";
import { useAuth } from "../context/AuthContext";

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
  const { token } = useAuth();
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

  // Upload a step image immediately and add its URL to that instruction's images array
  const handleStepImagePick = async (e, index) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const result = await uploadRecipeImage_toStorage(f, token);
      const updated = [...instructions];
      const currentImages = updated[index].images || [];
      updated[index] = { ...updated[index], images: [...currentImages, result.image_url] };
      setInstructions(updated);
    } catch (err) {
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
        renderExtra={renderStepImages}  /* ← only instructions get this */
      />
      <button className="btn-add" onClick={() => setInstructions([...instructions, { id: `ins-${Date.now()}`, text: "", images: [] }])}>
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