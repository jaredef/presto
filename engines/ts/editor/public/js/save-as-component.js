// Save as Component — extract selected elements into a reusable .htx component file

(function() {
  "use strict";

  // Show the save-as-component dialog
  function showSaveDialog(selectedSource) {
    if (!selectedSource || selectedSource.trim().length < 5) {
      alert("Select content in the source view first, then save as component.");
      return;
    }

    // Auto-detect potential props from text content
    var detectedProps = detectProps(selectedSource);

    // Build dialog HTML
    var overlay = document.createElement("div");
    overlay.className = "sac-overlay";
    overlay.innerHTML = '<div class="sac-dialog">' +
      '<h3 style="margin:0 0 1rem">Save as Component</h3>' +
      '<div class="sac-field"><label>Component Name</label>' +
      '<input type="text" id="sac-name" placeholder="site-footer" class="sac-input" /></div>' +
      '<div class="sac-field"><label>Description</label>' +
      '<input type="text" id="sac-desc" placeholder="Reusable footer with links" class="sac-input" /></div>' +
      '<div class="sac-field"><label>Props (editable values)</label>' +
      '<div id="sac-props">' + renderPropInputs(detectedProps) + '</div>' +
      '<button class="sac-add-prop" id="sac-add-prop">+ Add prop</button></div>' +
      '<div class="sac-preview"><label>Preview</label>' +
      '<pre id="sac-preview" class="sac-code"></pre></div>' +
      '<div class="sac-actions">' +
      '<button id="sac-cancel" class="ui-btn ui-btn-ghost ui-btn-sm">Cancel</button>' +
      '<button id="sac-save" class="ui-btn ui-btn-default ui-btn-sm">Save Component</button>' +
      '</div></div>';

    document.body.appendChild(overlay);

    var nameInput = document.getElementById("sac-name");
    var preview = document.getElementById("sac-preview");
    nameInput.focus();

    // Update preview on any change
    function updatePreview() {
      var props = collectProps();
      var source = buildComponentSource(selectedSource, props);
      preview.textContent = source;
    }
    updatePreview();

    // Event: input changes
    overlay.addEventListener("input", updatePreview);

    // Event: add prop
    document.getElementById("sac-add-prop").addEventListener("click", function() {
      var container = document.getElementById("sac-props");
      container.insertAdjacentHTML("beforeend", renderPropRow("", "", ""));
      updatePreview();
    });

    // Event: remove prop
    overlay.addEventListener("click", function(e) {
      if (e.target.classList.contains("sac-remove-prop")) {
        e.target.closest(".sac-prop-row").remove();
        updatePreview();
      }
    });

    // Event: cancel
    document.getElementById("sac-cancel").addEventListener("click", function() {
      overlay.remove();
    });
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) overlay.remove();
    });

    // Event: save
    document.getElementById("sac-save").addEventListener("click", function() {
      var name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (!name) { nameInput.style.borderColor = "#ef4444"; return; }

      var props = collectProps();
      var componentSource = buildComponentSource(selectedSource, props);

      // Save via API
      fetch("/api/save-component", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, source: componentSource }),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          // Replace selected content in source with component reference
          var src = window.__editorState.source.value;
          var replacement = '<htx:component src="/components/' + name + '.htx"';
          // Add prop overrides if any props have non-default values
          props.forEach(function(p) {
            if (p.name && p.defaultValue) {
              replacement += ' ' + p.name + '="' + p.defaultValue + '"';
            }
          });
          var hasSlot = componentSource.indexOf("<htx:slot />") !== -1;
          replacement += hasSlot ? '>\n  \n</htx:component>' : ' />';

          var idx = src.indexOf(selectedSource);
          if (idx !== -1) {
            var newSource = src.substring(0, idx) + replacement + src.substring(idx + selectedSource.length);
            if (window.__editHistory) {
              window.__editHistory.push("visual", "Saved component: " + name, src, newSource);
            }
            window.__editorState.source.value = newSource;
          }

          // Add to custom palette
          addToCustomPalette(name, data.description || name);

          overlay.remove();

          // Notify chat
          window.dispatchEvent(new CustomEvent("editor:visual-edit", {
            detail: { description: 'Created component: ' + name }
          }));
        } else {
          alert("Failed to save: " + (data.error || "Unknown error"));
        }
      });
    });
  }

  // Detect potential props from the source content
  function detectProps(source) {
    var props = [];
    var seen = {};

    // Detect text in headings
    var headings = source.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi) || [];
    headings.forEach(function(h) {
      var text = h.replace(/<[^>]+>/g, "").trim();
      if (text && text.length < 50 && !seen[text]) {
        var name = slugify(text);
        props.push({ name: name, defaultValue: text, find: text });
        seen[text] = true;
      }
    });

    // Detect text in paragraphs (short ones)
    var paragraphs = source.match(/<p[^>]*>([^<]{5,60})<\/p>/gi) || [];
    paragraphs.forEach(function(p) {
      var text = p.replace(/<[^>]+>/g, "").trim();
      if (text && text.length < 60 && !seen[text]) {
        var name = slugify(text).substring(0, 20);
        props.push({ name: name, defaultValue: text, find: text });
        seen[text] = true;
      }
    });

    // Detect href values
    var links = source.match(/href="([^"]+)"/gi) || [];
    links.forEach(function(l) {
      var url = l.match(/href="([^"]+)"/)[1];
      if (url && url !== "#" && !seen[url]) {
        var name = "link_" + slugify(url).substring(0, 15);
        props.push({ name: name, defaultValue: url, find: url });
        seen[url] = true;
      }
    });

    return props.slice(0, 8); // Max 8 auto-detected props
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").substring(0, 30);
  }

  // Build the component .htx source
  function buildComponentSource(originalSource, props) {
    var result = "";

    // htx:props block
    if (props.length > 0) {
      result += "<htx:props>\n";
      props.forEach(function(p) {
        if (p.name) {
          result += p.name + ' = "' + (p.defaultValue || "") + '"\n';
        }
      });
      result += "</htx:props>\n";
    }

    // Replace detected values with {{ prop }} placeholders
    var body = originalSource;
    props.forEach(function(p) {
      if (p.name && p.find) {
        // Replace the found text with the prop placeholder
        body = body.split(p.find).join("{{ " + p.name + " }}");
      }
    });

    result += body;
    return result;
  }

  // Collect props from the dialog form
  function collectProps() {
    var rows = document.querySelectorAll(".sac-prop-row");
    var props = [];
    rows.forEach(function(row) {
      var name = row.querySelector(".sac-prop-name").value.trim();
      var defaultValue = row.querySelector(".sac-prop-default").value.trim();
      var find = row.querySelector(".sac-prop-find").value.trim();
      if (name) props.push({ name: name, defaultValue: defaultValue, find: find });
    });
    return props;
  }

  // Render prop input rows
  function renderPropInputs(props) {
    return props.map(function(p) { return renderPropRow(p.name, p.defaultValue, p.find); }).join("");
  }

  function renderPropRow(name, defaultValue, find) {
    return '<div class="sac-prop-row">' +
      '<input class="sac-prop-name sac-input-sm" placeholder="prop name" value="' + esc(name) + '" />' +
      '<input class="sac-prop-default sac-input-sm" placeholder="default value" value="' + esc(defaultValue) + '" />' +
      '<input class="sac-prop-find sac-input-sm" placeholder="text to replace" value="' + esc(find) + '" />' +
      '<button class="sac-remove-prop">×</button>' +
      '</div>';
  }

  // Add to custom palette category
  function addToCustomPalette(name, label) {
    var container = document.getElementById("palette-panel");
    if (!container) return;

    // Find or create custom section
    var customSection = container.querySelector(".custom-components-section");
    if (!customSection) {
      customSection = document.createElement("div");
      customSection.className = "editor-palette-section custom-components-section";
      customSection.innerHTML = '<div class="editor-palette-category">✨ Custom Components</div>';
      container.insertBefore(customSection, container.firstChild);
    }

    var item = document.createElement("div");
    item.className = "palette-item";
    item.draggable = true;
    item.textContent = label || name;
    item.dataset.source = '<htx:component src="/components/' + name + '.htx" />';
    item.addEventListener("dragstart", function(e) {
      e.dataTransfer.setData("text/plain", JSON.stringify({ source: this.dataset.source }));
    });
    customSection.appendChild(item);
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  // Expose
  window.__saveAsComponent = { show: showSaveDialog };

  // Load existing custom components at init
  fetch("/api/custom-components")
    .then(function(r) { return r.json(); })
    .then(function(components) {
      if (Array.isArray(components)) {
        components.forEach(function(c) { addToCustomPalette(c.name, c.name); });
      }
    })
    .catch(function() {});

})();
