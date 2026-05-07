import EditableList from "./EditableList";

export default function RecipeEditor({
  ingredients,
  setIngredients,
  instructions,
  setInstructions,
  onSave,
  onCancel,
  saveLabel,
}) {
  return (
    <div className="recipe-editor">
      <p className="section-heading">Ingredients</p>
      <EditableList
        items={ingredients}
        setItems={setIngredients}
        ordered={false}
        idPrefix="ing"
      />
      <button
        className="btn-add"
        onClick={() =>
          setIngredients([
            ...ingredients,
            { id: `ing-${Date.now()}`, text: "" },
          ])
        }
      >
        + Add ingredient
      </button>

      <p className="section-heading">Instructions</p>
      <EditableList
        items={instructions}
        setItems={setInstructions}
        ordered={true}
        idPrefix="ins"
      />
      <button
        className="btn-add"
        onClick={() =>
          setInstructions([
            ...instructions,
            { id: `ins-${Date.now()}`, text: "" },
          ])
        }
      >
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