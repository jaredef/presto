// Island: dnd-kit Sortable List
// Complex gesture input and animated DOM reordering.

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { defineIsland } from "../../src/islands/define";

interface Item { id: string; title: string; }

function SortableItem({ item }: { item: Item }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: "0.75rem",
    border: "1px solid #e5e5e5",
    borderRadius: "8px",
    marginBottom: "0.5rem",
    background: isDragging ? "#f0f0ff" : "#fff",
    cursor: "grab",
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    opacity: isDragging ? 0.8 : 1,
    boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.1)" : "none",
    fontSize: "0.9rem",
    fontFamily: "system-ui, sans-serif",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <span style={{ color: "#ccc", fontSize: "0.8rem" }}>⠿</span>
      <span>{item.title}</span>
    </div>
  );
}

function SortableList({ items: initialItems }: { items: Item[] }) {
  const [items, setItems] = useState(initialItems);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableItem key={item.id} item={item} />
          ))}
        </SortableContext>
      </DndContext>
      <div style={{ fontSize: "0.7rem", color: "#aaa", marginTop: "0.5rem" }}>
        @dnd-kit sortable. Drag to reorder. {items.length} items from server data. Bounded PRESTO island.
      </div>
    </div>
  );
}

defineIsland({
  name: "dndkit-sortable",
  mount(el, props) {
    const data = props.data as Item[] || [];
    const items: Item[] = Array.isArray(data) ? data.map((d: any, i: number) => ({
      id: d.id?.toString() || String(i),
      title: d.title || d.name || `Item ${i + 1}`,
    })) : [];
    createRoot(el).render(<SortableList items={items} />);
  },
});
