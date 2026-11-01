# Layout sharing, resource effects and serialization purity

Scope: `layout.reflow-sharing`, `compositing.effect-resources` and
`documents.serialization-purity`. No controls, dependencies or format changes.
`native_studio` remains excluded. Candidate on main baseline `5e317f4`;
full fixed-revision release and production receipts are pending below.

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
- Extended bitmap/mask/readiness regressions reproduced a remaining background-
  blur stale alpha cache before its separate resource-aware projection fix.

## Acceptance and remaining contexts

| Context | Assertions | Current evidence |
| --- | --- | --- |
| Layout | Frozen inputs, one-time normalization, unchanged refs, changed descendants, text boxWidth, exact zero, legacy metadata, Boolean transforms. | Seven targeted units |
| Serialization | Frozen/live/history inputs unchanged, detached output records, repeat-save layout identity. | Four targeted units; original red retained |
| Defaults | Mutable values/filter arrays, missing/extra/undefined fields, every JSON leaf, property order/inheritance. | Four targeted units |
| Effect resources | Projection lifecycle, fonts, bitmap/matte/warp readiness, renderer/pass flags, decoded source garbage collection, backdrop styles. | Fourteen targeted units |
| Actual editor | Six unrelated edits add zero static-effect alpha readbacks; 600x400 warm/cold equality; real nudge, Agent styles and keyboard history. | Targeted browser passed |
| Resource pixels | Engine-version and standalone draw modes x bitmap/mask/late bitmap x normal/blur/glass; updated pixels equal fresh-node cold pixels. | Eighteen targeted browser contexts passed |
| Full release / production | New clean fixed revision, complete gate and independent asset/interaction receipts. | Pending |
| Remaining | Physical hardware, signed desktop packages, every font/effect/animation/mask combination, global cache memory budget. | Partial; not certified |

## Measurement protocol

Diagnostic builds are private and never deployed. Final comparisons use
uninstrumented production builds on the same read-only desktop `test.fig`,
forward/reverse order, host load and every raw sample retained. Fifty API
geometry edits prepare history; eighteen subsequent arrow inputs and undo/redo
are actual keyboard operations. These script waits are not GPU FPS or physical
input-to-photon latency. Exact 1000x800 overview pixels do not certify every
property/page/font. Private file/decoded scenes remain outside Git and production.

Final fixed source, release, comparisons and publication evidence will be
recorded in the private `layout-sharing/` artifact and the progress entry.
