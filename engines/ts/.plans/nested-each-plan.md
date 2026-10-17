# Nested htx:each

**Status:** COMPLETE (committed 2026-10-17)
**Date:** 2026-10-06

## Summary

An `htx:each` inside an `htx:each` did not resolve. Found by stemma's studio,
which vendors this engine (`stemma/vendor/presto-ts`) and needs a form of
questions, each with its answers.

Two faults in `src/directives/control-flow.ts`:

1. **Pairing.** `EACH_RE` matched lazily to the first `</htx:each>`, so an outer
   block closed at its inner block's close tag.
2. **Order.** Each iteration evaluated its expressions before resolving nested
   control flow, so an inner item's `<htx:v>` resolved before the inner item
   existed and came out empty.

## Phases

### Phase 1: Failing tests, then the fix

- Tests in `tests/unit/control-flow.test.ts`: an each nested in an each; an
  inner `htx:empty` belonging to the inner each; an `htx:if` inside a nested
  each seeing the inner item; sibling eaches staying separate (passed before
  and after).
- Fix: blocks are paired by depth (`pairBlock`), an `htx:empty` counts only at
  its own block's depth, and each iteration resolves nested control flow
  before its own expressions.

### Phase 2: Nested htx:if

The same pairing fault in `htx:if`: `IF_RE` matched lazily to the first
`</htx:if>`, and an `htx:else` was taken lazily to the first `</htx:else>`.
Found when stemma's swipe page needed a tally inside a conditional header.

- Tests: an if nested in an if; a false outer if hiding its nested ifs and
  taking its own else; a nested if keeping its own else inside the outer else.
- Fix: `closeOf` pairs `htx:if` and `htx:else` blocks by depth; an else
  belongs to the if it directly follows. The order within a branch
  (expressions, then nested control flow) is unchanged: at every level eaches
  resolve before ifs, so an each inside an if already has its item in scope.

## Execution log

- Phase 1, before the fix: 18 pass, 3 fail in `control-flow.test.ts` (the
  three nesting tests; siblings passed). After: 21 pass, 0 fail; whole suite
  242 pass, 0 fail (238 before, plus 4).
- Phase 2, before the fix: 21 pass, 3 fail (the three nested-if tests). After:
  24 pass, 0 fail; whole suite 245 pass, 0 fail.
