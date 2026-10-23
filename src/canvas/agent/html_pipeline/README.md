The HTML pipeline uses the agent's existing model transport and native layout
creation helpers. It is selected for explicit new page/screen requests on an
empty or nearly empty canvas when design quality is enabled. Pass
`htmlPipeline: false` to `runAgentTurn` to keep the tool loop.

`runHtmlPipeline` accepts a frame in `{width, height, x?, y?}` pixels and emits
`{stage, status}` progress events. `chooseDirection(directions, {signal})` returns
an ID or `auto`. The panel waits up to 15 seconds; headless callers default to
the first direction. No HTML preview UI is needed: snapshots update native nodes
on the canvas, within one history batch including tokens and repairs.

The iframe is sandboxed without scripts and enforces an offline CSP. Native
conversion supports painted boxes, typography, basic SVG paths, and linear
CSS gradients. More complex SVGs use a placeholder rectangle. CSS effects
outside these native properties (filters, transforms, pseudo-elements, complex
clipping) are not reproduced; prefer ordinary boxes and inline elements.

Image slots remain placeholders unless an image provider/model is configured
and automatic generation is allowed by the existing image confirmation setting.
An optional `config.htmlImageGenerator({prompt, signal})` can instead return
native image properties. At most four slots are requested, with a 20 second
overall deadline. The existing image provider is reused and downloaded results
are embedded as data URLs. Benchmarks skip images unless
`VOO_DESIGN_BENCH_IMAGES=1`.

`VOO_DESIGN_BENCH_FRAMES_DIR=/path` makes the benchmark runner save real canvas
PNG captures every two seconds as `<task-id>-000.png`, `-001.png`, etc. Direction
selection in benchmarks is automatic. No browser is needed for the unit suite;
DOM tests use Vitest's jsdom environment and stubbed geometry.
