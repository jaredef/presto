# Island Compatibility: What Mounts and What Doesn't

## The React Three Fiber Finding

During the development of the island showcase, we encountered the first case where a React ecosystem package failed to render inside the island protocol: React Three Fiber (R3F).

The symptoms: the bundle compiled (1,390 KB), the island mounted, the `Canvas` component initialized — but the WebGL context produced a black screen. Raw WebGL on the same page, using the same browser and the same GPU, rendered correctly. The identical torus geometry with the same shaders worked in the presto-c demo. The failure was specific to R3F operating inside the island mount.

### What We Tested

We built a diagnostic page with three rendering paths:

1. **Direct mount** — R3F's `Canvas` mounted directly into a div via `createRoot`, bypassing the island protocol. **Black screen.**
2. **Island protocol** — R3F mounted via `defineIsland()` + `island.htx`. **Black screen.**
3. **Raw WebGL** — The same torus geometry rendered with pure WebGL1 shaders. **Rendered correctly.**

Test 3 proving that WebGL works on the device eliminated hardware and tunnel as causes. Tests 1 and 2 both failing eliminated the island protocol as the cause — the issue is R3F itself.

### The Likely Cause

React Three Fiber v9 has specific requirements that may conflict with how the island environment initializes:

**WebGL2 context requirements.** R3F v9 defaults to requesting a WebGL2 context. While modern browsers support WebGL2, the context creation may fail silently in certain conditions — particularly when the Canvas is not yet visible in the viewport, when the containing element has zero computed dimensions at mount time, or when the GPU context is constrained by multiple simultaneous canvases.

**Bun bundler compatibility.** R3F depends on Three.js, which uses dynamic imports and conditional requires extensively. Bun's bundler handles these differently than webpack or Vite. The 1,390 KB bundle compiled without errors, but runtime behavior may differ from what R3F expects — particularly around Three.js's internal module resolution for shader chunks and geometry generators.

**Fiber reconciler initialization.** R3F uses a custom React reconciler (not ReactDOM) that manages a Three.js scene graph. The reconciler expects specific timing guarantees about when the Canvas element is available in the DOM and when the WebGL context is created. The island mount sequence — where the div exists in the DOM but React mounts asynchronously after the bundle loads — may violate these timing assumptions.

**CSS dimension inheritance.** R3F's Canvas component determines its size from its parent element's computed dimensions. In the island protocol, the mount element is created by the `island.htx` component and may not have explicit dimensions until the CSS is fully computed. If the Canvas reads `0x0` during initialization, the WebGL viewport is zero-sized and all rendering is clipped.

### The Resolution

We replaced the R3F island with pure WebGL1 code — the same torus geometry and shaders that the presto-c engine demo uses. The result:

| | React Three Fiber | Pure WebGL |
|---|---|---|
| Bundle size | 1,390 KB | 5 KB |
| WebGL version | WebGL2 (required) | WebGL1 (universal) |
| Dependencies | react, react-dom, three, @react-three/fiber, @react-three/drei | None |
| Renders in island | No | Yes |
| Framework required | React + custom reconciler | None |

The pure WebGL approach is 278x smaller, universally compatible, and renders correctly in the island protocol. It uses the same shader pipeline, the same geometry, and produces the same visual — an indigo torus with rim lighting and mouse-influenced rotation.

### What This Teaches

The island interface works with **any code that mounts into a DOM element**. It does not require React. The `defineIsland()` protocol calls `mount(el, props)` — what happens inside that function is the island author's concern. A Vue app, a Svelte form, a raw WebGL scene, and a React component all use the same protocol.

However, not all React packages are equally suited to island mounting. The packages that work well share these characteristics:

**Works well as an island:**
- Components that render into a standard DOM tree (React Query, Recharts, TipTap, dnd-kit)
- Components that accept dimensions via props or CSS rather than computing them from the DOM at mount time
- Components that use ReactDOM's standard reconciler
- Components that don't require specific bundler plugins or loader configurations

**May have issues as an island:**
- Components that use custom React reconcilers (React Three Fiber, react-pdf with canvas rendering)
- Components that require WebGL2 and specific context initialization timing
- Components that compute their own dimensions by measuring the DOM during the React commit phase
- Components that depend on bundler-specific features (webpack's require.context, Vite's import.meta.glob)

**Always works as an island:**
- Any code that uses the DOM API directly (raw WebGL, vanilla JS, Web Components)
- Any framework with a `mount(element)` API (Vue's `createApp().mount()`, Lit, Alpine)
- Any code that doesn't depend on React at all

### The Broader Principle

The R3F finding reinforces the encapsulation model rather than weakening it. The island interface is not a React compatibility layer — it is a DOM mounting protocol. React happens to be the most common use case because the React ecosystem has the most packages. But the protocol works for anything:

```typescript
defineIsland({
  name: "my-island",
  mount(el, props) {
    // React: createRoot(el).render(<Component />)
    // Vue: createApp(Component).mount(el)
    // Svelte: new Component({ target: el })
    // Lit: el.appendChild(document.createElement('my-element'))
    // Raw: el.innerHTML = renderToString(props)
    // WebGL: el.appendChild(canvas); startRenderLoop()
    // Anything that writes to a DOM element
  },
});
```

When a specific React package doesn't work in the island environment, the solution is not to fix the island protocol — it is to find the correct implementation depth for that capability. React Three Fiber abstracts WebGL through two layers (React reconciler → Three.js → WebGL). The island environment adds a third layer (PRESTO mount → React → R3F → Three.js → WebGL). Four layers of abstraction between the developer's intent and the GPU.

Pure WebGL removes all intermediate layers. The developer's intent reaches the GPU through one layer: the shader program. The result is smaller (5 KB vs 1,390 KB), faster, more compatible, and visually identical.

This is the constraint depth principle applied to a specific technical decision. The question is not "can I use R3F in an island?" but "what is the shallowest depth at which this 3D scene can exist?" For a rotating torus with rim lighting, pure WebGL is the correct depth. R3F's additional constraints (React reconciler, Three.js scene graph, component lifecycle) provide no benefit for this scene. They add 1,385 KB of code and introduce compatibility issues — for a feature that 100 lines of WebGL handles directly.

For a complex 3D application with dynamic scene composition, physics, and interactive object manipulation, R3F's abstractions earn their cost. The island protocol would work for such an application if the R3F initialization timing issues are resolved — which may require mounting into a pre-sized, visible container rather than an initially-empty island div.

### Recommendations for Island Authors

1. **Test the island independently.** Before using the `defineIsland()` protocol, verify the component renders when mounted directly into a div via `createRoot`. If it fails there, the issue is not the protocol.

2. **Ensure explicit dimensions.** If the component computes its size from the parent, set explicit `width` and `height` on the mount element in the `mount()` function before rendering.

3. **Prefer WebGL1 over WebGL2 for 3D.** Unless the scene requires WebGL2 features (compute shaders, transform feedback), WebGL1 is universally supported and avoids context creation issues.

4. **Consider the abstraction cost.** A React wrapper around a non-React library (R3F wrapping Three.js, react-leaflet wrapping Leaflet) adds the React runtime to the bundle. If the wrapper's abstractions aren't needed, using the underlying library directly produces a smaller, more compatible island.

5. **The protocol is the DOM, not React.** `defineIsland()` calls `mount(el, props)`. What you do with `el` is unconstrained. Use whatever rendering approach matches the feature's actual depth.
