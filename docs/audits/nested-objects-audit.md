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
| Align/distribute selected containers and mask bases | Selected descendants inside a selected Frame moved twice, and clipped followers (`clipTo`) were left behind | Deduplicate `selectionUnits` via `groupingRoots` and move units via `moveAffectedIds`; assert single-delta child coordinates, mask-follower alignment, pixels and one-step undo/redo |
| Arrow-key nudge on selected Auto Layout groups | `nudgeSelection` moved only leaf children so Auto Layout immediately snapped them back to the unmoved group origin | Move `[selectedGroup]` when a group unit is selected; assert group + child coordinates and one-step undo/redo |
| Layer row selection and group duplication | Clicking a Boolean row called `selectGroup` (no-op), `unitSelectionIds` omitted nested Frames inside a Group, and Layer-panel folder duplication cleared `selectedGroupId` | Distinguish ordinary folders (`isFolderSelectionRow`) from Frames and Boolean layers, share `groupArtworkIds`, and select ordinary folders via `selectGroup` before duplicating |
| Boolean combine, destructive boolean, text-on-path, resized pen duplication & empty group deletion | `combineNodes` and `destructiveBoolean` dropped `parentId` to root and left cross-container/dangling `clipTo` or emptied folders; `typeOnSelectedPath` omitted `parentId` and called non-existent `selection.setIds`; `duplicateSelected` and `expandStrokeToPathNode` lost resized Pen scale; `deleteSelected`/`cutSelected` ignored empty selected groups | Deduplicate via `groupingRoots`, resolve `sharedGroupParent`, release invalid `clipTo`, prune empty groups, inherit `parentId` + call `selectNodes`, scale `points`/handles by `width / baseWidth`, and include `selectedUnitIds()` on delete/cut |
| Selected group Auto Layout toggle, empty group ungroup, component extract/detach inside Frames & `Enter` drill-down | `Shift+A` on a multi-child selected Group wrapped it in an extra Group instead of toggling `autoLayout`; `Cmd+Shift+G` ignored empty selected Groups; `extractComponent` and `detachInstance` dropped Frame `parentId`, left external `parentId`/`clipTo` on master nodes, and did not scale `path` geometry on resized instance detach; `Enter` checked `selected.kind === "pen"` and called non-existent `startEdit`, and ignored `getSelectedGroup()` | Resolve target container via `getSelectedGroup()` / single container root in `toggleAutoLayoutSelection` and `selectedContainerIds`, preserve `parentId` and scale `path` points in `extractComponent`/`detachInstance`, and route `Enter` to `enterGroup` for `getSelectedGroup()` and `beginEdit` for `kind === "path" && pen` |
| Layer stack reordering, Frame/mask block integrity, extreme moves, group paste selection & group flip | `engine.bringForward` / `engine.sendBackward` / `bringToFront` / `sendToBack` were missing on `engine`, causing `]` and `[` keyboard shortcuts to throw `TypeError`; reordering frames or mask bases in `reorderLayerBatch` only checked `isGroupNode`, separating Frames and clipping masks from their children/followers; `moveNodeToExtreme` allowed child layers to escape their parent Frame; pasting a copied group reset `selectedGroupId` to `null`; and flipping a group did not mirror child coordinates across the group box | Implement `bringForward`/`sendBackward`/`bringToFront`/`sendToBack` across `engine`, contextual taskbar, and context menu; use `moveAffectedIds` in `reorderLayerBatch` and `moveNodeToExtreme` to preserve Frame blocks, clipping masks, and parent boundaries; call `selectGroup` on single-group paste; and mirror child coordinates and invert flips across group bounds in `flipHorizontal`/`flipVertical` |

`container-command-boundaries.e2e.mjs` uses controlled seeded documents and
initial selections, then actual keyboard, alignment, and layer-panel actions.
It does not claim that seeded selections were produced by physical modifier
clicks. Its nine scenes check state, hierarchy, pixels and complete undo/redo.
The earlier continuous creation suite separately verifies mouse multiselection
and group dragging.

Pure regressions in `container-command-boundaries.test.js`,
`nested-group-commands.test.js`, and `editor-module-audit-regressions.test.js`
check the same structural and selection invariants, including Auto Layout
group nudging, nested Frame unit selection, and group duplication. An
initial hypothesis that cross-Frame paint ordering alone hid content was not
confirmed in Chromium; no stack-order rewrite was made on that assumption.

Remaining: translucent/transformed container flattening, arbitrary imported
hierarchies, mixed-owner masks during grouping, every isolation mode and
physical touch/stylus commands need additional acceptance. Dissolving a mask
base deliberately releases its followers; it does not flatten a replacement
mask image. Cold persistence of these four command-specific scenes is not
separately exhausted by this suite; portable nesting has its own release check.


## Selection size label placement

Capability: `compositing.selection-size-label`. The existing selection renderer
preferred the upper side even when the lower side was unobstructed. The size
chip now prefers the lower centre with the existing six-CSS-pixel gap; it falls
back above only when the stage bottom cannot accommodate its 18px height and
four-pixel margin. Existing horizontal and vertical clamping remain unchanged.
The numeric label, colours, handles and underlying document operations are unchanged.

| Context | Evidence |
| --- | --- |
| Reproduction | `size-label-before.log`: expected lower y=66, actual upper y=16 |
| Zoom, DPR and edges | `container_selection_chrome.test.js`: 0.5/1/2x, DPR 1/2, top edge and bottom fallback; 18px screen height and original dimension text |
| Real pointer selection | Existing `frame-label-selection` suite clicks the child in an actual editor before sampling chrome |
| Visible object, rotation and Frame | `selection-size-label-checks.mjs` reads actual screenshot pixels below the selected bounds and asserts the upper badge is absent at 0.5/1/2x and 30 degrees |
| Multi-selection | Preserves the existing no-size-chip policy; no unrelated new badge is introduced |
| Document and selection | Exact document and selected IDs retained after each visible-chrome check; this presentation path adds no document/history command |

The initial expanded browser check incorrectly assumed multi-selection already
had a size chip. Its failure is retained in `size-label-browser.log`; the
existing renderer was confirmed to draw only multi-selection outlines/handles.
The corrected scope preserves that behaviour (`size-label-browser-final.log`).
Core release and production receipts are pending in `docs/quality-progress.md`.
No physical display scaling, signed native builds or every clipping/overlay
combination is certified by these Chromium/unit scenarios.


## Comments shared right panel

Capability: `inspector.comments-panel-slot`; comments keep their existing
focused-document operations and deferred surface. The launcher is portalled
into the page-navigation row's stable host, immediately after the page name.
The host subscription follows unmount/remount; inactive editors cannot publish
a launcher. No second comment state or document mutation path is introduced.

Comments, cold loading and retry/error states use `PropertiesPanelShell` with
the property header omitted. The original property/instance/history render
branches yield while Comments owns the rail. Closing restores their existing
state, and the existing History event switches from Comments into History.
Compact canvases use the existing inspector shelf at readable full width,
with layers hidden only while Comments is open and 48px touch controls.

| Context | Acceptance |
| --- | --- |
| Position reproduction | `comments-panel-before.log` fails the original above-navigation launcher position |
| Single panel | SSR asserts one aside and no inner card; cold/warm browser assertions require one `editor-properties-panel` containing comment content and no hidden property W control |
| Desktop/compact | 1600/900/390px launcher adjacency, rail bounds, mobile touch close and original document/selection preservation |
| Mode replacement | Close restores properties/previous History; History's registered command replaces Comments without a second panel |
| Launcher lifecycle | Browser drawer unmounts the page host; returning produces exactly one launcher |
| Comment operations | Existing draft/thread/mode/panel Escape sequence, seen state, camera pins, draft/reply retention, create/reply and one-step undo, cold cancellation/unmount and error/retry remain exercised |

Before-fix source and local App backups are retained in
`/private/tmp/voo-license-regression/comments-panel-primary-backup/`.
Initial responsive fixtures lacked a touch context and queried hidden mobile
fields without `includeHidden`; those failed logs are retained separately from
`comments-panel-switching.log`. The initial SSR fixture expected an untranslated
key although the existing label helper intentionally falls back to `Comments`;
that failure remains in `comments-panel-unit-final.log`, with corrected 57-unit
results in `comments-panel-unit-verified.log`. No product assertion was relaxed.
Exact committed release, local App and production evidence are maintained in
`docs/quality-progress.md`; not every native install, physical device, canvas
type, panel placement or keyboard/service combination is certified here.


The first clean `826e9fd` core attempt passed 4,686 units (four skipped) but
stopped at `pages_dnd` because its direct-child button selector no longer
matched the navigation row. `comments-panel-release.json` preserves this failed
attempt. The suite now uses the explicit page-trigger marker, retaining all
rename, mouse/touch reorder, cancellation, focus, safe-area and tool-hit assertions;
its separate passing run is `comments-panel-pages.log`.
The final targeted 58 units (`comments-panel-unit-sides.log`) and comment suite
(`comments-panel-sides.log`) also cover the saved left/right inspector side and
page-menu dismissal when opening Comments. Full fixed-revision release results
are still pending; these independent runs are not a stitched release pass.


Clean `daea9ce` independently passed 91/91 release steps, all 87 browser suites
and 4,687 unit tests (four skipped), recorded in `comments-panel-release-fixed.json`.
A subsequent standalone-placement loading check exposed a remaining second
inspector in the pending facade (`comments-panel-mode-only-before.log`). Only
an explicitly open list now owns the rail; standalone loading uses its existing
launcher for progress, and failures retain retry/close outside the inspector.
Sixty related units and the actual palette-triggered cold mode/cancel/late-load
scenario pass in `comments-panel-mode-unit-final.log` and
`comments-panel-mode-browser.log`. Its final complete gate is recorded separately.
The extra focus-null exploratory fixture never entered its intended state and
timed out (`comments-panel-unfocused-before.log`); it was removed from the
registered suite, and is neither a product regression nor a passing acceptance.


Final clean `12b9aba` passed a fresh uninterrupted 91/91 core run, all 87 browser
suites and 4,689 units (four skipped), with matching GitHub CI success. Evidence:
`comments-panel-release-final.json` and `comments-panel-final-ci.json`.
Main had the identical tree before the documentation receipt. The project script
deployed that verified build to la2. Production matched 87 entry/loaded script
and style resources byte-for-byte, and passed launcher adjacency, both cold
activation paths, one rail and nine-point hit tests, draft cancellation,
previous-history restore, mobile touch close and unchanged document/selection
with no page errors (`comments-panel-production-proof.json`). No comment was
posted, room joined or existing user project changed by these isolated checks.
