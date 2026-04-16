// Starter Prompts + Contextual Suggestions

(function(global) {
  "use strict";

  var starters = [
    { label: "📝 Blog", prompt: "Create a blog page with a list of published posts showing title, excerpt, and a read more link" },
    { label: "📊 Dashboard", prompt: "Create a dashboard with stat cards showing total posts, published count, and draft count" },
    { label: "📋 CRUD", prompt: "Create a page to manage posts: a list with edit/delete links and a create new post form" },
    { label: "🏠 Landing", prompt: "Create a landing page with a hero heading, subtitle, and a grid of feature cards" },
    { label: "🔐 Auth", prompt: "Add authentication gating that shows different content to logged-in vs guest users" },
    { label: "🔍 Search", prompt: "Add a search form that filters posts with a results list and pagination" },
  ];

  function getSuggestions(source) {
    var suggestions = [];
    if (!source || source.trim().length < 10) return starters.map(function(s) { return s; });

    var has = function(directive) { return source.indexOf(directive) !== -1; };

    if (has("htx:data") && !has("htx:each"))
      suggestions.push({ label: "Add iteration", prompt: "Add htx:each to iterate over the data and display each item" });
    if (has("<form") && !has("htx:action"))
      suggestions.push({ label: "Add mutation token", prompt: "Add an htx:action directive to sign the form submission" });
    if (!has("htx:auth") && !has("htx:unauth"))
      suggestions.push({ label: "Add auth gating", prompt: "Add htx:auth and htx:unauth to show different content based on login state" });
    if (has("htx:each") && !has("htx:component"))
      suggestions.push({ label: "Use components", prompt: "Wrap the iterated items in Card components from the UI library" });
    if (has("htx:each") && !has("htx:empty"))
      suggestions.push({ label: "Add empty state", prompt: "Add an htx:empty block to show a message when there are no results" });
    if (!has("htx:let") && has("htx:v"))
      suggestions.push({ label: "Add variables", prompt: "Extract repeated values into htx:let variables for reuse" });
    if (has("htx:data") && !has("order"))
      suggestions.push({ label: "Add sorting", prompt: "Add order attribute to the htx:data directive to sort the results" });

    return suggestions.length > 0 ? suggestions : [
      { label: "Improve layout", prompt: "Improve the visual layout with better spacing and a grid arrangement" },
      { label: "Add more data", prompt: "What other data could we display on this page?" },
    ];
  }

  global.__starters = starters;
  global.__getSuggestions = getSuggestions;
})(typeof window !== "undefined" ? window : globalThis);
