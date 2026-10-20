# @voo/canvas-core

The Skia scene renderer, extracted from voo-canvas so the VOO.run editor can
draw through the same engine instead of growing a second one.

One `<canvas>`, one Skia surface, the whole scene in a single pass under a
viewport transform. Artboards are `frame` elements in that scene rather than
canvases of their own, which is what makes "how many pages are open" stop
being a question the renderer has to answer.

## What is in here

Everything the painter needs at runtime and nothing else: the renderer, the
scene model and its geometry, clip elision, the resource and font managers,
CanvasKit loading, text layout through Skia's Paragraph API, and the vector
work (pen paths, boolean and polygon operations, stroke styles).

Deliberately left behind: voo-canvas's scene adapter — each consumer maps its
own document model onto `SceneElement[]` — along with its plugin system and
provider catalogue.

## Provenance

Copied from voo-canvas rather than moved, so that repository is untouched and
keeps working. De-duplication, where voo-canvas imports this package instead
of its own copy, is a later step.

Two seams were cut by hand and are the places to look first if the two drift:

- `lib/ai-node-layout.ts` — four layout numbers lifted out of
  `ai-node-parity.ts`, which is otherwise a provider catalogue.
- `lib/external-types.ts` — `BlendMode`, `EffectBlendMode`, `DepthEffect` and
  `StrokeArrowhead`, copied verbatim from `store/node-store.ts`. That module is
  the application's central store and reaches most of the app; these three
  declarations are all the painter wanted from it.

## Building

    npm install && npm run build

Emits ESM plus declarations to `dist/`. Imports are extensionless, as written
for a bundler — consume it through Vite, Next or esbuild rather than Node's
own ESM resolver.
