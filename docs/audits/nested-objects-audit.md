# Canvas and nested-object interaction audit

This is a coverage contract, not an assertion that every possible interaction has been certified. Run the release script on the exact clean revision; its JSON report is the execution evidence.

## Scope and checks

| Area | Real-browser evidence | Assertions |
| --- | --- | --- |
| Placement through the file picker | `nested-placement.e2e.mjs` | PNG and editable SVG enter the visible inner Frame at the context-menu location; pixels, ownership, one-step undo/redo |
| Native browser clipboard | `nested-placement.e2e.mjs` | PNG and SVG paste into the selected Frame; internal copied layers change destination without foreign parent or clipping references |
| File drop | `nested-placement.e2e.mjs` | A DataTransfer File drop goes through actual decoding and insertion with the pointer location and inner-Frame ownership |
| Drawing | `nested-placement.e2e.mjs` | Pointer-created rectangles, ellipses, Frames, typed text boxes and pen anchors become children of the correct Frame |
| Frame targeting and selection | `nested-placement.e2e.mjs`, `nested-frame-targets.test.js` | Frontmost overlapping Frame wins; clipped-out and rounded corner regions do not capture invisible objects; default visibility is retained |
| Mixed nested contents | `nested-object-lifecycle.e2e.mjs` | Frame → Frame → Group containing rect/ellipse/path/text/image moves as one unit with exact descendant coordinates, pixels and history |
| Clipboard duplication | `nested-object-lifecycle.e2e.mjs`, `nested-layer-paste.test.js` | Fresh IDs, complete subtrees, correct stacking blocks and remapped internal mask references; copying a root does not nest it into itself |
| Text editing | `nested-object-lifecycle.e2e.mjs` | Real double-click and typing edit only the text leaf and preserve its parent and history |
| Clipping masks | `nested-mask-lifecycle.e2e.mjs` | Create/release, duplicate, move and base deletion preserve expected alpha and undo; automatic mask creation does not cross Frame ownership |
| Masked Frame contents | `nested-mask-lifecycle.e2e.mjs` | Mask applies to the completed subtree, including nested mask chains and fractional opacity; Canvas, PNG and SVG agree |
| Mask-aware selection | `nested-mask-lifecycle.e2e.mjs`, `nested-object-lifecycle.e2e.mjs` | Masked-out pixels, erased image matte, hidden fill and zero-luminance masks do not intercept a visible canvas click |
| Layer tree reconciliation | `nested-mask-lifecycle.e2e.mjs`, `nested-mask-layer-tree.test.js` | A nested clipped layer renders once under its base; replacing a document removes old rows; invalid/cyclic mask links remain finite and visible |
| Artwork color sampling and exports | `layout-mask-audit.e2e.mjs`, `deferred-stage-sampling.test.js` | Actual Agent cursor/focus chrome cannot contaminate eyedropper, PNG/full-resolution/selection export pixels; the complete artwork surface retains spatial effects and page fill |
| Image matte editing | `nested-object-lifecycle.e2e.mjs` | Real brush erases the duplicate's mask while the original image/matte remains unchanged; one-step undo/redo |
| Locked deletion | `nested-object-lifecycle.e2e.mjs`, `nested-layer-deletion.test.js` | A locked selected unit is a complete no-op, including history/texture/mask references; an unlocked parent deletes its complete subtree, including locked descendants |
| Project persistence | `nested-project-roundtrip.e2e.mjs` | Actual ZIP download, new browser/database and actual import picker restore nested parents, clipping references, embedded bitmap and exact exported pixels; subsequent edits undo/redo |

Every new browser suite also checks parent existence, unique IDs and absence of hierarchy cycles where structural edits occur. Existing release suites continue to cover Frame edge resizing/constraints, negative world coordinates, Alt duplication, reparenting, Auto Layout, Boolean geometry, image exports, layer ordering/windowing and camera interaction.

## Confirmed defects addressed

- Drawing/placement used a different Frame-target policy from dragging: smallest area, omitted default visibility and missing ancestor clips could assign an invisible owner.
- Picker, clipboard and SVG/URL insertion could ignore the selected Frame or discard the context-menu position. Internal paste could retain the original parent and paint outside its destination block.
- Clipping-mask creation could choose a layer from another Frame or nested sibling subtree. Locked masks and no-op commands could still mutate state or add history.
- Deleting a Frame could leave locked descendants orphaned. A rejected locked-base deletion could still invalidate textures or release mask references.
- A mask on a Frame only masked its surface, leaving descendants outside the mask. Container alpha and SVG output needed the same complete-subtree rule.
- Hit testing could select content outside a Frame clip or in erased/clipped-out pixels.
- Nested clipped layers produced duplicate React keys, leaving stale rows after document replacement. The layer tree now assigns each row a single display owner.
- Legacy page sampling and offscreen exports could include animated Agent chrome instead of pure artwork, intermittently returning or saving a blended color. Sampling now uses a separate reusable artwork surface; export, layer-pass and preview painters explicitly omit chrome.

## Verification boundary

The fixtures use isolated Chromium canvases and generated local images. They do not modify the user's open document or call paid generation providers. File pickers and browser clipboard operations are real; the file-drop event is injected with real File bytes, not a Finder/Explorer operating-system drag. This audit does not certify every native desktop host, physical touch device, font installation or arbitrary third-party imported document.

## Container command boundaries

Capability: `layers.container-boundaries`. The maintained release evidence is
in `docs/quality-progress.md`; this section declares scope, not a historical
pass inherited by newer source.

| Operation | Confirmed previous failure | Regression |
| --- | --- | --- |
| Ungroup selected nested containers | Children inherited an ancestor ID that was removed in the same command | Resolve the complete dissolved ancestry; real shortcut, valid parent chain, visible pixels and full undo/redo |
| Group a Frame together with its selected descendant | The descendant was detached from the Frame | Deduplicate selected roots in the common domain operation; keep Frame subtree and initial wrapper bounds intact |
| Group children of different nested Frames | The folder escaped to document root despite a shared outer Frame | Find their nearest surviving common parent; assert ownership, both colors and history |
| Ungroup a clipping-mask container | Followers retained a missing `clipTo` base | Release that reference; assert actual clipped/unclipped pixels and one-step restoration |

`container-command-boundaries.e2e.mjs` uses controlled seeded documents and
initial selections, then actual keyboard commands. It does not claim that
seeded selections were produced by physical modifier clicks. Its four scenes
check state, hierarchy, pixels and complete undo/redo. The earlier continuous
creation suite separately verifies mouse multiselection and group dragging.

Pure regressions in `container-command-boundaries.test.js` check the same four
structural invariants. `nested-group-commands.test.js` adds the Frame-plus-leaf
no-op and Auto Layout wrapper measurement for selected subtree roots. An
initial hypothesis that cross-Frame paint ordering alone hid content was not
confirmed in Chromium; no stack-order rewrite was made on that assumption.

Remaining: translucent/transformed container flattening, arbitrary imported
hierarchies, mixed-owner masks during grouping, every isolation mode and
physical touch/stylus commands need additional acceptance. Dissolving a mask
base deliberately releases its followers; it does not flatten a replacement
mask image. Cold persistence of these four command-specific scenes is not
separately exhausted by this suite; portable nesting has its own release check.
