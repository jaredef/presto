# Assets as Resources Within PRESTO

## Property

Hypermedia assets (images, files, media) are not a special category requiring new constraints. They are resources that fit existing PRESTO patterns at each level of the progressive model.

## Derivation

### Layer 0: Static Assets Are REST

An image has a URL. The client fetches it via HTTP GET. The server returns bytes with a Content-Type header. Cacheable, stateless, uniform interface. This is REST without extension.

An `<img src="/photo.jpg">` in the resolved representation is a client affordance. The client discovers the URL, follows it, renders the result. The server placed the reference in the representation. HATEOAS operating at the asset level.

### Bilateral Asset References

In the source representation, `<img src="{htx:post.image}">` is bilateral. The server resolves the data path. The client follows the resulting URL. The bilateral-to-unilateral transformation applies to asset references identically to text content.

### Protected Assets as Granted Capabilities

When an asset requires authentication, the URL carries a signed token. This is the same authority chain as channel tokens:

The server grants access to a specific asset for a specific duration. The client follows the signed URL. The server validates the signature. If expired or tampered, access is denied.

This is `htx:grant` applied to asset access. The grant is selective (specific asset), scoped (the URL path), time-limited (signature expires), and revocable (server can rotate the signing key).

### Asset Upload as Mutation

File upload is a write operation. It follows the same two-phase pattern as any mutation: the template declares the action, the form includes the signed token, the server verifies and stores.

### Binary Asset Delivery

Pushing binary assets to the client via WebSocket is the ephemeral delivery pattern from Layer 6. The connection opens, delivers the binary frame, closes. The same mechanism that delivers WASM modules delivers any binary asset.

## Emergent Property

No new constraint is required for assets. The progressive model already accounts for every asset interaction:

| Asset Operation | PRESTO Pattern | Level |
|---|---|---|
| Static file serving | REST resource | Layer 0 |
| Dynamic reference | Bilateral expression | htx:v |
| Protected access | Granted capability | htx:grant |
| Upload | Mutation | htx:action |
| Binary push | Ephemeral delivery | Layer 6 |
| Optimization | Operational (boot/on-demand) | Implementation |

The asset is a resource. The reference is an expression. The protection is a grant. The upload is a mutation. The delivery is ephemeral. Each maps to an existing pattern. The constraints already cover it.
