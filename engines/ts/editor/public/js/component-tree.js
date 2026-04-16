// Component Tree — parse .htx source into navigable hierarchy

(function() {
  "use strict";

  // --- Parser ---

  var NODE_PATTERNS = [
    { type: "component", re: /<htx:component\s+src="\/ui\/([^"]+)\.htx"([^>]*)(?:\/>|>)/g, nameGroup: 1, attrGroup: 2 },
    { type: "loop", re: /<htx:each\s+items="([^"]+)"\s+as="([^"]+)"\s*>/g, nameGroup: 1, attrGroup: 2 },
    { type: "conditional", re: /<htx:if\s+test="([^"]+)"\s*>/g, nameGroup: 1 },
    { type: "else", re: /<htx:else\s*>/g },
    { type: "data", re: /<htx:data\s+([^>]*)\/>/g, attrGroup: 1 },
    { type: "auth", re: /<htx:auth(?:\s+role="([^"]*)")?\s*>/g, nameGroup: 1 },
    { type: "unauth", re: /<htx:unauth\s*>/g },
    { type: "island", re: /<htx:component\s+src="\/ui\/island\.htx"\s+name="([^"]+)"/g, nameGroup: 1 },
  ];

  var ELEMENT_RE = /<(h[1-6]|p|div|section|article|nav|header|footer|main|aside|form|table|ul|ol|a|img|button|span)(\s[^>]*)?\s*>/gi;

  function parseSource(source) {
    if (!source) return [];
    var nodes = [];

    // Find all structural nodes with their positions
    NODE_PATTERNS.forEach(function(pat) {
      var re = new RegExp(pat.re.source, "g");
      var m;
      while ((m = re.exec(source)) !== null) {
        var node = {
          id: "tn-" + m.index,
          type: pat.type,
          name: "",
          label: "",
          detail: "",
          start: m.index,
          end: m.index + m[0].length,
          raw: m[0],
        };

        switch (pat.type) {
          case "island":
            node.name = m[1];
            node.label = "🏝️ " + m[1];
            node.detail = "island";
            node.type = "island";
            break;
          case "component":
            // Skip island components (handled above)
            if (m[0].includes("island.htx")) continue;
            node.name = m[1];
            node.label = "📦 " + m[1];
            node.detail = extractKeyProp(m[2] || "");
            break;
          case "loop":
            node.name = m[1];
            node.label = "🔄 each " + m[2];
            node.detail = "items=" + m[1];
            break;
          case "conditional":
            node.name = m[1];
            node.label = "❓ if " + m[1];
            break;
          case "else":
            node.label = "❓ else";
            break;
          case "data":
            var type = extractAttr(m[1], "type");
            var as = extractAttr(m[1], "as");
            node.name = type;
            node.label = "📊 data " + type;
            node.detail = as ? "as=" + as : "";
            break;
          case "auth":
            node.label = "🔒 auth" + (m[1] ? " role=" + m[1] : "");
            break;
          case "unauth":
            node.label = "🔓 unauth";
            break;
        }

        nodes.push(node);
      }
    });

    // Find HTML elements
    var em;
    var elemRe = new RegExp(ELEMENT_RE.source, "gi");
    while ((em = elemRe.exec(source)) !== null) {
      var tag = em[1].toLowerCase();
      var attrs = em[2] || "";
      var cls = extractAttr(attrs, "class");
      var id = extractAttr(attrs, "id");
      nodes.push({
        id: "tn-" + em.index,
        type: "element",
        name: tag,
        label: "🏷️ " + tag,
        detail: id ? "#" + id : cls ? "." + cls.split(" ")[0] : "",
        start: em.index,
        end: em.index + em[0].length,
        raw: em[0],
      });
    }

    // Sort by position
    nodes.sort(function(a, b) { return a.start - b.start; });

    return nodes;
  }

  function extractKeyProp(attrs) {
    var title = extractAttr(attrs, "title");
    if (title) return 'title="' + title.substring(0, 20) + (title.length > 20 ? "..." : "") + '"';
    var label = extractAttr(attrs, "label");
    if (label) return 'label="' + label + '"';
    var name = extractAttr(attrs, "name");
    if (name) return 'name="' + name + '"';
    var variant = extractAttr(attrs, "variant");
    if (variant) return variant;
    return "";
  }

  function extractAttr(str, name) {
    var re = new RegExp(name + '\\s*=\\s*"([^"]*)"');
    var m = re.exec(str);
    return m ? m[1] : "";
  }

  // --- Renderer ---

  var selectedNodeId = null;
  var collapsedNodes = {};

  function renderTree(nodes, container) {
    if (!container) return;
    if (nodes.length === 0) {
      container.innerHTML = '<div class="tree-empty">No structure detected. Add components or elements.</div>';
      return;
    }

    var html = '<div class="tree-list">';
    nodes.forEach(function(node) {
      var isSelected = node.id === selectedNodeId;
      var cls = "tree-node" + (isSelected ? " tree-selected" : "");
      html += '<div class="' + cls + '" data-node-id="' + node.id + '" data-start="' + node.start + '" data-end="' + node.end + '">';
      html += '<span class="tree-label">' + escTree(node.label) + '</span>';
      if (node.detail) {
        html += '<span class="tree-detail">' + escTree(node.detail) + '</span>';
      }
      html += '</div>';
    });
    html += '</div>';

    container.innerHTML = html;

    // Bind click handlers
    container.querySelectorAll(".tree-node").forEach(function(el) {
      el.addEventListener("click", function() {
        selectedNodeId = this.dataset.nodeId;
        renderTree(nodes, container);

        // Notify canvas — send the builder-id that matches the injected data-builder-id
        var builderId = this.dataset.nodeId; // "tn-{offset}" matches data-builder-id
        var canvas = document.getElementById("editor-canvas");
        if (canvas && canvas.contentWindow) {
          canvas.contentWindow.postMessage({
            type: "tree:select",
            builderId: builderId,
          }, "*");
        }

        // Notify property panel
        var node = nodes.find(function(n) { return n.id === selectedNodeId; });
        if (node) {
          window.dispatchEvent(new CustomEvent("tree:node-selected", { detail: node }));
        }
      });
    });
  }

  function escTree(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // --- Tree Actions ---

  function deleteNode(nodeId, source) {
    // Find the node's full extent in the source (opening to closing tag)
    var nodes = parseSource(source);
    var node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return source;

    // For self-closing tags, just remove the match
    if (node.raw.endsWith("/>")) {
      return source.substring(0, node.start) + source.substring(node.end);
    }

    // For opening tags, find the closing tag
    var tagName = node.raw.match(/<(\S+)/)?.[1];
    if (!tagName) return source;
    var closeTag = "</" + tagName + ">";
    var closeIdx = source.indexOf(closeTag, node.end);
    if (closeIdx === -1) {
      return source.substring(0, node.start) + source.substring(node.end);
    }
    return source.substring(0, node.start) + source.substring(closeIdx + closeTag.length);
  }

  function duplicateNode(nodeId, source) {
    var nodes = parseSource(source);
    var node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return source;

    var tagName = node.raw.match(/<(\S+)/)?.[1];
    if (!tagName) return source;

    var content;
    if (node.raw.endsWith("/>")) {
      content = node.raw;
    } else {
      var closeTag = "</" + tagName + ">";
      var closeIdx = source.indexOf(closeTag, node.end);
      if (closeIdx === -1) {
        content = node.raw;
      } else {
        content = source.substring(node.start, closeIdx + closeTag.length);
      }
    }

    var insertAt = node.raw.endsWith("/>") ? node.end : source.indexOf("</" + tagName + ">", node.end) + ("</" + tagName + ">").length;
    return source.substring(0, insertAt) + "\n" + content + source.substring(insertAt);
  }

  // --- Init ---

  function init() {
    var container = document.getElementById("tree-container");
    if (!container) return;

    // Re-parse on source changes
    if (window.__editorState && window.__editorState.source) {
      effect(function() {
        var source = window.__editorState.source.value;
        var nodes = parseSource(source);
        renderTree(nodes, container);
      });
    }

    // Listen for canvas selections — the canvas sends the data-builder-id (tn-{offset})
    window.addEventListener("message", function(e) {
      if (e.data && e.data.type === "canvas:select" && e.data.id) {
        var builderId = e.data.id; // "tn-{offset}"
        var source = window.__editorState?.source?.value || "";
        var nodes = parseSource(source);
        // Find the tree node with matching ID
        var match = nodes.find(function(n) { return n.id === builderId; });
        if (match) {
          selectedNodeId = match.id;
          renderTree(nodes, container);
          // Switch to tree tab
          var treeTab = document.querySelector('[data-panel="tree-panel"]');
          if (treeTab && !treeTab.classList.contains("active")) treeTab.click();
          // Scroll tree node into view
          var nodeEl = container.querySelector('[data-node-id="' + match.id + '"]');
          if (nodeEl) nodeEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    });

    // Keyboard navigation
    container.addEventListener("keydown", function(e) {
      var current = container.querySelector(".tree-selected");
      var all = Array.from(container.querySelectorAll(".tree-node"));
      var idx = all.indexOf(current);

      if (e.key === "ArrowDown" && idx < all.length - 1) {
        e.preventDefault();
        all[idx + 1].click();
      } else if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        all[idx - 1].click();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId && window.__editorState) {
          var oldSource = window.__editorState.source.value;
          var newSource = deleteNode(selectedNodeId, oldSource);
          if (newSource !== oldSource) {
            if (window.__editHistory) window.__editHistory.push("visual", "Deleted from tree", oldSource, newSource);
            window.__editorState.source.value = newSource;
            selectedNodeId = null;
          }
        }
      }
    });
  }

  // Expose for editor integration
  window.__componentTree = {
    parse: parseSource,
    deleteNode: deleteNode,
    duplicateNode: duplicateNode,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
