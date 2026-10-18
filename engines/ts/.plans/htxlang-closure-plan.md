# htxlang closure: eight features derived from constraints

**Status:** COMPLETE (committed 2026-10-17)
**Date:** 2026-10-17
**Method:** GCCS (spawn-gccs): null style, accumulated named constraints, induced properties, derivation, witnesses.
**Oracle:** the PRESTO Seed (`engines/*/PRESTO-SPEC.md`): Architectural Rationale, contracts C1 to C8, the 22-stage pipeline, the 22 verification tests.
**External witness:** the Diamond Homes site (`bastion-forge/engagements/diamond-homes/site`), an independent consumer that was built against the null style and is migrated onto the derived features. The unit suite is necessary; the site is the read from outside.

## Pressure

Building the Diamond Homes site on this engine surfaced eight features, each a workaround the site had to carry:

| | Feature | Workaround the site carried |
|---|---|---|
| F1 | Comparisons in `htx:if` | an adapter pseudo-clause (`mark`) to flag the active chip, radio, thumbnail |
| F2 | Pipe chains and pipe arguments | precomputed `total`, `prev`, `next`, zero-padded numbers in the JSON; two extra queries for "11 more" and its plural |
| F3 | `htx:data` reading earlier results | a `related_to` pseudo-clause |
| F4 | Fragment responses for htmx | whole pages returned and cut down by `hx-select` |
| F5 | 404 from the template | `server.ts` re-reading JSON to decide 404 before the engine runs |
| F6 | Partials not routable | `server.ts` 404 guard for `/partials` and `/_*` |
| F7 | Single evaluation | a zero-width-space guard, then `{` added to escaping (a deviation from C8) |
| F8 | A first-party file adapter | a 70-line site adapter |

## Null style

htxlang at `6137f85`. Expressions are paths with at most one pipe; `htx:if` tests truthiness of one path; `htx:data` interpolates `{htx:}` values into the `where` text; resolved values can be read again by later passes; every `.htx` file is routable.

## Probed baseline (before any move)

- F3 already holds. `htx:data` directives resolve in source order and each interpolates against the context the earlier ones filled. Untested and undocumented, not missing.
- `where="slug = '{htx:x}' AND status = 'published'"` takes the slug shortcut (`adapter.get`) and silently drops `AND status = 'published'`: a draft is returned.
- `where="service = '{htx:query.s}'"` with `s = z' OR '1'='1` hands the adapter `service = 'z' OR '1'='1'`. The SQLite adapter executes `where` as SQL text (`src/adapters/sqlite.ts`), so this is SQL injection from the query string. In-repo templates only interpolate inside slug lookups, which go through the parameterized `get`, so the demos are not exposed; any other interpolated `where` is.
- Re-evaluation is not one site but several: `{htx:}` attribute scanning runs over text `htx:v` just emitted (same call); `htx:if` branches evaluate, then stage 15 evaluates again; stages 19 and 21 evaluate the whole document again.
- Responses whose body depends on `HX-Request` carry no `Vary` header.

## Constraints

Shared constraints first: each is stated once and every feature that touches its surface inherits it. Rings per Doc 658: Ring 1 sits at a boundary where violation cascades; Ring 2 is structural shape; Ring N is ergonomics.

| | Constraint | Ring | Oracle |
|---|---|---|---|
| K1 | **Bilateral boundary.** New syntax lives in the `htx:` namespace and is consumed by the engine; nothing new is evaluated inside `<script>`; the resolved output carries no `htx:`. | 1 | Rationale; C1 |
| K2 | **Resolution is a function of the request.** Output depends only on template, request, adapter state. No session, no hidden state between requests. | 1 | REST statelessness; C4 rationale |
| K3 | **Values never become grammar.** A value from a request or a record crosses into another grammar (SQL `where`, the expression language, HTML) only as a value: a bound parameter, escaped text. | 1 | C8 "security through absence" |
| K4 | **One emission.** A resolved value is written into the output once and is never read again as template. | 1 | C2 ordering; C1 (data is not source) |
| K5 | **Fail closed before emission.** Malformed syntax in the expression language, a pipe that does not exist, a `where` an adapter cannot parse: a structural error, never a silent falsy, empty or unchanged value. | 1 | Doc 730 P3; C8 |
| K6 | **The full page is the canonical representation.** A partial response is that region of the full representation for the same request, byte for byte; anything in the request that changes the body is declared in `Vary`. | 1 | Resolver model; REST cacheability |
| K7 | **Only pages are addressable.** A template whose path has a segment beginning with `_` is engine-internal (the `_layout.htx` precedent) and never resolves as a URL. | 1 | Router; File Conventions |
| K8 | **The expression language is a closed, typed alphabet.** Paths, literals, a fixed operator set, a fixed pipe set. No host-language evaluation, no arithmetic beyond named pipes. | 2 | Doc 730 P1; C1 |
| K9 | **The tag scanner stays regular.** New syntax contains no `>` inside a directive's attributes, since every directive is matched by `[^>]*`. | 2 | Patterns |
| K10 | **Adapters share one interface.** A new adapter implements `ContentAdapter` as specified; new capability (bound parameters) is added to the interface, not to one adapter. | 2 | Interface Signatures |

## Induced properties

What the coherent constraints force, before any one feature is written:

- **P1 (K3).** `htx:data` lowers each `{htx:}` inside `where` to a placeholder `?` and a bound parameter. Adapters receive `where` with placeholders plus `params`. The slug shortcut is taken only when the whole `where` is one slug equality. Injection and the dropped-clause bug close together, because both came from treating values as `where` text.
- **P2 (K4).** Evaluated values are emitted as opaque placeholders into a per-request value table and restored once, at stage 22, in a single non-rescanning pass. Every re-evaluation site closes at once, including ones not yet found, because no later pass can see a value's text.
- **P3 (K4 then K3).** With P2 in place, encoding `{` in escaping forces nothing: remove it and no witness fails. By the removability test it is decoration, so escaping returns to the oracle's `& < > "` (C8). The `htx:let` once-resolution added with it stays load-bearing: a let that names page data now has no second pass to lean on.
- **P4 (K8, K5, K9).** One expression grammar serves `htx:v`, `{htx:}` and `htx:if`. Ordering operators are words (`lt le gt ge`), equality is `==` / `!=`, logic is `and or not`. A malformed test or an unknown pipe throws a structural error.
- **P5 (K6, K2).** Every template response carries `Vary: HX-Request` (the root-layout skip already depends on it) and `HX-Target` (fragments depend on it).
- **P6 (K7).** The underscore convention also names engine-internal templates the engine looks up itself: `_404.htx` for the not-found representation.

## Features derived

Each lists its implicit constraints (the ones the null style left unstated), what they induce, and the witnesses: positive (the property executes) and negative (the malformed case fails closed).

### F7 Single evaluation (K4, K1)
- Implicit: a value is data, not source; stage order C2 runs once per region.
- Derived: value placeholders (P2); `htx:layout src` reads through the table; escaping back to `& < > "` (P3).
- Witness +: a `{htx:...}` string from a query param, a record or an `htx:if` branch prints literally; titles from lets that name page data still resolve. Witness -: the same string never reaches the data context; no output contains a placeholder.

### F3 Data chaining (K3, K2)
- Implicit: interpolated values are values; directives resolve in source order.
- Derived: P1 (bound parameters; exact slug shortcut). Chaining itself already held; it gains a witness and documentation.
- Witness +: a second `htx:data` filters by a field of the first. Witness -: `z' OR '1'='1` returns nothing on SQLite; `slug = ... AND status = 'published'` does not return a draft.

### F4 Fragments (K6, K1, K2)
- Implicit: htmx asks for a region by `HX-Target`; the region must equal the region in the full page.
- Derived: `<htx:fragment name="x">...</htx:fragment>` marks a region in source; the page resolves fully; when `HX-Request` and `HX-Target` name that fragment, the response body is the region's resolved bytes. P5 headers.
- Witness +: fragment body is a byte-identical substring of the full page. Witness -: an `HX-Target` naming no fragment gets the ordinary response; no `htx:fragment` reaches output.

### F5 404 from the template (K2, K7)
- Implicit: status is part of the representation and is known after data resolution, before layout.
- Derived: `required` on `htx:data`; an empty result ends resolution with 404, rendered by `_404.htx` when present (P6), else the plain not-found. Unrouted URLs use the same representation.
- Witness +: unknown slug gives 404 with `_404.htx`. Witness -: a known slug gives 200; a `required` query with rows is unaffected.

### F6 Partials not routable (K7)
- Derived: the router skips any `_`-prefixed segment, file or directory. `htx:include` still reaches them.
- Witness +: `/_partials/nav` and `/_layout` are 404 while pages including them render. Witness -: `/blog` with no underscore is unaffected.

### F1 Comparisons (K8, K9, K5)
- Grammar: `or` of `and` of `not`* of `operand [op operand]`; operands are paths with pipes or literals (`'text'`, numbers, `true`, `false`); `op` in `== != lt le gt ge`.
- Semantics: `==` / `!=` compare as numbers when both sides are numbers or numeric strings, else as strings (missing is `""`). Ordering likewise. A lone operand keeps today's truthiness.
- Witness +: `f.key == query.service`, `rest|length gt 1`, `not a and b`. Witness -: `a ==`, `a > b`, `a ===` throw.

### F2 Pipes (K8, K5)
- Chains `a | p1 | p2`, arguments `p:arg:arg` (literals only). Adds `plus`, `minus`, `pad`, `default`, `plural` (two forms, so not tied to English), to the existing six.
- Witness +: `n|plus:1|pad:2` gives `04`; `count|plural:'project':'projects'`. Witness -: an unknown pipe throws; `plus:'x'` throws.

### F8 File adapter (K10, K3, K5)
- `src/adapters/json.ts`: a `ContentAdapter` over `<dir>/<type>.json`. `where` grammar: `field (= | != | ?=) (? | 'text' | number)` joined by `AND`, where `?=` is equality that an empty value turns off (a filter set to all; added when the external witness needed it); bound parameters; anything else throws. Writes are read-modify-write of the file.
- Witness +: query, order, limit, offset, params, get by slug or id, create/update/delete round trip. Witness -: `a LIKE 'x'` throws; a parameter count mismatch throws.

## Order of derivation

Ring 1 first (Doc 658): F7, F3 (P1), F4 with P5, F6, F5. Then Ring 2: F1 and F2 as one grammar. Then Ring N: F8. Then the external witness: migrate the Diamond Homes site and run its checks; docs (`src/llm/template-context.md`, `docs/surface-by-default.md`).

## Coherence lane

`bun test` (whole suite, before and after each phase) plus the Diamond Homes site: every page status and title, the projects filters and paging, photo pages, contact POST paths.

## Execution log

(appended per phase)

### Rung 0: baseline (2026-10-17)
Suite 255 pass. Probes recorded above under "Probed baseline". External witness baseline: the unmigrated Diamond Homes site on a worktree of `6137f85`, 24 URLs (statuses and bodies saved).

### Rung 1: F7 single emission (Ring 1)
`ValueTable` in `src/expressions.ts`; `htx:v` and `{htx:}` matched in one scan; the pipeline attaches the table, reads `htx:layout src` through it, restores at stage 22 after scripts and raw wrappers. Escaping back to `& < > "` (P3). Witnesses: `tests/unit/reflected-expressions.test.ts` (10). Ablation: with the table detached, 5 of them fail. Suite 259.

### Rung 2: F3 and P1, bound values (Ring 1)
`src/directives/data.ts` lowers `{htx:}` in `where` to `?` plus `params`; `SLUG_ONLY` shortcut; adapter errors are no longer swallowed into `[]`. `params` added to `ContentAdapter.query` and the SQLite adapter. Witnesses: `tests/unit/data-binding.test.ts` (6). Ablation: on the old `data.ts` the injection, bare-value and slug-plus-status witnesses fail; the chaining witness passes on both, confirming F3 already held. Suite 265.

### Rung 3: F4, F5, F6 and P5 (Ring 1)
`src/directives/fragment.ts` (depth-paired marks, region selected after resolution); `NotFound` in `src/types.ts`; `required` on `htx:data`; engine `render()` and `notFound()` with `_404.htx`; `Vary: HX-Request, HX-Target`; router refuses `_` segments. Witnesses: `tests/unit/representations.test.ts` (11). Suite 276.

### Rung 4: F1 and F2, one grammar (Ring 2)
`src/grammar.ts`: tokenizer, parser, evaluator; `ExpressionEngine.resolvePath` and `test` go through it; `htx:if` calls `test`. `TemplateError` in `src/types.ts`. Every existing expression in the repository is a plain path or a path with one pipe, so the stricter grammar broke none. Witnesses: `tests/unit/grammar.test.ts` (11). Suite 287.

### Rung 5: F8 file adapter (Ring N)
`src/adapters/json.ts`. Witnesses: `tests/unit/json-adapter.test.ts` (10). `?=` added during rung 6 when the external witness needed an optional filter. Suite 297.

### Rung 6: external witness (Diamond Homes)
The live site broke the moment rung 2 landed: its own adapter could not read `?` placeholders (roofing filter showed 9 projects, not 3). That is the K10 interface change surfacing in a third-party adapter, read from outside, as intended. Migration: first-party `JsonAdapter`; `_partials/`, `_404.htx`; `required` on the three detail pages; `related_to` replaced by chaining; `mark` replaced by comparisons (chips, thumbnails) and a preselect table read with `default`; photo totals from `set|length|pad:2`; fragments around `#project-browser` and `#bid-form`. `server.ts` lost its slug checks, partial guard and 404 rendering; the site adapter (70 lines) was deleted.
Result against the baseline: 24 of 24 statuses equal; bodies equal after normalizing whitespace except for two intended markup changes (inactive chips and thumbnails no longer carry an empty `aria-current=""`; radios lose a trailing space). Browser: filters, show-more, back, lightbox keys and thumbnails, contact inline errors all behave as before; htmx swaps now receive fragment responses.

## Close record

| Question | Answer |
|---|---|
| What was external? | Eight workarounds in a consumer site; value re-evaluation guarded by a non-spec escape; `where` values spliced into SQL; a slug shortcut that dropped clauses; no `Vary`. |
| What now represents it? | K1 to K10 in this file; `src/grammar.ts`, `ValueTable`, bound `where` params, `htx:fragment`, `required` with `_404.htx`, underscore routing, `JsonAdapter`. |
| Which oracle grounded it? | PRESTO Seed: Rationale (bilateral boundary, statelessness, resolver model), C1, C2, C8, Patterns, Interface Signatures. |
| What witness passed? | 297 unit tests (42 new); the Diamond Homes site against its pre-change baseline. |
| What failed closed? | Malformed tests and pipes (TemplateError); quote-breaking query values (no rows); unreadable `where` in `JsonAdapter`; unknown slugs (404); `_` paths (404). |
| What remains external? | See Deferred. |

## Deferred

- SQLite `query` still swallows SQL errors into `[]` (K5 says it should not). Reopen when a SQLite-backed site needs to tell a malformed `where` from an empty result; changing it now turns existing silent failures into 500s.
- `order` interpolates `{htx:}` as text (sanitized by `sanitizeOrderBy`). Reopen if an `order` value ever comes from a request in a template.
- Stage 17 post-layout processors now see value placeholders, not values. No module registers one. Reopen when the first processor is written.
- A `_404.htx` response to an `htx:data required` miss inside an htmx fragment request returns the whole 404 representation. Reopen if a fragment target is ever a detail view.
- Membership in `htx:if` (`x in list`) was not added; the site's one need was met by data. Reopen on a second need.
- Spec amendment: htxlang's grammar, pipes, `htx:fragment`, `required`, the `_` routing rule and bound `where` parameters are not in the PRESTO Seed. The six other engines do not have them. Keeper decision.
