// Island: CodeMirror Code Editor
// Server provides initial code. The island provides editing with syntax highlighting.

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { defineIsland } from "../../src/islands/define";

function CodeEditor({ code, language }: { code: string; language: string }) {
  const [value, setValue] = useState(code);
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.8rem", color: "#666" }}>
          {language} — {value.split("\n").length} lines
        </span>
        <button
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem", border: "1px solid #e5e5e5", borderRadius: "4px", cursor: "pointer", background: "#fff" }}
        >{copied ? "Copied!" : "Copy"}</button>
      </div>
      <CodeMirror
        value={value}
        height="300px"
        extensions={[javascript({ jsx: true, typescript: true })]}
        onChange={(val) => setValue(val)}
        theme="dark"
        style={{ borderRadius: "8px", overflow: "hidden" }}
      />
      <div style={{ fontSize: "0.7rem", color: "#aaa", marginTop: "0.5rem" }}>
        CodeMirror 6. Syntax highlighting, autocomplete, line numbers. Bounded PRESTO island.
      </div>
    </div>
  );
}

defineIsland({
  name: "codemirror-editor",
  mount(el, props) {
    const data = (props.data || {}) as any;
    const code = typeof data === "string" ? data : data.code || "// Start coding...";
    const language = data.language || "javascript";
    createRoot(el).render(<CodeEditor code={code} language={language} />);
  },
});
