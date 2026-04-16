// Island: TipTap Rich Text Editor
// The server renders content as static HTML. The island provides editing.

import React, { useCallback } from "react";
import { createRoot } from "react-dom/client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { defineIsland } from "../../src/islands/define";

function TiptapEditor({ content, onSave }: { content: string; onSave?: (html: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: content || "<p>Start writing...</p>",
  });

  const handleSave = useCallback(() => {
    if (editor && onSave) onSave(editor.getHTML());
  }, [editor, onSave]);

  if (!editor) return <div style={{ padding: "1rem", color: "#888" }}>Initializing editor...</div>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        {[
          { label: "B", cmd: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold") },
          { label: "I", cmd: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic") },
          { label: "Strike", cmd: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive("strike") },
          { label: "Code", cmd: () => editor.chain().focus().toggleCode().run(), active: editor.isActive("code") },
          { label: "H1", cmd: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive("heading", { level: 1 }) },
          { label: "H2", cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }) },
          { label: "Bullet", cmd: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
          { label: "Ordered", cmd: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
          { label: "Quote", cmd: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive("blockquote") },
          { label: "HR", cmd: () => editor.chain().focus().setHorizontalRule().run(), active: false },
          { label: "Undo", cmd: () => editor.chain().focus().undo().run(), active: false },
          { label: "Redo", cmd: () => editor.chain().focus().redo().run(), active: false },
        ].map((btn) => (
          <button
            key={btn.label}
            onClick={btn.cmd}
            style={{
              padding: "0.3rem 0.5rem", fontSize: "0.75rem", border: "1px solid #e5e5e5",
              borderRadius: "4px", cursor: "pointer",
              background: btn.active ? "#1a1a1a" : "#fff",
              color: btn.active ? "#fff" : "#1a1a1a",
            }}
          >{btn.label}</button>
        ))}
        {onSave && (
          <button onClick={handleSave} style={{
            padding: "0.3rem 0.75rem", fontSize: "0.75rem", border: "none",
            borderRadius: "4px", cursor: "pointer", background: "#22c55e", color: "#fff", marginLeft: "auto",
          }}>Save</button>
        )}
      </div>
      <div style={{ border: "1px solid #e5e5e5", borderRadius: "8px", minHeight: "200px" }}>
        <EditorContent editor={editor} style={{ padding: "0.75rem" }} />
      </div>
      <div style={{ fontSize: "0.7rem", color: "#aaa", marginTop: "0.5rem" }}>
        TipTap + ProseMirror. Rich text editing in a bounded PRESTO island.
      </div>
    </div>
  );
}

defineIsland({
  name: "tiptap-editor",
  mount(el, props) {
    const content = typeof props.data === "string" ? props.data : (props.data as any)?.content || "<p>Start writing...</p>";
    createRoot(el).render(<TiptapEditor content={content} />);
  },
});
