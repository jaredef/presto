// Document Schema — structural grammar for hypermedia document composition
// Defines what elements can contain what, and provides the builder with
// structural awareness.

(function(global) {
  "use strict";

  // The structural levels and their containment rules
  var SCHEMA = {
    // Level 1: Landmarks
    "header": { level: 1, label: "Header", icon: "🏛️", accepts: ["nav", "heading", "link", "button", "badge", "img"] },
    "main":   { level: 1, label: "Main",   icon: "📄", accepts: ["section", "article", "aside", "card", "form", "data-list", "alert", "table", "island", "auth", "conditional", "grid", "flex"] },
    "footer": { level: 1, label: "Footer", icon: "🏛️", accepts: ["nav", "link", "paragraph", "badge"] },

    // Level 2: Regions
    "section": { level: 2, label: "Section", icon: "📐", accepts: ["heading", "card", "data-list", "form", "alert", "table", "island", "auth", "conditional", "paragraph", "grid", "flex", "separator", "aside", "img", "link", "button", "badge"] },
    "article": { level: 2, label: "Article", icon: "📰", accepts: ["heading", "paragraph", "card", "data-list", "form", "img", "link", "badge", "separator", "auth", "conditional"] },
    "aside":   { level: 2, label: "Aside",   icon: "📎", accepts: ["heading", "nav", "card", "alert", "paragraph", "link", "badge", "data-list", "auth"] },
    "nav":     { level: 2, label: "Nav",     icon: "🧭", accepts: ["link", "button", "badge", "separator"] },

    // Level 3: Content Blocks
    "card":      { level: 3, label: "Card",      icon: "📦", accepts: ["heading", "paragraph", "badge", "button", "link", "img", "separator", "form", "auth"] },
    "data-list": { level: 3, label: "Data List", icon: "📊", accepts: ["card", "article", "paragraph", "badge", "link", "button", "table"] },
    "form":      { level: 3, label: "Form",      icon: "📝", accepts: ["input", "textarea", "select", "checkbox", "button", "heading", "paragraph", "alert"] },
    "alert":     { level: 3, label: "Alert",     icon: "⚠️", accepts: ["paragraph", "link", "button"] },
    "table":     { level: 3, label: "Table",     icon: "📋", accepts: ["heading", "paragraph", "badge", "link"] },

    // Level 4: Inline Elements
    "heading":   { level: 4, label: "Heading",   icon: "🔤", accepts: ["badge"] },
    "paragraph": { level: 4, label: "Paragraph", icon: "📝", accepts: ["link", "badge"] },
    "link":      { level: 4, label: "Link",      icon: "🔗", accepts: [] },
    "button":    { level: 4, label: "Button",    icon: "🖱️", accepts: [] },
    "badge":     { level: 4, label: "Badge",     icon: "🏷️", accepts: [] },
    "input":     { level: 4, label: "Input",     icon: "✏️", accepts: [] },
    "textarea":  { level: 4, label: "Textarea",  icon: "📋", accepts: [] },
    "select":    { level: 4, label: "Select",    icon: "📋", accepts: [] },
    "checkbox":  { level: 4, label: "Checkbox",  icon: "☑️", accepts: [] },
    "img":       { level: 4, label: "Image",     icon: "🖼️", accepts: [] },
    "separator": { level: 4, label: "Separator", icon: "➖", accepts: [] },

    // Level 5: Capability Boundaries
    "island":      { level: 5, label: "Island",      icon: "🏝️", accepts: [] },
    "auth":        { level: 5, label: "Auth Gate",    icon: "🔒", accepts: ["section", "card", "data-list", "form", "alert", "paragraph", "heading", "button", "link", "island"] },
    "conditional": { level: 5, label: "Conditional",  icon: "❓", accepts: ["section", "card", "data-list", "form", "alert", "paragraph", "heading", "button", "link"] },

    // Layout Helpers
    "grid":      { level: 3, label: "Grid",      icon: "⊞", accepts: ["card", "article", "section", "form", "alert", "island", "paragraph", "img"] },
    "flex":      { level: 3, label: "Flex Row",   icon: "↔️", accepts: ["card", "button", "link", "badge", "input", "paragraph", "img"] },
    "container": { level: 3, label: "Container", icon: "📦", accepts: ["section", "card", "data-list", "form", "heading", "paragraph", "grid", "flex"] },
  };

  // Palette categories organized by structural level
  var PALETTE_CATEGORIES = [
    {
      name: "Structure",
      icon: "📐",
      items: [
        { type: "element", tag: "section", label: "Section", source: '<section class="{htx:styles.section}">\n  <h2 class="{htx:styles.heading-section}">Section Title</h2>\n  \n</section>' },
        { type: "element", tag: "article", label: "Article", source: '<article>\n  <h2>Article Title</h2>\n  <p>Article content.</p>\n</article>' },
        { type: "element", tag: "aside", label: "Aside", source: '<aside>\n  <h3>Sidebar</h3>\n  <p>Supplementary content.</p>\n</aside>' },
        { type: "element", tag: "hr", label: "Separator", source: '<htx:component src="/ui/separator.htx" />' },
      ]
    },
    {
      name: "Content",
      icon: "📦",
      items: [
        { type: "component", name: "card", label: "Card", source: '<htx:component src="/ui/card.htx" title="Card Title" description="">\n  <p>Card content.</p>\n</htx:component>' },
        { type: "data-list", label: "Data List", source: '<htx:data type="post" where="status=\'published\'" order="id desc" limit="10" as="items" />\n<htx:each items="items" as="item">\n  <htx:component src="/ui/card.htx" title="{htx:item.title}">\n    <p><htx:v>item.body</htx:v></p>\n  </htx:component>\n<htx:empty />\n  <p>No items found.</p>\n</htx:each>' },
        { type: "component", name: "form", label: "Form", source: '<htx:component src="/ui/form.htx" action="create" type="post">\n  <htx:component src="/ui/input.htx" label="Title" name="title" required="required" />\n  <htx:component src="/ui/textarea.htx" label="Body" name="body" rows="4" />\n</htx:component>' },
        { type: "component", name: "alert", label: "Alert", source: '<htx:component src="/ui/alert.htx" variant="info" title="Note">Alert content here.</htx:component>' },
        { type: "component", name: "table", label: "Table", source: '<htx:component src="/ui/table.htx">\n  <thead><tr><th>Column</th></tr></thead>\n  <tbody><tr><td>Data</td></tr></tbody>\n</htx:component>' },
      ]
    },
    {
      name: "Text & Media",
      icon: "📝",
      items: [
        { type: "element", tag: "h1", label: "Heading 1", source: '<h1 class="{htx:styles.heading-hero}">Heading</h1>' },
        { type: "element", tag: "h2", label: "Heading 2", source: '<h2 class="{htx:styles.heading-section}">Heading</h2>' },
        { type: "element", tag: "h3", label: "Heading 3", source: '<h3 class="{htx:styles.heading-card}">Heading</h3>' },
        { type: "element", tag: "p", label: "Paragraph", source: '<p class="{htx:styles.text-body}">Paragraph text.</p>' },
        { type: "element", tag: "a", label: "Link", source: '<a href="#">Link text</a>' },
        { type: "element", tag: "img", label: "Image", source: '<img src="/img/placeholder.jpg" alt="Description" style="max-width:100%" />' },
        { type: "component", name: "badge", label: "Badge", source: '<htx:component src="/ui/badge.htx" variant="secondary">Badge</htx:component>' },
      ]
    },
    {
      name: "Inputs",
      icon: "🎛️",
      items: [
        { type: "component", name: "input", label: "Input", source: '<htx:component src="/ui/input.htx" label="Label" type="text" name="field" />' },
        { type: "component", name: "textarea", label: "Textarea", source: '<htx:component src="/ui/textarea.htx" label="Label" name="field" rows="4" />' },
        { type: "component", name: "select", label: "Select", source: '<htx:component src="/ui/select.htx" label="Label" name="field">\n  <option value="a">Option A</option>\n  <option value="b">Option B</option>\n</htx:component>' },
        { type: "component", name: "checkbox", label: "Checkbox", source: '<htx:component src="/ui/checkbox.htx" label="Check this" name="field" />' },
        { type: "component", name: "button", label: "Button", source: '<htx:component src="/ui/button.htx" variant="default" size="md">Button</htx:component>' },
      ]
    },
    {
      name: "Boundaries",
      icon: "🔒",
      items: [
        { type: "auth", label: "Auth Gate", source: '<htx:auth>\n  <p>Authenticated content.</p>\n</htx:auth>\n<htx:unauth>\n  <p>Guest content.</p>\n</htx:unauth>' },
        { type: "conditional", label: "Conditional", source: '<htx:if test="condition">\n  <p>Shown when true.</p>\n</htx:if>\n<htx:else>\n  <p>Shown when false.</p>\n</htx:else>' },
        { type: "island", label: "Island", source: '<htx:component src="/ui/island.htx" name="my-island">\n  <p>Loading...</p>\n</htx:component>' },
      ]
    },
    {
      name: "Layout",
      icon: "🎨",
      items: [
        { type: "layout", label: "Grid (2 col)", source: '<div class="{htx:styles.grid-2}">\n  <div>Column 1</div>\n  <div>Column 2</div>\n</div>' },
        { type: "layout", label: "Grid (3 col)", source: '<div class="{htx:styles.grid-3}">\n  <div>Column 1</div>\n  <div>Column 2</div>\n  <div>Column 3</div>\n</div>' },
        { type: "layout", label: "Flex Row", source: '<div class="{htx:styles.flex-row-gap}">\n  \n</div>' },
        { type: "layout", label: "Container", source: '<div class="{htx:styles.container}">\n  \n</div>' },
        { type: "layout", label: "Section (styled)", source: '<section class="{htx:styles.section} {htx:styles.bg-muted}">\n  <div class="{htx:styles.container}">\n    <h2 class="{htx:styles.heading-section}">Section Title</h2>\n    \n  </div>\n</section>' },
      ]
    },
  ];

  // Check if a parent can accept a child
  function canContain(parentType, childType) {
    var parent = SCHEMA[parentType];
    if (!parent) return true; // Unknown parent — allow
    return parent.accepts.indexOf(childType) !== -1;
  }

  // Get the structural level of an element
  function getLevel(type) {
    var entry = SCHEMA[type];
    return entry ? entry.level : 3; // Default to content block
  }

  // Get the schema info for an element
  function getSchemaInfo(type) {
    return SCHEMA[type] || null;
  }

  global.__documentSchema = {
    SCHEMA: SCHEMA,
    PALETTE_CATEGORIES: PALETTE_CATEGORIES,
    canContain: canContain,
    getLevel: getLevel,
    getSchemaInfo: getSchemaInfo,
  };

})(typeof window !== "undefined" ? window : globalThis);
