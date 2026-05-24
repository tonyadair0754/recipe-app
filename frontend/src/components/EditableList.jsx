import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const onDragEnd = (list, setList) => (result) => {
  if (!result.destination) return;
  const updated = [...list];
  const [moved] = updated.splice(result.source.index, 1);
  updated.splice(result.destination.index, 0, moved);
  setList(updated);
};

export default function EditableList({ items, setItems, ordered, idPrefix, renderExtra, renderActions }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <DragDropContext onDragEnd={onDragEnd(items, setItems)}>
      <Droppable droppableId={idPrefix}>
        {(provided) => (
          <Tag
            className="editable-list"
            style={{ listStyle: "none" }}
            {...provided.droppableProps}
            ref={provided.innerRef}
          >
            {items.map((item, i) => (
              <Draggable key={item.id} draggableId={item.id} index={i}>
                {(provided) => (
                  <li ref={provided.innerRef} {...provided.draggableProps}>
                    {item.type === "section" ? (
                      /* ── Section header row ── */
                      /* Drag handle still works so you can reorder sections */
                      <div className="section-header-row">
                        <span {...provided.dragHandleProps} className="drag-handle">⠿</span>
                        <input
                          className="section-header-input"
                          value={item.text}
                          placeholder="Section name…"
                          onChange={(e) => {
                            const updated = [...items];
                            updated[i] = { ...item, text: e.target.value };
                            setItems(updated);
                          }}
                        />
                        <button
                          className="btn-remove"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => setItems(items.filter((_, j) => j !== i))}
                          title="Remove section"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      /* ── Normal ingredient / instruction row ── */
                      <>
                        <span {...provided.dragHandleProps} className="drag-handle">⠿</span>
                        <textarea
                          value={item.text}
                          rows={1}
                          onChange={(e) => {
                            const updated = [...items];
                            updated[i] = { ...item, text: e.target.value };
                            setItems(updated);
                          }}
                        />
                        <button
                          className="btn-remove"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => setItems(items.filter((_, j) => j !== i))}
                          title="Remove"
                        >
                          ×
                        </button>
                        {/* renderActions lets the parent inject extra buttons per item (e.g. the link button) */}
                        {renderActions && renderActions(item, i)}
                      </>
                    )}
                    {/* renderExtra only runs for non-section items (e.g. step images).
                        Sections don't have images, and calling renderExtra on them
                        was causing the "+ Add image" button to appear next to section headers. */}
                    {item.type !== "section" && renderExtra && renderExtra(item, i)}
                  </li>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </Tag>
        )}
      </Droppable>
    </DragDropContext>
  );
}