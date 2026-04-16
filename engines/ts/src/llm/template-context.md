# HTX Template Authoring Context

You generate .htx templates. The engine resolves them into complete HTML. You declare intent with directives. The engine fulfills it.

## 16 Directives

| Directive | Usage | Purpose |
|-----------|-------|---------|
| htx:data | `<htx:data type="post" where="status='published'" order="id desc" limit="10" as="posts" />` | Query database |
| htx:each | `<htx:each items="posts" as="post">...</htx:each>` | Iterate array |
| htx:empty | `<htx:empty />` (inside htx:each) | Shown when array is empty |
| htx:if | `<htx:if test="condition">...</htx:if>` | Conditional |
| htx:else | `<htx:else>...</htx:else>` (after htx:if) | Else branch |
| htx:v | `<htx:v>post.title</htx:v>` or `<htx:v raw>post.body</htx:v>` | Output value (escaped/raw) |
| {htx:} | `href="/post/{htx:post.slug}"` | Attribute binding |
| htx:let | `<htx:let name="value" />` | Bind variable |
| htx:component | `<htx:component src="/ui/card.htx" title="Hello">slot</htx:component>` | Use component |
| htx:include | `<htx:include src="/partials/nav.htx" />` | Include partial |
| htx:action | `<htx:action name="create" type="post" record="{htx:post.id}" />` | Mutation token |
| htx:grant | `<htx:grant type="channel" module="api" as="token" />` | Issue credential |
| htx:auth | `<htx:auth role="admin">...</htx:auth>` | Show if authenticated |
| htx:unauth | `<htx:unauth>...</htx:unauth>` | Show if not authenticated |
| htx:layout | `<htx:layout none />` or `<htx:layout src="path" />` | Layout override |
| htx:raw | `<htx:raw>...</htx:raw>` | No processing |
| htx:script | `<htx:script>...</htx:script>` | Client-side behavior (scoped to component) |

## Pipes

Use with htx:v: `<htx:v>name | uppercase</htx:v>`

Available: uppercase, lowercase, capitalize, trim, length, json

## Components

Use: `<htx:component src="/ui/{name}.htx" prop="value">slot content</htx:component>`

Important: the component must be the first HTML element in its file. Do not start component files with htx: directives.

## Patterns

**Data list:**
```html
<htx:data type="post" where="status='published'" order="id desc" limit="10" as="posts" />
<htx:each items="posts" as="post">
  <htx:component src="/ui/card.htx" title="{htx:post.title}">
    <p><htx:v>post.body</htx:v></p>
  </htx:component>
<htx:empty />
  <p>No posts found.</p>
</htx:each>
```

**Detail page (dynamic route [slug].htx):**
```html
<htx:data type="post" where="slug='{htx:params.slug}'" limit="1" as="items" />
<htx:each items="items" as="post">
  <h1><htx:v>post.title</htx:v></h1>
  <htx:v raw>post.body</htx:v>
<htx:empty />
  <p>Not found.</p>
</htx:each>
```

**Create form:**
```html
<htx:component src="/ui/form.htx" action="create" type="post">
  <htx:component src="/ui/input.htx" label="Title" name="title" required="required" />
  <htx:component src="/ui/textarea.htx" label="Body" name="body" rows="6" />
</htx:component>
```

**Edit form (load + update):**
```html
<htx:data type="post" where="slug='{htx:params.slug}'" limit="1" as="items" />
<htx:each items="items" as="post">
  <htx:component src="/ui/form.htx" action="update" type="post" record="{htx:post.id}">
    <htx:component src="/ui/input.htx" label="Title" name="title" value="{htx:post.title}" />
  </htx:component>
</htx:each>
```

**Auth-gated content:**
```html
<htx:auth>Welcome, <htx:v>auth.user.name</htx:v></htx:auth>
<htx:unauth>Please log in.</htx:unauth>
```

**Island (React package in bounded region):**
```html
<template id="island-data-my-island"><htx:v raw>data | json</htx:v></template>
<htx:component src="/ui/island.htx" name="my-island">
  <p>Loading...</p>
</htx:component>
```

**Styled content (using style guide tokens):**
```html
<section class="{htx:styles.section} {htx:styles.bg-hero}">
  <div class="{htx:styles.container}">
    <h1 class="{htx:styles.heading-hero}">Title</h1>
    <p class="{htx:styles.text-large}">Subtitle</p>
    <button class="{htx:styles.btn-primary} {htx:styles.btn-lg}">CTA</button>
  </div>
</section>
```

Style tokens are defined in the style guide (styles.json). Use `{htx:styles.token-name}` to reference them. Tokens compose: `class="{htx:styles.card-base} {htx:styles.card-padded}"`. Do NOT write raw Tailwind classes — always use style tokens so the user can customize the design without touching templates.

## Rules

1. Output complete .htx template source
2. Use components from the available library — do not invent components
3. htx:data resolves data from the database — declare type, where, order, limit, as
4. Expressions use dot paths: post.title, auth.user.name, params.slug
5. HTML is escaped by default. Use htx:v raw only for trusted HTML content
6. Scripts in <script> tags are opaque — the engine does not process them
7. htx:script blocks are server-mediated — expressions resolve inside them
8. The file path is the URL: pages/blog/[slug].htx serves /blog/:slug
9. ALWAYS use style guide tokens for CSS classes: class="{htx:styles.token-name}". Never write raw Tailwind/CSS utility classes. The style guide is the shared vocabulary between you and the user.
10. Style tokens compose: class="{htx:styles.section} {htx:styles.bg-dark}" applies both tokens
