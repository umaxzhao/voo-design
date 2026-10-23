# HTML import fidelity fixtures

Run unit coverage with `npx vitest run tests/unit/html2nodes.test.js --maxWorkers=2 --minWorkers=1`.

Run visual coverage with `flock /tmp/voo-e2e.lock node tests/e2e/html2nodes.e2e.mjs`.
This starts and closes its own Vite server and Chromium instance, compiles fixture
Tailwind utilities locally (no CDN), and renders imported nodes with the production
Canvas2D node dispatcher. Images are decoded before rendering. Each fixture gets
`*-html.png`, `*-canvas.png`, and `*-diff.png` in
`/workspace/tmp/shots-html2nodes/`, plus a machine-readable `report.json`.
`HTML2NODES_SHOTS` overrides the artifact directory; use `/tmp/shots-html2nodes`
when the sandbox prevents writing to `/workspace/tmp`.

A pixel differs when any RGB channel differs by more than 16/255. The test reports
the percentage of differing pixels and mean absolute RGB error as a percentage of
255. Every fixture must have less than 1% differing pixels. The comparison uses
320×200 pixels at DPR 1 and the installed browser/fonts, so antialiasing can vary
across hosts. Structural assertions also require auto-layout, SVG paths and images.

Browser import resolves CSS (including supplied compiled Tailwind styles) in an
isolated shadow tree. It does not fetch a Tailwind CDN script. The pure AST fallback
supports inline styles and does not evaluate stylesheets or utility classes.
Flex/grid containers become editable native auto-layout groups with fixed measured
sizes. Grid becomes wrapped horizontal layout; CSS track spans, unequal track
constraints, reverse flow and stretch-on-resize have no exact equivalent in the
native layout model. Initial browser-measured geometry is retained. Container
opacity is multiplied into descendant paints and emits `html-opacity-flattened`;
overlapping descendants cannot reproduce isolated CSS group compositing exactly.
Elliptical radial gradients emit `unsupported-gradient:elliptical-radial` and
use a circular approximation. Elliptical radii currently use the model's circular corner representation.
