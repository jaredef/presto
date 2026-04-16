# Progressive Escape Guide

Every library component can be replaced with raw htx: directives. This is by design.

## The Principle

The library adds curated constraints that simplify your mental model. Those constraints are removable without leaving the architecture. You never hit a wall you can't escape.

## Three Levels

### Level 1: Use the component

```html
<htx:component src="/ui/data-table.htx" type="post" columns="title,status" />
```

You don't need to know how it works. Props in, rendered table out.

### Level 2: Customize via slots

```html
<htx:component src="/ui/data-table.htx" type="post" columns="title,status">
  <td><a href="/post/{htx:row.slug}"><htx:v>row.title</htx:v></a></td>
  <td><htx:component src="/ui/badge.htx" variant="secondary"><htx:v>row.status</htx:v></htx:component></td>
</htx:component>
```

Custom row rendering. The component handles the query and iteration.

### Level 3: Drop to raw directives

```html
<htx:data type="post" where="status='published'" order="id desc" as="posts" />
<table class="ui-table">
  <thead><tr><th>Title</th><th>Status</th></tr></thead>
  <tbody>
    <htx:each items="posts" as="post">
    <tr>
      <td><a href="/post/{htx:post.slug}"><htx:v>post.title</htx:v></a></td>
      <td><htx:v>post.status | capitalize</htx:v></td>
    </tr>
    </htx:each>
    <htx:empty>
    <tr><td colspan="2">No posts found.</td></tr>
    </htx:empty>
  </tbody>
</table>
```

Full control. Same CSS classes work. No component needed.

## How to Read the Escape Path

Open the component file. It's an `.htx` file — HTML + directives. Everything it does is visible.

```
templates/ui/data-table.htx    ← Open this file
```

You'll see the htx:data query, the htx:each loop, the table structure, and the htx:script. Copy what you need. Modify what you want. Delete what you don't.

## Examples by Component

### Dialog → raw

**Library:**
```html
<htx:component src="/ui/dialog.htx" trigger="Delete" title="Confirm">
  <p>Are you sure?</p>
</htx:component>
```

**Escaped:**
```html
<div>
  <button onclick="this.nextElementSibling.style.display='flex'">Delete</button>
  <div class="ui-dialog-overlay" style="display:none">
    <div class="ui-dialog-content">
      <h3>Confirm</h3>
      <p>Are you sure?</p>
      <button onclick="this.closest('.ui-dialog-overlay').style.display='none'">Close</button>
    </div>
  </div>
</div>
```

### Form → raw

**Library:**
```html
<htx:component src="/ui/form.htx" action="create" type="post">
  <htx:component src="/ui/input.htx" label="Title" name="title" />
</htx:component>
```

**Escaped:**
```html
<htx:action name="create" type="post" />
<form method="post" class="ui-form">
  <input type="hidden" name="_action_token" value="{htx:$actions.create}" />
  <div class="ui-field">
    <label class="ui-label">Title</label>
    <input type="text" name="title" class="ui-input" />
  </div>
  <button type="submit" class="ui-btn ui-btn-default ui-btn-md">Submit</button>
</form>
```

## The Guarantee

Removing a library component never requires changing the engine, the architecture, or the deployment. You always land on raw htx: directives — which are the foundation the library was built on.
