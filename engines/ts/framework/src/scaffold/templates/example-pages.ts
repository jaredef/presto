export function generateExamplePages() {
  return {
    blogList: `<!-- Layer 0: List page with server-side data.
     htx:data queries SQLite. htx:each iterates results.
     No client JavaScript. No loading state.
     Escape: add search-input component (Layer 2). -->

<section class="app-section">
  <h1>Blog</h1>
  <htx:data type="post" where="status = 'published'" order="id desc" limit="10" as="posts" />
  <div class="app-grid">
    <htx:each items="posts" as="post">
    <htx:component src="/ui/card.htx" title="{htx:post.title}">
      <p><htx:v>post.body</htx:v></p>
      <div style="margin-top:0.75rem">
        <htx:component src="/ui/badge.htx" variant="secondary"><htx:v>post.status | capitalize</htx:v></htx:component>
        <a href="/blog/{htx:post.slug}" style="margin-left:0.5rem">Read more</a>
      </div>
    </htx:component>
    <htx:empty />
    <htx:component src="/ui/alert.htx" variant="info" title="No posts yet">Create your first post to see it here.</htx:component>
    </htx:each>
  </div>
</section>
`,
    blogDetail: `<!-- Layer 0: Detail page with slug-based lookup.
     htx:data resolves a single record from the URL param.
     Escape: add inline editing via htx:script (Layer 2). -->

<htx:data type="post" where="slug = '{htx:params.slug}'" limit="1" as="post_list" />
<htx:each items="post_list" as="post">
<article class="app-section" style="max-width:700px">
  <h1><htx:v>post.title</htx:v></h1>
  <htx:component src="/ui/badge.htx" variant="secondary"><htx:v>post.status | capitalize</htx:v></htx:component>
  <div style="margin-top:1.5rem;line-height:1.8">
    <htx:v raw>post.body</htx:v>
  </div>
  <a href="/blog" style="display:inline-block;margin-top:2rem">&larr; Back to blog</a>
</article>
<htx:empty />
<section class="app-section">
  <h1>Post not found</h1>
  <p>The post you're looking for doesn't exist.</p>
  <a href="/blog">&larr; Back to blog</a>
</section>
</htx:each>
`,
    about: `<!-- Layer 0: Pure HTML. No data. No scripts. The simplest possible page.
     This is what REST looks like: a complete document, sent in full. -->

<section class="app-section" style="max-width:600px">
  <h1>About</h1>
  <p>This application is built with <strong>Hypermedia App</strong>, a framework for the PRESTO architectural style.</p>
  <p>PRESTO formalizes code-on-demand as a progressive spectrum. Each page chooses its own layer of client capability — from pure HTML (Layer 0) to WebAssembly (Layer 6).</p>
  <p>This page is Layer 0. It has no JavaScript. The server sent complete HTML. Your browser rendered it. That's it.</p>
</section>
`,
  };
}
