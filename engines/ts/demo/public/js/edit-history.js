// Edit History — tagged undo/redo across visual and chat edits

(function(global) {
  "use strict";

  var history = [];
  var position = -1;
  var maxHistory = 50;

  function pushEdit(source, description, oldValue, newValue) {
    // Truncate forward history on new edit
    history = history.slice(0, position + 1);
    history.push({
      source: source, // "visual" | "chat" | "manual"
      description: description,
      oldValue: oldValue,
      newValue: newValue,
      timestamp: Date.now(),
    });
    if (history.length > maxHistory) history.shift();
    position = history.length - 1;
  }

  function canUndo() { return position >= 0; }
  function canRedo() { return position < history.length - 1; }

  function undo() {
    if (!canUndo()) return null;
    var entry = history[position];
    position--;
    return entry.oldValue;
  }

  function redo() {
    if (!canRedo()) return null;
    position++;
    return history[position].newValue;
  }

  function getHistory() { return history.slice(); }
  function getPosition() { return position; }

  global.__editHistory = {
    push: pushEdit,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    getHistory: getHistory,
    getPosition: getPosition,
  };
})(typeof window !== "undefined" ? window : globalThis);
