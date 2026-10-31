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

## Frame title pointer selection

Capability: `selection.frame-title-selection`. Scope: visible Frame labels on
a root canvas; nested Frames retain the existing outer-label visibility rule.

A real mouse click hit the title span, but the artboard's capture-phase body
handler captured the pointer on `editor-page` and cleared selection before the
title click could select its Frame. The previous label was a generic div, so
it was absent from the existing interactive-control exclusion. The label now
uses a native button, preserves its styling/hit area and invokes the same
`engine.selectExactly` operation. No additional selection implementation or
new default control is introduced.

| Acceptance context | Registered evidence |
| --- | --- |
| Real pointer routing | `frame-label-selection`: elementFromPoint hits the actual title; ordinary mouse click selects its Frame instead of losing the click to page capture |
| Zoom and title contents | Text and icon clicks at 0.5x, 1x and 2x select the same Frame |
| Nested ownership | A child starts selected; the visible outer label selects its parent Frame. Nested labels remain hidden under the existing policy |
| State integrity | Serialized document, artboard layout and camera are unchanged by selection |
| Prior selection | Clicking another title replaces an existing multiple selection with the target Frame |
| Accessibility | Native button focus plus Enter selects the same Frame through the normal click handler |
| Original failure | `/private/tmp/voo-license-regression/frame-label-before.log`: actual title span hit, `editor-page` pointer capture, empty selection |
| Verification boundary | Selection-only change; no content mutation/save format to migrate. Header dragging, touch/stylus and hidden/locked Frame policies are not expanded by this repair |

Clean revision `befffb37071baf1aa4c0cd3abf83452b092f650d` passed all 90 release
steps (86 browser suites; 4,585 unit assertions passed, four skipped).
Merge `49d85d8bd709b961c5f6be64ea5cd5dfad050f69` has the identical source tree.
The deployed production entry and five direct assets match the verified build;
an isolated production browser passed real name/icon clicks and Enter without
document mutation or page errors. Evidence: `/private/tmp/voo-license-regression/`
`frame-title-release-published.json` and `frame-title-production-proof.json`.
Earlier incomplete/failed runs and the known cold-start New timing failure are
retained in `docs/quality-progress.md`; passing this fixture does not certify
physical devices, signed desktop cold starts or all private workspace drafts.


## Agent selection context icon

Capability: `platform.agent-contracts`. A single selected Frame now uses the
same `IconFrame` as its canvas label. The chip previously always rendered
Layers despite the existing normalized `kind: "frame"` descriptor. Selection
snapshots, prompt payloads, chip labels and detach behavior are unchanged.
Ordinary groups/layers and multiple selections retain Layers. Legacy artboard
contexts use the Frame icon too; no new control or user-visible copy is added.

`agent_selection_context.test.js` checks rendered SVG identity for Frame,
artboard, ordinary group/layer and a multiple selection containing a Frame.
`agent-selection-context.e2e.mjs` uses a real editor to switch child → Frame →
child → multiple, checking actual chip SVGs, text, prompt preservation,
submitted target IDs, detach, deselect and document switching. The original
Frame SVG assertion fails before the fix (`agent-frame-icon-before.log`).
This standalone suite is run explicitly; its other standalone classification
and the 86-suite core inventory remain unchanged. Release evidence and exact
revision are recorded in `docs/quality-progress.md`; signed native installs,
physical input devices and all imported node variants are not certified.

Verified clean revision: `bfbf91d040eebc3e1254f03c017fcc8f44677b6a`; all 90
core steps passed (4,590 units passed, four skipped; 86 browser suites), plus
explicit `agent-selection-context`. Production entry/direct/Agent assets
(seven files) match the build; real Agent chip switching and detach pass with
no document mutation or page errors. Evidence: `agent-frame-release.json`,
`agent-frame-icon-committed.log` and `agent-frame-production-proof.json` in
`/private/tmp/voo-license-regression/`. Signed native installation remains untested.


## Single Agent suggestion group

Capability: `platform.agent-contracts`. The private App workspace had two
`AgentSelectionSuggestions` instances, one inside the conversation scroll
region and an extra one before the composer. Only the extra local instance
was removed; other uncommitted localization, attachments and mobile changes
were preserved. Public product source already had one instance and was not
changed in this task. No document mutation or persistence migration is involved.

`agent-suggestions.e2e.mjs` now asserts exactly one group with three buttons,
and one instance of each Frame label at 380px and 760px. Existing checks retain
actual clicks, selection-type changes, input focus, draft preservation,
idempotent repeated picks, detach and no automatic sending. Before the local
repair the explicit count was two; afterward both local and public-baseline
fixtures passed. Relevant units: 14 local, 25 public-baseline including module
plans. Exact release evidence is maintained in `docs/quality-progress.md`.
Production still uses `bfbf91d`; all seven previously verified assets match,
with a single Frame suggestion group and no document mutation or script errors.
Raw logs are `/private/tmp/voo-license-regression/agent-suggestions-*`.
The local repair is not a clean-release certification of other private drafts,
native signed installation or physical touch devices.

Clean `aec278290c69990105c36b13cdd05420f7e5d24e` passed 90/90 core steps,
4,590 units (four skipped), 86 core browser suites, and the explicit suggestion
suite. After preserving upstream prompt commit `0274622`, integrated `3d98a78`
passed 51 related units and the suggestion browser suite; it does not inherit
the prior complete run. This task publishes regression/ownership/docs only.
The later rebuilt entry differs from current production; the failed comparison
is retained, not reported as byte identity. Current live single-row UI evidence
is recorded separately in `agent-suggestions-live-ui-proof.json`.


## Global overlay stacking

Capability: `inspector.global-overlay-stacking`; shared with workspace title
menus and platform sharing. A real share popover was partially covered by the
editor's root z-50 stacking context. Its left-side pointer samples hit
`editor-pages` instead of the share surface (`global-overlay-before.log`).

The title bar owns a z-60 layer above editor content. Sharing uses a body portal
at z-100, anchored to its trigger with viewport bounds and internal scrolling.
Nested mobile sharing retains the existing popover ownership context so input
inside its portal does not dismiss the parent menu. Global modal content uses
body portals at z-110 or its existing higher layer; pending lazy surfaces also
escape editor transforms and clipping. Portal content retains server-rendered
semantics when there is no browser body.

| Surface group | Review and acceptance |
| --- | --- |
| Share | Real title-bar trigger, 1600/1280/900px, docked Agent, nine pointer samples, identity input and Escape; 320x568 nested More → Share stays inside viewport and remains open while typing |
| Title menus | Common title layer plus existing body workflow-menu portal; narrow More keyboard/focus and pointer hits retained |
| Shortcuts, icon insertion, SVG | Previously inline fixed dialogs now portal to body; real components mounted under a deliberately transformed 40px clipped host remain fully hittable, with dialog semantics retained in SSR |
| Lazy pending UI | Real suspended component's modal placeholder uses the same global portal and passes pointer samples outside its clipped host |
| Settings, image export, commands | Existing body portals retained; real UI entry, pointer sampling, layered Escape, focus return and existing export state checks pass in `ui-global-interaction` |
| Code export, variables, presentation export/viewer, font/menu pickers | Existing body portals reviewed in source; not all individual controls newly interaction-certified by this task |
| First-run, setup, recovery, About | Native top-layer dialog or application-level modal reviewed; existing individual suites retained, not counted as new exhaustive runtime coverage |
| Page-owned comments, retouch/download, prototype and exit prompt | Intentionally scoped to the page; not converted to unrelated application-wide dialogs |

`ui-global-interaction.e2e.mjs` asserts actual `elementFromPoint` hits across
surfaces and unchanged document/selection. The isolated modal harness tests
component placement, not every production opening command. No share-room
creation, snapshot upload, paid model, user document or collaboration session
is started by these checks. Exact clean revision, release and production
receipts are recorded in `docs/quality-progress.md`. Physical touch/stylus,
signed native installs, all popover combinations and every service state remain
outside this acceptance; a source audit alone is not a runtime pass.


### Welcome action readiness found during overlay acceptance

Capability: `workspace.file-actions-ready`. The cold-reopen import button was
clickable before the lazy welcome page registered its file input listeners.
The unmodified `24085cc` baseline reproduces the lost filechooser event too.
The welcome page now marks its UI-only readiness after its existing action
effects mount, and clears readiness on unmount. Desktop and narrow title-bar
Import/New wait for that signal; editing/export actions remain available.
This flag is not document content or a new user setting.

`titlebar-file-actions` holds the welcome module request, verifies both buttons
are disabled before registration, then releases it and retains the actual file
picker, cancellation, portable snapshot import/export and New assertions.
The original `continuous-creation` archive, geometry, bitmap pixels and undo
checks are retained. Raw before/after and baseline logs are under
`/private/tmp/voo-license-regression/global-overlay-*`. Earlier 15-second import
readiness and cold filechooser failures remain separate evidence, not passed
results. This repair does not certify every slow-device/native startup path.

The incoming Figma fidelity fixture initially sampled a zero-node placeholder
engine after a cold reopen. The diagnostic preserves that failure and shows
the exact expected pixels once the imported document binds. Its picker helper
now waits for the imported document marker and the normal open guard to turn
off before exporting pixels; it does not wait for pixel values to match or
change any pixel assertions. Evidence: `global-overlay-figma-engine-probe.log`.
