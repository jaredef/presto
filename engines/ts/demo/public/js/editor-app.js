// PRESTO Builder — Editor Application
// Wires: source editing, live preview, drag-and-drop, property panel, persistence

(function() {
  "use strict";

  // --- Config ---
  var pageId = document.getElementById("page-id").value;
  var token = document.getElementById("builder-token").value;
  var canvas = document.getElementById("editor-canvas");
  var sourceTextarea = document.getElementById("source-editor");
  var propsPanel = document.getElementById("props-panel");
  var saveStatus = document.getElementById("save-status");
  var canvasContainer = document.getElementById("canvas-container");

  // --- State (signals) --- exposed for chat panel
  var source = signal("");
  window.__editorState = { source: source };
  var selectedId = signal(null);
  var showSource = signal(false);
  var dirty = signal(false);
  var nodeCounter = 0;

  // --- Component defaults ---
  var COMPONENT_DEFAULTS = {
    card: { title: "Card Title", description: "" },
    button: { variant: "default", size: "md" },
    input: { label: "Label", type: "text", name: "", placeholder: "" },
    textarea: { label: "Label", name: "", rows: "4" },
    select: { label: "Label", name: "" },
    checkbox: { label: "Label", name: "" },
    badge: { variant: "default" },
    alert: { variant: "info", title: "Alert" },
    avatar: { src: "", initials: "AB", size: "md" },
    skeleton: { width: "100%", height: "1.5rem" },
    separator: { orientation: "horizontal" },
    nav: { orientation: "horizontal" },
    sidebar: { width: "240px" },
    dialog: { trigger: "Open", title: "Dialog", description: "" },
    tabs: { active: "0" },
    accordion: { multiple: "false" },
    dropdown: { trigger: "Menu" },
    tooltip: { text: "Tooltip text", position: "top" },
    slider: { label: "Slider", min: "0", max: "100", value: "50", name: "" },
    switch: { label: "Toggle", name: "" },
    form: { action: "create", type: "", method: "post" },
    table: {},
    "data-table": { type: "", columns: "" },
    pagination: { total: "0", perPage: "10", currentPage: "1" },
  };

  var ELEMENT_DEFAULTS = {
    h1: "<h1>Heading</h1>",
    h2: "<h2>Subheading</h2>",
    p: "<p>Paragraph text</p>",
    img: '<img src="/img/placeholder.jpg" alt="Image" style="max-width:100%" />',
    a: '<a href="#">Link text</a>',
  };

  // --- Load page source ---
  fetch("/api/load?pageId=" + pageId)
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.htxSource !== undefined) {
      source.value = data.htxSource;
      sourceTextarea.value = data.htxSource;
      saveStatus.textContent = "Loaded";
    }
  });

  // --- Init canvas iframe ---
  canvas.src = "/preview.html?v=8";

  // --- Preview loop ---
  var previewTimer = null;
  effect(function() {
    var src = source.value;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function() {
      // Inject builder IDs before sending to preview
      var tagged = injectBuilderIds(src);
      // Send to async preview endpoint
      fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ htxSource: tagged }),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.html && canvas.contentWindow) {
          canvas.contentWindow.postMessage({ type: "preview:update", html: data.html }, "*");
        }
      })
      .catch(function() {});
    }, 300);
  });

  // --- Source textarea sync ---
  sourceTextarea.addEventListener("input", function() {
    source.value = sourceTextarea.value;
    dirty.value = true;
  });

  effect(function() {
    if (showSource.value) {
      sourceTextarea.value = source.value;
    }
  });

  // --- Builder ID injection ---
  // Uses source byte offset as ID so tree nodes and canvas elements share the same IDs.
  // For htx:component tags: wraps in a <span data-builder-id="tn-X"> so the ID survives
  // after the component resolver consumes the htx:component tag.
  function injectBuilderIds(src) {
    var result = "";
    var last = 0;
    var re = /<(htx:component|h[1-6]|p|div|section|article|a|img|table|form|button|ul|ol|nav|header|footer|main|aside)(\s|>)/g;
    var m;
    while ((m = re.exec(src)) !== null) {
      // Skip matches inside a region we already processed (component internals)
      if (m.index < last) continue;

      result += src.substring(last, m.index);
      if (m[1] === "htx:component") {
        // Wrap component in a span with the builder ID — the span survives resolution
        var closeTag = "</htx:component>";
        var closeIdx = src.indexOf(closeTag, m.index);
        if (closeIdx !== -1) {
          // Include everything from the component start to after its closing tag
          var fullComponent = src.substring(m.index, closeIdx + closeTag.length);
          result += '<span data-builder-id="tn-' + m.index + '" style="display:contents">' + fullComponent + '</span>';
          last = closeIdx + closeTag.length;
          re.lastIndex = last; // Skip regex past the component
        } else {
          // Self-closing or no closing tag found — try />
          var endIdx = src.indexOf("/>", m.index);
          if (endIdx !== -1 && endIdx < m.index + 500) {
            var selfClose = src.substring(m.index, endIdx + 2);
            result += '<span data-builder-id="tn-' + m.index + '" style="display:contents">' + selfClose + '</span>';
            last = endIdx + 2;
            re.lastIndex = last;
          } else {
            // Fallback: just pass through
            result += m[0];
            last = m.index + m[0].length;
          }
        }
      } else {
        // HTML elements: inject data-builder-id directly on the tag
        result += "<" + m[1] + ' data-builder-id="tn-' + m.index + '"' + m[2];
        last = m.index + m[0].length;
      }
    }
    result += src.substring(last);
    return result;
  }

  // --- Parse source for component list ---
  function parseNodes(src) {
    var nodes = [];
    var re = /<htx:component\s+src="\/ui\/([^"]+)\.htx"([^>]*)(?:\/>|>([\s\S]*?)<\/htx:component>)/g;
    var m;
    var idx = 0;
    while ((m = re.exec(src)) !== null) {
      var attrs = {};
      var attrRe = /(\w+)\s*=\s*"([^"]*)"/g;
      var am;
      while ((am = attrRe.exec(m[2])) !== null) {
        if (am[1] !== "src" && am[1] !== "data-builder-id") attrs[am[1]] = am[2];
      }
      nodes.push({ id: "node-" + idx, type: "component", name: m[1], attrs: attrs, start: m.index, end: m.index + m[0].length, raw: m[0], slot: m[3] || "" });
      idx++;
    }
    return nodes;
  }

  // --- Canvas messages ---
  window.addEventListener("message", function(e) {
    if (e.data.type === "canvas:select") {
      selectedId.value = e.data.id;
      renderProperties(e.data.id);
    }
    if (e.data.type === "canvas:deselect") {
      selectedId.value = null;
      propsPanel.innerHTML = '<p style="color:var(--ui-text-muted);font-size:0.85rem;padding:1rem">Select a component to edit.</p>';
    }
    if (e.data.type === "canvas:drop") {
      handleDrop(e.data.data);
    }
    // Inline text editing from canvas
    if (e.data.type === "canvas:text-edit") {
      handleInlineEdit(e.data);
    }
  });

  // --- Inline text editing ---
  function handleInlineEdit(data) {
    var src = source.value;
    var oldText = data.oldText;
    var newText = data.newText;
    var role = data.role;
    var builderId = data.builderId;

    if (!oldText || !newText || oldText === newText) return;

    var newSource = src;

    if (role && role.startsWith("prop:")) {
      // Edit a component prop: find the component at this builder-id position
      // builderId is "tn-{offset}" — extract the offset
      var offset = parseInt(builderId.replace("tn-", ""));
      var propName = role.split(":")[1]; // "title", "description", "label"
      // Find the prop in the source near this offset
      var regionStart = Math.max(0, offset);
      var regionEnd = Math.min(src.length, offset + 500);
      var region = src.substring(regionStart, regionEnd);
      var propRe = new RegExp(propName + '\\s*=\\s*"([^"]*)"');
      var propMatch = propRe.exec(region);
      if (propMatch && propMatch[1] === oldText) {
        var propStart = regionStart + propMatch.index;
        var fullMatch = propMatch[0];
        var replacement = propName + '="' + newText + '"';
        newSource = src.substring(0, propStart) + replacement + src.substring(propStart + fullMatch.length);
      }
    } else {
      // Edit text content: find and replace the old text in the source
      // Use the builder-id offset to narrow the search region
      var offset = builderId ? parseInt(builderId.replace("tn-", "")) : 0;
      var searchStart = Math.max(0, offset);
      var idx = src.indexOf(oldText, searchStart);
      if (idx === -1) idx = src.indexOf(oldText); // Fallback: search entire source
      if (idx !== -1) {
        newSource = src.substring(0, idx) + newText + src.substring(idx + oldText.length);
      }
    }

    if (newSource !== src) {
      if (window.__editHistory) {
        window.__editHistory.push("visual", "Inline edit: " + newText.substring(0, 30), src, newSource);
      }
      source.value = newSource;
      dirty.value = true;
      // Emit visual edit event for the chat
      window.dispatchEvent(new CustomEvent("editor:visual-edit", {
        detail: { description: 'Edited text: "' + newText.substring(0, 30) + '"' }
      }));
    }
  }

  // --- Property panel ---
  function renderProperties(nodeId) {
    var nodes = parseNodes(source.value);
    var node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node) {
      propsPanel.innerHTML = '<p style="color:var(--ui-text-muted);padding:1rem">Element selected (not a component)</p>';
      return;
    }

    var defaults = COMPONENT_DEFAULTS[node.name] || {};
    var html = '<div style="padding:0.5rem"><div style="font-weight:600;margin-bottom:0.75rem;font-size:0.9rem">' + node.name + '</div>';

    var allProps = Object.keys(defaults);
    for (var i = 0; i < allProps.length; i++) {
      var key = allProps[i];
      var val = node.attrs[key] !== undefined ? node.attrs[key] : defaults[key];
      if (key === "variant") {
        html += '<div class="prop-field"><label>' + key + '</label><select data-prop="' + key + '" data-node="' + nodeId + '">';
        var variants = ["default", "secondary", "destructive", "outline", "ghost", "info", "warning", "error", "success"];
        for (var v = 0; v < variants.length; v++) {
          html += '<option value="' + variants[v] + '"' + (val === variants[v] ? " selected" : "") + '>' + variants[v] + '</option>';
        }
        html += '</select></div>';
      } else if (key === "size") {
        html += '<div class="prop-field"><label>' + key + '</label><select data-prop="' + key + '" data-node="' + nodeId + '">';
        var sizes = ["sm", "md", "lg"];
        for (var s = 0; s < sizes.length; s++) {
          html += '<option value="' + sizes[s] + '"' + (val === sizes[s] ? " selected" : "") + '>' + sizes[s] + '</option>';
        }
        html += '</select></div>';
      } else {
        html += '<div class="prop-field"><label>' + key + '</label><input type="text" value="' + escHtml(val) + '" data-prop="' + key + '" data-node="' + nodeId + '" /></div>';
      }
    }

    // Slot content
    if (node.slot !== undefined) {
      html += '<div class="prop-field"><label>Content (slot)</label><textarea data-prop="__slot" data-node="' + nodeId + '">' + escHtml(node.slot) + '</textarea></div>';
    }

    html += '<div style="padding:0.5rem 0"><button class="ui-btn ui-btn-destructive ui-btn-sm" data-action="delete" data-node="' + nodeId + '">Delete</button></div>';
    html += '</div>';
    propsPanel.innerHTML = html;

    // Bind change events
    var inputs = propsPanel.querySelectorAll("input, select, textarea");
    for (var j = 0; j < inputs.length; j++) {
      inputs[j].addEventListener("input", handlePropChange);
      inputs[j].addEventListener("change", handlePropChange);
    }
    var delBtn = propsPanel.querySelector('[data-action="delete"]');
    if (delBtn) delBtn.addEventListener("click", function() { deleteNode(this.dataset.node); });
  }

  function handlePropChange(e) {
    var prop = e.target.dataset.prop;
    var nodeId = e.target.dataset.node;
    var value = e.target.value;
    var nodes = parseNodes(source.value);
    var node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;

    var src = source.value;
    if (prop === "__slot") {
      // Replace slot content
      var selfClose = /\/>$/.test(node.raw);
      if (selfClose) {
        // Convert self-closing to open/close with slot
        var newTag = node.raw.replace(/\s*\/>$/, ">" + value + "</htx:component>");
        src = src.substring(0, node.start) + newTag + src.substring(node.end);
      } else {
        var openClose = node.raw.replace(/>([\s\S]*?)<\/htx:component>$/, ">" + value + "</htx:component>");
        src = src.substring(0, node.start) + openClose + src.substring(node.end);
      }
    } else {
      // Update attribute
      var attrRe = new RegExp('(' + prop + ')\\s*=\\s*"[^"]*"');
      if (attrRe.test(node.raw)) {
        var newRaw = node.raw.replace(attrRe, '$1="' + value + '"');
        src = src.substring(0, node.start) + newRaw + src.substring(node.end);
      } else {
        // Add the attribute
        var newRaw2 = node.raw.replace(/<htx:component\s/, '<htx:component ' + prop + '="' + value + '" ');
        src = src.substring(0, node.start) + newRaw2 + src.substring(node.end);
      }
    }
    source.value = src;
    dirty.value = true;
  }

  function deleteNode(nodeId) {
    var nodes = parseNodes(source.value);
    var node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    source.value = source.value.substring(0, node.start) + source.value.substring(node.end);
    dirty.value = true;
    selectedId.value = null;
    propsPanel.innerHTML = '<p style="color:var(--ui-text-muted);font-size:0.85rem;padding:1rem">Component deleted.</p>';
  }

  // --- Drag and drop ---
  var paletteItems = document.querySelectorAll(".palette-item");
  for (var i = 0; i < paletteItems.length; i++) {
    paletteItems[i].addEventListener("dragstart", function(e) {
      var comp = this.dataset.component;
      var elem = this.dataset.element;
      e.dataTransfer.setData("text/plain", JSON.stringify({ component: comp, element: elem }));
    });
  }

  function handleDrop(dataStr) {
    try {
      var data = JSON.parse(dataStr);
      var insert = "";

      // New schema-based palette items carry their own source
      if (data.source) {
        insert = "\n" + data.source + "\n";
      }
      // Legacy: component name lookup
      else if (data.component) {
        var defaults = COMPONENT_DEFAULTS[data.component] || {};
        var attrs = Object.entries(defaults).map(function(kv) { return kv[0] + '="' + kv[1] + '"'; }).join(" ");
        insert = '\n<htx:component src="/ui/' + data.component + '.htx" ' + attrs + '>\n</htx:component>\n';
      }
      // Legacy: element name lookup
      else if (data.element && ELEMENT_DEFAULTS[data.element]) {
        insert = "\n" + ELEMENT_DEFAULTS[data.element] + "\n";
      }

      if (insert) {
        var oldSource = source.value;
        source.value = oldSource + insert;
        dirty.value = true;
        if (window.__editHistory) {
          window.__editHistory.push("visual", "Dropped: " + (data.source ? data.source.substring(0, 30) : "component"), oldSource, source.value);
        }
        window.dispatchEvent(new CustomEvent("editor:visual-edit", {
          detail: { description: "Dropped element from palette" }
        }));
      }
    } catch (e) {}
  }

  // --- Toolbar buttons ---
  document.getElementById("btn-source").addEventListener("click", function() {
    showSource.value = !showSource.value;
    sourceTextarea.style.display = showSource.value ? "block" : "none";
    canvas.style.display = showSource.value ? "none" : "block";
    this.textContent = showSource.value ? "Visual" : "Source";
    if (showSource.value) sourceTextarea.value = source.value;
  });

  document.getElementById("btn-save").addEventListener("click", save);

  document.getElementById("btn-export").addEventListener("click", function() {
    var blob = new Blob([source.value], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "page.htx";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btn-desktop").addEventListener("click", function() { canvas.className = "editor-canvas"; });
  document.getElementById("btn-tablet").addEventListener("click", function() { canvas.className = "editor-canvas tablet"; });
  document.getElementById("btn-mobile").addEventListener("click", function() { canvas.className = "editor-canvas mobile"; });

  // --- Save ---
  var saveTimer = null;
  effect(function() {
    if (dirty.value) {
      saveStatus.textContent = "Unsaved";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 2000);
    }
  });

  function save() {
    saveStatus.textContent = "Saving...";
    fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: parseInt(pageId), htxSource: source.value }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        saveStatus.textContent = "Saved";
        dirty.value = false;
      } else {
        saveStatus.textContent = "Save failed";
      }
    })
    .catch(function() { saveStatus.textContent = "Save failed"; });
  }

  // --- Keyboard shortcuts ---
  document.addEventListener("keydown", function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      save();
    }
  });

  // --- Utility ---
  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

})();
