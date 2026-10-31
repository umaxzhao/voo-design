# Continuous creation acceptance

Maintained scope: `selection.continuous-creation`. This is a real UI workflow
across modules, not a claim that every editor feature or every device works.
Execution belongs to the exact revision in `docs/quality-progress.md` and the
release JSON. Initial audit: 2026-10-31.

## Method

`tests/e2e/continuous-creation.e2e.mjs` starts at the actual welcome screen,
clicks New and retains its default root Frame. Only the initial camera is set
programmatically. From there, real pointer/keyboard events, inspector fields,
context menus, the file chooser and project export create the document. Engine
calls observe state, pixels and export results; they do not repair or replace
the scene between steps. A second isolated browser opens the downloaded ZIP
through Import, without retaining the first browser's asset database.

The generated image is a local blue PNG, not paid generation. The test uses
Chromium with desktop input and actual Canvas rendering. It does not use the
user's project, current browser tab or localhost storage.

## Confirmed failures and regression contracts

| Capability / operation | Before repair | Registered assertions |
| --- | --- | --- |
| `selection.shortcuts`: R/O taps | Previously active shape won over the named shortcut | Alternate Rectangle/Ellipse with both held and rapid taps; actual radial hover still overrides the key default |
| `layers.nesting`: group inside Frame | New group escaped to the root | Shared parent retained by the common group operation; original Frame remains after ungroup |
| `selection.transforms`: drag new group | Leaves stayed selected and could move/reparent separately | Newly created group becomes the movement unit; real drag, then ungroup retains contents and ancestry |
| `layers.nesting`: ungroup a leaf selection | Outermost ancestor Frame could be dissolved | Use current container selection unit, preserve ancestor Frames, refuse locked containers and loose Frame children |
| `selection.cancel`: cancel drawing | Escape followed by release still published the Frame | Real Escape during Frame/rect/ellipse/text drawing restores document, selection and history; existing redo branch still works |
| `text.edit`: initial ink on a white Frame | White text existed in data but was invisible after editing | New interactive text chooses contrasting ink for solid Frame surfaces; assert rendered dark pixels, text content and one-step undo/redo |

Before-fix logs are retained locally under `/private/tmp/voo-creation-*before.log`.
The before/after unit reproducer for grouping is `voo-creation-group-before.log` /
`voo-creation-group-after.log`. Temporary evidence may be cleaned by the OS.

Pure transaction regressions in `drawing-cancellation.test.js` additionally
exercise arrow, star and polygon rollback, document/selection equality, no
commit and redo preservation. These are domain-level tests, not claims of
real pointer coverage for every drawing tool.

`nested-group-commands.test.js` covers shared parent, group selection, nearest
ungroup boundary, loose Frame children and locked containers.
`text-creation-fill.test.js` checks light/dark solid Frames, transparent child
fallback, explicit fill preservation and unchanged programmatic defaults.

## One-session acceptance matrix

| Axis | Actual checks |
| --- | --- |
| Entry points | Toolbar, R/O/F/T/V, modifier grouping/history, inspector W/H/X/Y, right-click image picker/mask, top-bar ZIP export/import |
| Document state | Nested ownership, kinds, geometry, group lifetime, path anchors, image/mask references and full-document history equality |
| Visible result | Real text ink; blue image visible, ellipse clipping changes outside pixels, release/undo restores the intended mask |
| Movement | Object drag, group drag, populated Frame with all descendants, Space camera pan without document mutation |
| Editing | Text entry, double-click vector path, actual anchor drag, then undo |
| History | Text placement, duplication, deletion, mask release, path editing and reopened image nudge; redo preserved across cancelled drafts |
| Persistence | Same IDs/text/geometry/path/parent/mask data after cold ZIP reopening; exact selected-Frame PNG pixel hash matches |
| Failure/cancel | Escape for four live draft types; seven pure drawing transaction variants; existing redo branch remains usable |
| Platform/performance | Isolated desktop Chromium. Diagnostic EventTiming/rAF observations include automation/readback and are not hardware FPS, input-to-presentation latency or competitor parity measurements |

`creation-session-fixture.mjs` retains incremental JSON and completed/failure
screenshots in `VOO_CREATION_AUDIT_DIR`, defaulting to the OS temporary directory
plus `voo-continuous-creation`. The complete release verifier records execution
of this suite alongside related module regressions.

## Remaining scope

- Physical IME, touch/stylus, OS shortcuts and native chooser behavior need
  actual-device acceptance; the Chromium path cannot certify them.
- Contrast selection covers initial interactive text on solid Frame/page
  surfaces. Arbitrary images, gradients, translucent composites and later
  background changes are not automatic text recoloring or contrast certification.
- Drawing cancellation is covered here for the declared tools, not all paint,
  lasso, crop, pen-draft, transform or async publication cancellation paths.
- Mixed-parent grouping, simultaneous ancestor/descendant selections, all
  isolation combinations and arbitrary nested masks need expanded cases.
- This small scene does not establish large-document fluidity. Hardware FPS,
  memory and long-duration interaction workloads remain separate checks.
- The 21 standalone checks in the catalog retain their separate/not-run status;
  this new core suite does not silently close those gaps.

## Text placement and close boundaries

Capability: `text.placement-transactions`. The follow-up
`text-creation-boundaries.e2e.mjs` exercises six scenarios with actual pointer
text placement, typing, Escape, toolbar clicks and double-click existing text.
Its last scenario explicitly uses the public engine tool-switch API, not a
claimed physical click. Controlled scenes include a genuine undo future so
no-op edits must preserve redo rather than merely leave the same node count.

Confirmed failures were abandoned empty text creating a history entry,
untouched text edits truncating redo and the live pointer completion path
omitting the placement callback exercised by the old helper-only unit test.
The placement helper now owns both the live dispatcher and compatibility
helper. Empty drafts roll back, populated edits commit once, and unchanged
edits still notify the view so their textarea actually closes without a
spurious document change.

Assertions include document equality, unchanged history/redo for empty and
no-change sessions, DOM overlay disappearance, temporary text restored to its
original value, one-step typed-text undo/redo and no-argument tool API closure.
`text_placement_history.test.js` now exercises the actual finish dispatcher;
its direct annotation checks separately verify unchanged updates, no-argument
commits, deliberate emptying and returning to the original content.

`drawing-cancellation.test.js` additionally verifies preservation of an
intervening sibling edit and release of a child of a cancelled Frame. These
are pure domain tests, not claims of a live collaborative browser session.
Cancellation removes only the owned draft when another document change has
arrived, rather than replacing the entire current document with an old copy.

Remaining: true OS IME composition, cross-client concurrent history, async
same-node style changes and native-window teardown still need their own
acceptance. Closing an untouched nonempty existing text preserves history;
intentionally emptying existing text remains an undoable deletion.

## Converted line/arrow representation boundary

The full gate exposed a latent render failure in `canvas-double-click` while
closing/repainting converted strokes. A parallel reproduction retained the
browser stack: `absolutePathEndpoints` -> `drawSelection` -> workspace chrome.
Converted lines/arrows keep their style flags, but their pen anchors are
objects rather than primitive `[x, y]` pairs. Primitive endpoint chrome and
dragging must reject pen/object-point data, or rendering can throw and endpoint
movement can replace the wrong point representation.

`path-endpoint-representation.test.js` retained three failing-before cases and
a valid primitive case. The existing browser suite now explicitly paints
chrome on converted strokes before finishing/undoing. Browser fixtures retain
error stacks instead of only the exception message. This is part of
`vectors.path-edit` and its related selection suite, not a new feature or a
claim of complete vector coverage. The first full-gate runtime import omission
and this second gate failure remain recorded in the progress evidence; neither
failed revision was deployed.
