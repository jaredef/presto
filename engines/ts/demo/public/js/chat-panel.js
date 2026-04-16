// Chat Panel — AI assistant for the unified builder
// Reads and writes the same source signal as the visual builder.

(function() {
  "use strict";

  // State
  var messages = signal([]);
  var loading = signal(false);
  var collapsed = signal(true);
  var conversationHistory = []; // For LLM context (role + content pairs)

  // DOM refs
  var panel, msgContainer, input, sendBtn, toggleBtn, chipsContainer;

  function init() {
    panel = document.getElementById("chat-panel");
    msgContainer = document.getElementById("chat-messages");
    input = document.getElementById("chat-input");
    sendBtn = document.getElementById("chat-send");
    toggleBtn = document.querySelector(".chat-toggle");
    chipsContainer = document.getElementById("chat-chips");
    if (!panel || !input) return;

    // Toggle
    toggleBtn?.addEventListener("click", function() { collapsed.value = !collapsed.value; });

    // Send
    sendBtn?.addEventListener("click", sendMessage);
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Keyboard shortcut: Cmd+L to focus chat
    document.addEventListener("keydown", function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        collapsed.value = false;
        setTimeout(function() { input.focus(); }, 50);
      }
      // Cmd+Z for undo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey && window.__editHistory) {
        var prev = window.__editHistory.undo();
        if (prev !== null && window.__editorState) {
          window.__editorState.source.value = prev;
        }
      }
      // Cmd+Shift+Z for redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey && window.__editHistory) {
        var next = window.__editHistory.redo();
        if (next !== null && window.__editorState) {
          window.__editorState.source.value = next;
        }
      }
    });

    // Listen for visual edits
    window.addEventListener("editor:visual-edit", function(e) {
      addSystemMessage("Visual edit: " + (e.detail?.description || "modified"));
    });

    // Effects
    effect(function() {
      panel.classList.toggle("collapsed", collapsed.value);
      if (toggleBtn) toggleBtn.textContent = collapsed.value ? "▲ AI" : "▼";
    });

    effect(function() { renderMessages(); });
    effect(function() { renderChips(); });

    // Show starters on init
    renderChips();
  }

  function sendMessage() {
    var text = input.value.trim();
    if (!text || loading.value) return;
    input.value = "";

    addMessage("user", text);
    conversationHistory.push({ role: "user", content: text });
    loading.value = true;
    renderMessages();

    var currentSource = window.__editorState?.source?.value || "";

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        currentSource: currentSource,
        history: conversationHistory.slice(-10), // Last 10 messages for context
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      loading.value = false;

      var responseText = data.text || data.message || "No response";
      var modifiedSource = extractSource(responseText);

      // If the AI returned modified source, apply it
      if (modifiedSource && modifiedSource !== currentSource) {
        var oldSource = currentSource;
        window.__editorState.source.value = modifiedSource;

        // Track in edit history
        if (window.__editHistory) {
          window.__editHistory.push("chat", "AI: " + text.substring(0, 50), oldSource, modifiedSource);
        }

        // Build diff display
        var diff = window.diffLines ? window.diffLines(oldSource, modifiedSource) : [];
        var diffHtml = window.renderDiff ? window.renderDiff(diff) : "";
        var cleanResponse = removeSourceBlock(responseText);

        addMessage("assistant", cleanResponse, diffHtml, true);
      } else {
        addMessage("assistant", responseText);
      }

      conversationHistory.push({ role: "assistant", content: responseText });
      renderChips();
    })
    .catch(function(err) {
      loading.value = false;
      addMessage("assistant", "⚠️ Error: " + err.message);
    });
  }

  function addMessage(role, content, diffHtml, applied) {
    var msg = {
      role: role,
      content: content,
      diffHtml: diffHtml || "",
      applied: !!applied,
      timestamp: Date.now(),
    };
    messages.value = messages.value.concat([msg]);
  }

  function addSystemMessage(text) {
    messages.value = messages.value.concat([{
      role: "system",
      content: text,
      timestamp: Date.now(),
    }]);
  }

  // Extract ```htx ... ``` source block from AI response
  function extractSource(text) {
    var match = text.match(/```(?:htx|html)?\s*\n([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  }

  // Remove the source block from the response for display
  function removeSourceBlock(text) {
    return text.replace(/```(?:htx|html)?\s*\n[\s\S]*?```/g, "").trim();
  }

  function renderMessages() {
    if (!msgContainer) return;
    var msgs = messages.value;
    var html = "";

    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      if (m.role === "system") {
        html += '<div class="chat-msg chat-system">' + esc(m.content) + '</div>';
      } else if (m.role === "user") {
        html += '<div class="chat-msg chat-user"><div class="chat-bubble chat-bubble-user">' + esc(m.content) + '</div></div>';
      } else {
        html += '<div class="chat-msg chat-assistant"><div class="chat-bubble chat-bubble-ai">';
        html += formatMarkdown(m.content);
        if (m.applied) html += '<div class="chat-applied">✓ Applied to template</div>';
        if (m.diffHtml) html += '<details class="chat-diff"><summary>View changes</summary>' + m.diffHtml + '</details>';
        html += '</div></div>';
      }
    }

    if (loading.value) {
      html += '<div class="chat-msg chat-assistant"><div class="chat-bubble chat-bubble-ai chat-loading">Thinking...</div></div>';
    }

    msgContainer.innerHTML = html;
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  function renderChips() {
    if (!chipsContainer) return;
    var source = window.__editorState?.source?.value || "";
    var suggestions = window.__getSuggestions ? window.__getSuggestions(source) : [];

    var html = suggestions.slice(0, 4).map(function(s) {
      return '<button class="chat-chip" data-prompt="' + esc(s.prompt) + '">' + s.label + '</button>';
    }).join("");

    chipsContainer.innerHTML = html;

    chipsContainer.querySelectorAll(".chat-chip").forEach(function(btn) {
      btn.addEventListener("click", function() {
        input.value = this.dataset.prompt;
        sendMessage();
      });
    });
  }

  function sendChip(prompt) {
    input.value = prompt;
    sendMessage();
  }

  function formatMarkdown(text) {
    if (!text) return "";
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.8rem">$1</code>')
      .replace(/\n/g, "<br>");
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Init when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
