// Source Diff — minimal line-by-line diff for .htx templates

(function(global) {
  "use strict";

  function diffLines(oldText, newText) {
    var oldLines = oldText.split("\n");
    var newLines = newText.split("\n");
    var result = [];
    var i = 0, j = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        result.push({ type: "same", line: oldLines[i] });
        i++; j++;
      } else if (j < newLines.length && (i >= oldLines.length || !oldLines.includes(newLines[j]))) {
        result.push({ type: "add", line: newLines[j] });
        j++;
      } else if (i < oldLines.length && (j >= newLines.length || !newLines.includes(oldLines[i]))) {
        result.push({ type: "remove", line: oldLines[i] });
        i++;
      } else {
        result.push({ type: "remove", line: oldLines[i] });
        result.push({ type: "add", line: newLines[j] });
        i++; j++;
      }
    }
    return result;
  }

  function renderDiff(diff) {
    var added = diff.filter(function(d) { return d.type === "add"; }).length;
    var removed = diff.filter(function(d) { return d.type === "remove"; }).length;
    if (added === 0 && removed === 0) return "";

    var html = '<div class="diff-summary">+' + added + ' / -' + removed + ' lines</div>';
    html += '<div class="diff-content">';
    var sameCount = 0;
    for (var i = 0; i < diff.length; i++) {
      var d = diff[i];
      if (d.type === "same") {
        sameCount++;
        if (sameCount <= 2 || i >= diff.length - 2) {
          html += '<div class="diff-line diff-same">' + escDiff(d.line) + '</div>';
        } else if (sameCount === 3) {
          html += '<div class="diff-line diff-skip">...</div>';
        }
      } else {
        sameCount = 0;
        var cls = d.type === "add" ? "diff-add" : "diff-remove";
        var prefix = d.type === "add" ? "+" : "-";
        html += '<div class="diff-line ' + cls + '">' + prefix + ' ' + escDiff(d.line) + '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  function escDiff(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  global.diffLines = diffLines;
  global.renderDiff = renderDiff;
})(typeof window !== "undefined" ? window : globalThis);
