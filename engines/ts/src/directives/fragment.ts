// F4: <htx:fragment name="x">...</htx:fragment> marks a region of the page
// (.plans/htxlang-closure-plan.md, K6). The page always resolves in full; when an htmx
// request's HX-Target names a fragment, the response is that region's bytes, so a partial
// response is exactly the region of the full representation.

const TOKEN = /<htx:fragment\s+name="([\w-]+)"\s*>|<\/htx:fragment>/g;
const MARK = /<!--PRESTO:FRAGMENT:(BEGIN|END):([\w-]+)-->/g;

// Before stripping: pair opens and closes by depth and turn them into named comment marks.
export function markFragments(content: string): string {
  const open: string[] = [];
  return content.replace(TOKEN, (tag, name: string | undefined) => {
    if (name) {
      open.push(name);
      return `<!--PRESTO:FRAGMENT:BEGIN:${name}-->`;
    }
    const closing = open.pop();
    return closing ? `<!--PRESTO:FRAGMENT:END:${closing}-->` : tag;
  });
}

// At the end: the named region (inner marks removed) when it exists, else the whole page
// with every mark removed.
export function selectFragment(content: string, target: string | undefined): string {
  if (target) {
    const begin = `<!--PRESTO:FRAGMENT:BEGIN:${target}-->`;
    const start = content.indexOf(begin);
    const end = content.indexOf(`<!--PRESTO:FRAGMENT:END:${target}-->`, start);
    if (start !== -1 && end !== -1) {
      return content.slice(start + begin.length, end).replace(MARK, "");
    }
  }
  return content.replace(MARK, "");
}
