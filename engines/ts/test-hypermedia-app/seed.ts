// Seed blog content derived from Fielding annotations

import { Database } from "bun:sqlite";

const db = new Database("app/data/app.db", { create: true });
db.run("PRAGMA journal_mode=WAL");

db.run(`CREATE TABLE IF NOT EXISTS post (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT,
  title TEXT,
  body TEXT,
  status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

// Clear existing
db.run("DELETE FROM post");

const posts = [
  {
    slug: "constraints-and-induced-properties",
    title: "Constraints and Induced Properties",
    body: `REST is not an architecture. It is an architectural style — a set of constraints that defines a design space. Within that design space, specific architectures can be instantiated. Each candidate architecture that satisfies the constraints inherits the properties those constraints induce: scalability, visibility, reliability, independent evolution.

htxlang is a candidate architecture within this design space. It does not introduce new constraints. It instantiates a specific set of design decisions — a 22-stage resolution pipeline, 16 directives, a bilateral source representation, a grant-based capability system, a two-phase mutation protocol — all of which operate within the constraints REST defines.

The properties htxlang exhibits (server authority, progressive capability, compositional independence) are not invented by the specification. They are induced by the constraints. The specification is the means by which the developer accesses those properties.

This is the relationship between the picnic table and the chess game. The table induces properties on the activities that can occur at it. Chess is an activity that takes advantage of those properties. The game is not a property of the table. But the game would not be possible without the properties the table induces.`,
    status: "published",
  },
  {
    slug: "the-authorial-mental-model",
    title: "The Authorial Mental Model",
    body: `Fielding's dissertation is written from the perspective of the software architect evaluating network-based systems. The mental model is evaluative: given these constraints, what properties emerge? The reader of the dissertation is the architect who selects constraints.

What Fielding did not provide is a mental model for the developer who works within the constraints. He described the design space but not the experience of designing within it.

In PRESTO, the developer writes a source representation that simultaneously addresses two interpreters: the engine (which resolves htx: directives) and the browser (which renders the HTML). The developer must hold both audiences in mind simultaneously. The htx: directives are instructions to the first interpreter. The HTML, scripts, and attributes are instructions to the second. The first interpreter erases its own instructions before the second ever sees the document.

This is the bilateral boundary. No prior work has formalized this authorial perspective. The mental model of bilateral authorship — "I am writing a document that addresses two interpreters simultaneously, and one interpreter will erase its own instructions before the other interpreter sees the document" — appears to be novel.`,
    status: "published",
  },
  {
    slug: "temporal-latency-and-recursive-potentiality",
    title: "Temporal Latency and Recursive Potentiality",
    body: `When the server embeds resolved values into client code — a signed token inside an htx:script block, a channel URL in an attribute — it authors an instruction that does not execute at authoring time. The instruction is latent. It exists in the resolved representation as potential energy. The client may activate it immediately, seconds later, or never.

Time is not a parameter the author controls. It is a dimension the author must reason about. The signed token will expire. The DOM may have changed. The channel may have closed.

The resolved representation doesn't just carry instructions for the client to execute. It carries the potential for the client to mediate further representations. A granted WebSocket token lets the client open a channel. That channel delivers code. That code may navigate to a new URL. That navigation requests a new representation. The cycle repeats.

The progressive layers are degrees of how far into this recursive chain the author can reach from a single source representation. Layer 0 is terminal. Layer 5 is unbounded.`,
    status: "published",
  },
  {
    slug: "react-as-distributed-objects",
    title: "React as Distributed Objects",
    body: `Fielding evaluated the Distributed Objects style in Chapter 3 of his dissertation and scored it negatively on network performance, visibility, and reliability. His verdict: "In spite of all the interest associated with distributed objects, they fare poorly when compared to most other network-based architectural styles."

React implements every defining characteristic of Fielding's Distributed Objects: encapsulation (useState), identity coupling (import paths), custom per-component interfaces (props), and action chains (re-render cascades).

REST inverts the Distributed Objects model. Data flows openly through a uniform interface. The representation IS the data. In DO, you call operations on objects to get data. In REST, the server sends you the data in a complete representation. No operations. No encapsulated state. No identity coupling.

React's ecosystem (Next.js, React Router, Redux, React Query) exists to compensate for properties that the DO architecture fails to induce. In REST, these properties are already induced by the constraints.`,
    status: "published",
  },
  {
    slug: "progressive-escape",
    title: "Progressive Escape: The Asymmetry of Constrained Libraries",
    body: `React's constraints are structural. They are baked into the execution model. When a developer hits a wall, they cannot escape to a broader design space. They can only compensate within the existing constraints. The migration cost is total.

A PRESTO library works inversely. The library adds constraints on top of REST's constraints. These additional constraints are opinions — curated choices that simplify the mental model. But because they sit above the foundational constraints, the developer can remove them without leaving the architecture.

The escape hatch goes downward to the broader design space, not upward to a different one. At every level, the library constrains the developer to a simpler mental model. At every level, the escape hatch is visible: go one layer deeper into the design space. The developer never leaves the architecture. They just use more of it.

The progressive layers are not only a technical spectrum of client capability. They are a comprehension spectrum of authorial reasoning. A library can target any row. The developer starts where they can reason about the system and escapes downward when they need more.`,
    status: "published",
  },
  {
    slug: "compensating-vs-curating-frameworks",
    title: "Compensating Frameworks vs. Curating Frameworks",
    body: `In React's ecosystem, each added tool (Next.js, React Router, Redux) compensates for a missing property by adding complexity. The mental model grows with each compensation. The developer must learn React + Next.js + React Query + Zustand — each with its own mental model, its own constraints, its own failure modes.

In PRESTO's ecosystem, each library simplifies the mental model by curating the design space. The developer learns less, not more. When they need to escape, they remove the library's opinions and reason from the bilateral boundary. The foundational mental model is always sufficient. The library was convenience, not compensation.

This is the distinction: compensating frameworks fill gaps left by insufficient constraints. Curating frameworks navigate a design space whose properties are already complete. The framework is not the product. The comprehension of the design space is the product. The engine is the tool that makes the comprehension practical.`,
    status: "published",
  },
  {
    slug: "six-engines-one-specification",
    title: "Six Engines, One Specification",
    body: `To validate that the specification is language-agnostic and complete, six independent implementations were built in six programming languages: TypeScript (4,000 lines), Go (2,173 lines), Elixir (1,906 lines), Python (1,172 lines), Rust (2,322 lines), and C (3,122 lines, 11.2 MB memory).

Each engine was built from the same specification document — the PRESTO seed, a 2,020-word self-contained knowledge capsule. Each passes the same 22-test verification suite.

The engine is bounded: it does not grow with application complexity. The specification converges through implementation: each new language discovered consequences previous implementations missed. Go found layout extraction ordering. C found SQL injection surfaces and ownership semantics. Each finding was promoted into the specification.

The resource floor for the complete PRESTO specification is approximately 11 MB of memory and 1,200 lines of code. The engine can run on embedded devices, edge nodes, anywhere with a compiler and a network socket.`,
    status: "published",
  },
];

const stmt = db.prepare("INSERT INTO post (slug, title, body, status) VALUES (?, ?, ?, ?)");

for (const post of posts) {
  stmt.run(post.slug, post.title, post.body, post.status);
}

console.log(`Seeded ${posts.length} posts from Fielding annotations.`);
db.close();
