# Layout sharing, resource effects and serialization purity

Scope: `layout.reflow-sharing`, `compositing.effect-resources` and
`documents.serialization-purity`. No controls, dependencies or format changes.
`native_studio` remains excluded. Verified source `ba1a1cd9f22bbb643d7ce3aef6658f8d4c56a2a9` on main
baseline `5e317f4`. Later documentation commits do not extend source coverage.

## Causes and implementation

Private instrumentation of the original `test.fig` on baseline `882cd2a`
traces 169 inner-shadow nodes. Eighteen real arrow edits give every effected
node eighteen projection identities/misses. Most use a single inner shadow;
multi-effect replacement is not established as this file's main cause.

`reflowAutoLayout` copied every node when any group had Auto Layout. Existing
scratch layout calculations and Boolean reconciliation remain unchanged. The
output reuses a normalized incoming node only when x/y/width/height/boxWidth
and own-field presence match exactly, including signed zero. New or externally
imported records are copied once and marked in a WeakSet before reuse. Real
geometry changes still produce new records and descendant transforms.

The text/layout measurement loop can now stop after one pass when neither
text geometry nor layout changes the document. Previously every API edit
performed at least two whole-page layout passes. A changed fill width still
continues to remeasure wrapped text; changed font metrics still update hugging
parents. Three convergence regressions cover these distinct cases.

Sharing also exposed resource invalidation requirements. Effect projections
now use actual decoded bitmap/matte identity, CPU pixel mutation counters,
warp versions, renderer identity, font readiness and render-pass flags.
Stored generation keys contain weakly assigned numeric IDs, never decoded
resource objects. Unknown paints/video/Boolean silhouettes conservatively
retry. Background blur and glass retain their existing body opacity/blend
while gaining the same resource invalidation; their stale alpha cache was
reproduced against exact cold pixels before fixing it. One current projection
per immutable node is retained. The existing one-bitmap-per-effect-node
replacement policy and rasterization algorithms remain unchanged.

`serialiseDocument` formerly received live ordinary nodes from
`serializeCanvasNode` and then deleted blob/default fields on those live nodes.
It now strips fields on detached top-level output records. This preserves
current/history inputs and avoids turning shared records into dictionary-like
objects during saved/dirty checks. Output nested values are not deep-cloned.
The default-adjustment matcher compiles the read-only baseline structure once,
but reads every current input value on every call: mutable inputs are never
memoized. Tests mutate every JSON leaf and compare with structural equality.

## Retained failures and discarded candidates

- Original sharing units: three failed identity assertions; actual editor also
  failed stable effected-node identity. Original serialization failed all four
  purity regressions. Original live bitmap effects failed cold-pixel equality.
- A static-only sharing prototype removed static readbacks, but actual edit
  median rose from 542.5 to 655.5ms in diagnostic builds. A generic document-
  version resource key prototype reached 709ms and was discarded. Neither
  diagnostic result is a final uninstrumented performance claim.
- Private V8 probes demonstrated the live serialization mutation's object-shape
  cost. Early attribution to spatial indexing alone was not established.
- The pure-serialization pilot without a compiled default matcher measured
  557.5ms actual-key median, without stable whole-operation improvement. All
  pilots, raw samples, CPU profiles and startup/format failures remain retained.
- Candidate `d39511d` passed a clean 105/105 core gate (4810 units / four
  skipped, 101 browser suites). Forward/reverse real keys improved
  551.5->508.5ms and 539->519.5ms with exact pixels, but fifty synchronous API
  edits regressed 1689.6->2474.2ms and 1681.8->2389.4ms. This was not deployed.
  API CPU profiles placed ~478ms in the new identity comparison; the redundant
  second layout pass also repeated scratch copying. The convergence fix needs
  its own fresh full gate and measurements; the earlier pass is not inherited.
  An identity-only early-exit pilot still took 2414.7ms for API setup: incoming
  patch normalization also changes identity. Exact geometry comparison now
  separates normalization from real layout changes; its pilot took 1214.7ms
  for API setup and 489ms median for real keys. Neither pilot replaces the
  final forward/reverse fixed-source measurements.
- Extended bitmap/mask/readiness regressions reproduced a remaining background-
  blur stale alpha cache before its separate resource-aware projection fix.

## Acceptance and remaining contexts

| Context | Assertions | Current evidence |
| --- | --- | --- |
| Layout | Frozen inputs, one-time normalization, unchanged refs, changed descendants, text boxWidth, exact zero, legacy metadata, Boolean transforms. | Seven targeted units |
| Convergence | One settled pass; changed fill width still remeasures wrapped height; forced font metrics retain exact hug sizing. | Three targeted units; original extra-pass assertion fails |
| Serialization | Frozen/live/history inputs unchanged, detached output records, repeat-save layout identity. | Four targeted units; original red retained |
| Defaults | Mutable values/filter arrays, missing/extra/undefined fields, every JSON leaf, property order/inheritance. | Four targeted units |
| Effect resources | Projection lifecycle, fonts, bitmap/matte/warp readiness, renderer/pass flags, decoded source garbage collection, backdrop styles. | Fourteen targeted units |
| Actual editor | Six unrelated edits add zero static-effect alpha readbacks; 600x400 warm/cold equality; real nudge, Agent styles and keyboard history. | Targeted browser passed |
| Resource pixels | Engine-version and standalone draw modes x bitmap/mask/late bitmap x normal/blur/glass; updated pixels equal fresh-node cold pixels. | Eighteen targeted browser contexts passed |
| Full release | Clean ba1a1cd: 105/105 steps, 101 core browser suites, 4813 units passed / four skipped, 1445 design files; all 12 modules remain functionally partial. | Passed; eleven standalone checks not run |
| Production | Independent deployed-byte and interaction receipts in the private artifact below. | Separate publication evidence; not inherited from the core gate |
| Remaining | Physical hardware, signed desktop packages, every font/effect/animation/mask combination, global cache memory budget. | Partial; not certified |

## Measurement protocol

Diagnostic builds are private and never deployed. Final comparisons use
uninstrumented production builds on the same read-only desktop `test.fig`,
forward/reverse order, host load and every raw sample retained. Fifty API
geometry edits prepare history; eighteen subsequent arrow inputs and undo/redo
are actual keyboard operations. These script waits are not GPU FPS or physical
input-to-photon latency. Exact 1000x800 overview pixels do not certify every
property/page/font. Private file/decoded scenes remain outside Git and production.

All five decoded pages (56422 nodes) match the prior VOO reflow and serialized
values on final ba1a1cd, including one representative resize per page and
unchanged inputs. All settled node identities are retained. This is value
equivalence against VOO, not full Figma-property fidelity.

## Final fixed-source measurements

Fresh production order: before, after, after-reverse, before-reverse. Source is
`5e317f410f197b45e90db6616edc190c4068a797` versus ba1a1cd. Apple M4 Pro,
Chromium 156 Metal, 1440x1000/DPR1, external font/network requests blocked;
shared host load and every raw sample remain in the receipts.

| Observation | Forward before -> after | Reverse before -> after |
| --- | --- | --- |
| Fifty synchronous API edits | 1661.1 -> 1269.1ms | 1647.0 -> 1253.9ms |
| Eighteen real arrow inputs, median | 540.5 -> 508.5ms | 523.5 -> 528.5ms |
| Same inputs, mean | 555.8 -> 504.8ms | 554.3 -> 511.4ms |
| Same inputs, nearest-rank P95 | 700 -> 674ms | 766 -> 700ms |
| Exact 1000x800 viewport difference | 0 pixels | 0 pixels |

API batch time falls 23.6/23.9%. Key means improve 9.2/7.7%, but median
improvement is not stable; do not advertise a stable whole-key latency gain.
Import retains all five pages, 56422 nodes and 478 assets (247642346 bytes),
with no unsubscribed chunks. Selection, keyboard undo/redo and geometry remain
correct; original file SHA-256 remains
`ddf80a00291c5c79ebc30c9b71c7c4180a74ca80311a170ed16f2aeed006b2c2`.
Full-document dirty-state serialization and exact artwork work remain hotspots.

Private `layout-sharing/` retains the full gate, final comparisons, every
superseded result, CPU profiles, exact pixels, scripts and independent GitHub /
publication receipts. The source gate is not a certification of every Figma
property, desktop package, physical input device, animation or global memory
budget. Original `.fig` and decoded scene payloads are not in Git or production.
