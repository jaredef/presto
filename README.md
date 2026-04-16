# PRESTO Engine Derivations

**Seven conformant implementations of the [htxlang specification](https://github.com/jaredef/htxlang), each derived from the same constraint seed ([PRESTO Seed](https://github.com/jaredef/htxlang/blob/main/seed/presto-seed.md)). Different languages. Same constraints. Same induced properties.**

This repository is the empirical case for the [derivation inversion](https://jaredfoy.com/doc/247-the-derivation-inversion): prose-stated constraints produce conformant implementations across substrates.

---

## Engines

| Engine | Language | Lines | Status | Notes |
|:--|:--|--:|:--|:--|
| [engines/ts](engines/ts) | TypeScript/Bun | ~1,555 | **Reference (canary)** | Powers [jaredfoy.com](https://jaredfoy.com). Most complete. |
| [engines/go](engines/go) | Go | ~2,387 | Functional | HTTP server with full pipeline |
| [engines/elixir](engines/elixir) | Elixir | ~26,764 | Functional | Phoenix-based, comprehensive |
| [engines/rust](engines/rust) | Rust | ~54,155 | In progress | Most ambitious derivation |
| [engines/c](engines/c) | C | ~4,209 | Proof of concept | Minimal, compiles on Raspberry Pi 5 |
| [engines/python](engines/python) | Python | ~1,631 | Functional | Simplest derivation |
| [engines/zig](engines/zig) | Zig | ~2,516 | Functional | HTTP server, CLI, conformance tests |

## The Constraint Seed

All engines derive from the same ~2,200-word prose specification: the [PRESTO Seed](https://github.com/jaredef/htxlang/blob/main/seed/presto-seed.md).

The seed specifies:
- The bilateral boundary (`htx:` namespace = server territory; HTML = client territory)
- The resolver model (HTML in, pure HTML out)
- Progressive layers (Layer 0–6, independently adoptable)
- Two-phase mutations (prepare/execute via action tokens)
- The pipeline stages
- Verification contracts

A conformant engine satisfies the contracts. The seed determines the harvest.

## How Engines Are Derived

1. Feed the [PRESTO Seed](https://github.com/jaredef/htxlang/blob/main/seed/presto-seed.md) to a frontier language model
2. Specify the target language
3. The model derives a conformant implementation
4. Run the verification suite against the contracts
5. Iterate until all contracts pass

This has been validated across all seven languages. The same constraints produce the same properties regardless of the implementation language — which is the [SIPE law](https://jaredfoy.com/doc/143-sipe) in action.

## Specification

The formal specification lives at [github.com/jaredef/htxlang](https://github.com/jaredef/htxlang):
- [htxlang v0.2](https://github.com/jaredef/htxlang/blob/main/spec/htxlang-v1.md) — the specification (8 contracts, RFC 2119)
- [Implementation guide](https://github.com/jaredef/htxlang/blob/main/spec/implementation.md) — algorithms and data structures
- [Reference profile](https://github.com/jaredef/htxlang/blob/main/spec/reference-profile.md) — recommended choices

## Related

- [htxlang.org](https://htxlang.org) — the specification site
- [jaredfoy.com](https://jaredfoy.com) — the RESOLVE corpus (the broader framework)
- [The Seed Garden](https://jaredfoy.com/garden) — empirical demonstrations of constraint-first derivation
- [Doc 247: The Derivation Inversion](https://jaredfoy.com/doc/247-the-derivation-inversion) — the method

## License

MIT

---

*Jared Foy, Southern Oregon*
