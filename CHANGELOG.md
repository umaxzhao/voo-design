# Changelog

## 1.0.0

- Keep canvas context menus inside the viewport with scrollable actions, including narrow layouts.
- Stage image/SVG file batches before one atomic undo entry; preserve edits and tool choices made during decoding, and report import failures accurately.
- Retain a Codex built-in generated photo and release checks for real file pickers, clipboard images, mixed batches, edited PNG downloads and exact-pixel snapshot reopening in a fresh browser.

- Fetch client weights with Git LFS in CI, package desktop assets in Electron mode, and publish verified model files before deploying the web entry.

- Preserve absolute root/sibling reorder positions in windowed layer lists and verify scrolled pointer drops with one undo. Time out stalled stock-index requests so the public fallback can complete within the tool deadline; prefer thumbnail-sized insertions.

- Keep large layer panels responsive with windowed rows, shared immutable contract validation and indexed child presence; retain keyboard focus, scrolling, search and rename behavior.
- Enable GPU rectangle preview caching on unbounded free canvases without clipping negative coordinates; update exact pointer regions incrementally and avoid repeated renderer routing/index work.

- Bootstrap the FPS audit through a real workbench document and verify cached client-model bytes with the browser network disabled. Exercise the production SVG exporter in container-compositing regressions.

- Preserve SVG backdrop blur, glass and adjustment layers through scene raster embedding, including isolated selection copies; retain an explicit export notice and verify actual pixels. Exit isolated native audit profiles without entering the production quit/recovery flow.

- Verify the image editor through real tool gestures, every adjustment/filter/style kind, inspector fields, live MCP operations, native file recovery and local-model inference. Retain explicit provider and platform blockers instead of counting them as passes.
- Keep command recents unique and verify all six export formats through real downloads. Fall back to Wikimedia Commons for public stock search while preserving source, license, attribution and upstream warnings.
- Render image/text bevels with effective size, isolate inner layer styles from the page backdrop, and retain pixel adjustments/styles in SVG through per-layer raster embedding with an export notice.
- Select connected foreground touched by object-selection scribbles; retain hand-tool camera panning and modal keyboard focus for first-use model downloads.
- Make native Trash recoverable within the workspace, preserve original folders and same-name entries, refuse restore collisions and remove destructive fallback deletion.
- Share staged image insertion without overwriting intervening edits; commit vector/icon expansions and stock batches atomically, report partial failures, and accept embedded image sources.
- Ship checksum-verified small client upscale weights with desktop builds and independently distribute browser downloads. Share one general model for 2x/4x, keep inference local and label interpolation fallback honestly.
- Split asset tools, image insertion, SVG layer actions and Trash handling into focused modules; remove the unused Retouch tool ID and duplicate implementations.

- Restore the workbench prompt heading and recover missing project covers without rewriting files. Generate compact draft previews, prefer newer recovery copies and load visible cards with bounded concurrency.
- Keep early command-palette Tab navigation stable and return focus to Find after replacing the final match so Escape still closes the search surface.

- Guard development-only resource panel PropTypes in production and require a compiled editor/template-browser smoke check before release.

- Implement the Assets browser with searchable file components, persistent workspace Resources, image/SVG/.voo imports, selection reuse and editable built-in template insertion. Keep inserts additive and undoable; isolate imported bitmap IDs.

- Keep recovery-copy preference changes safe while the editor is mounted; disable future draft scheduling without changing Hook order or losing pending-write ownership.
- Repair welcome file-menu commands and keyboard opening, contain modal focus, translate profile labels and keep search, command and toolbar menus keyboard-operable.
- Restore cancelled inspector number edits, let nested menus consume Escape before canvas selection, and keep touch panels and contextual actions reachable inside narrow viewports.
- Keep alignment actions in the contextual menu; align Frames by their own bounds while retaining child movement and one-step undo. Float advanced layout controls outside the inspector's clipping box.

- Hide legacy document-edge resize controls on unbounded canvas roots so Frames crossing world zero retain their own move, duplicate and resize gestures.
- Exclude selection handles, hover controls and grids from the detached free-canvas colour readback while retaining full-surface spatial effect context.
- Keep free-canvas world coordinates stable in every direction; size rendering and pointer surfaces to the viewport without shifting sibling artwork or growing document metadata.
- Preserve signed-coordinate image/text pixels, composited colour sampling and embedded SVG image resources in node and clipboard exports.
- Defer Alt duplication until an actual drag, keep complete Frame/Group trees and internal clipping links independent, and restore cancelled gestures without adding history.
- Reparent dragged subtrees into the visible eligible Frame, respect ancestor clipping and locks, and keep nested paint blocks above their own backgrounds through one-step undo/redo.
- Preserve Group selection identity across history, keep free-canvas adjustments effective outside document metadata bounds, and retain selected Frame adjustment children without enlarging export bounds.
- Paint mesh gradients consistently in Canvas2D, Skia and vector exports; preserve visible vector fill stacks and report unsupported native Figma paints.
- Respect the ask-first image preference when creating automatic design references, while keeping supplied references and editable-layout generation available.
- Keep page reordering bound to its owning pointer, cancel pending drags on dismissal and verify touch scrolling, ordering, safe areas and toolbar hit regions in the real editor.
- Verify stretch through inspector edits, MCP aliases, constraints, wrapping, undo and project reopen; keep batch layout creation undoable and roll back failed partial builds.
- Let floating comment controls participate in the editor's existing overlay layers so the inspector cannot cover their filters, replies or loading recovery.

- Split the layer tree, row controls and panel state into focused modules while retaining hierarchy selection, search, drag/drop and inline editing.
- Split shortcut routing into ordered handlers; keep callbacks current after rerenders, retain the originating engine for arrow-key history bursts and finish them on blur/disable before engine snapshots.
- Load Auto Enhance and Smart Crop planners on use, show local loading feedback, coalesce duplicate clicks and reject late results after document, engine or crop-context changes.
- Keep complete Group move units and preserve descendant parent links when drag auto-parenting moves a Frame or Group across overlapping Frames.
- Bind browser-verification listeners atomically and verify concurrent MCP origin/document isolation; wait for animation-frame change notifications in the lifecycle gate.
- Preserve partial legacy Auto Layout alignment during agent updates and guard advertised canvas tools against missing executors.
- Keep combined agent movement and resizing in one undo entry, retain Boolean operand geometry, preserve external clipping followers, reject locked move units atomically and use the inspector's constrained-child resize path for Frames.
- Preserve mobile pinch state while finishing the original canvas pointer interaction; route its internal cancellation to the original target without suppressing real pointer cancellation.

- Composite transparent Groups and Frames as isolated subtrees, applying alpha once to overlapping children; retain ancestor clips and mask scopes in PNG/SVG exports and preserve undo/project readback.
- Synchronize Boolean operands and active children when boxes resize through numeric edits, handles, agent mutations and constraints; retain Boolean parent links when reopening projects and bake only affine operands that exceed the persisted shear range.
- Defer the empty-canvas comments implementation, keep loading/error recovery local to comments, preserve Escape layering and draft/filter state, and restore unread badges for canonical numeric timestamps.
- Split page lifecycle, artwork, overlays and status notices into focused modules; fix full-page title pointer capture so real double-click renaming works, and keep Auto Layout normalization/reflow behind synchronous public exports.

- Apply transformed, rounded ancestor Frame clips consistently to Canvas2D, SVG, clipping-mask chains and Frame selection exports; retain empty Frame paint and remove fixed-world mask bounds.
- Share merged Boolean contours between Canvas2D and SVG; preserve fills, transparent interiors, nested subtraction holes and independent inside/center/outside strokes without operand seams.
- Extract engine registration/eviction snapshots and canvas-source navigation into focused Hooks, with real-engine coverage for deferred selection, source return contexts and listener cleanup.

- Preserve independent stroke visibility and placement for supported shapes and images across bitmap composition, SVG export, page promotion and project readback; retain additional paints when the primary stroke is hidden and keep unsupported placements disabled.
- Load canvas context menus and closed optional dialogs on first use, keep the canvas mounted during loading, allow pending surfaces to dismiss, and retain query/draft state when reopening.
- Route find matches through the public exact-selection API so matching text is selected correctly inside Groups.
- Extract frame geometry, component context and property-library actions from the editor container; cover constraints, nested selection, library commits and real clipboard shortcuts with browser regressions.

- Keep Inspect colours read-only, preserve required edit/commit callbacks in real panel fixtures, and use renderer defaults for sparse multi-selection transform fields.
- Fail unit and browser release checks on unhandled PropTypes warnings; verify full-page callback routing, inspector copy behavior, multi-selection edits and one-step undo.
- Extract mobile panel gestures, media import, feedback timers and image actions from the editor container; retain loading boundaries and cover page targeting, timers and cleanup with mounted React regressions.
- Report sanitized raster fallback diagnostics while preserving route/configuration and saliency fallbacks.

- Load optional raster action implementations only when used, keep Hook state in a reducer and preserve cancellation/target snapshots across cold imports. Keep the synchronous Boolean API while splitting its geometry, clipping and reconstruction modules.
- Remove the remaining Hook dependency suppressions; preserve engine activation, latest overlay commits and dirty design-system drafts, and fix image source and independent Skia canvas references.
- Keep destructive Boolean results selected, preserve expanded-stroke layer IDs and retain source selections through undo/redo.
- Replace snapping feature probes with mandatory regressions and fix nearest-vertex selection across staggered isometric grid rows at reduced zoom.
- Materialize generated image results into persisted candidate pages instead of silently discarding them; preserve source documents and reject stale document contexts or failed asset writes.
- Restore selection actions on the default free canvas: one contextual toolbar follows object bounds and camera movement, while an empty selection leaves the canvas clear.
- Treat Frames as selection-container boundaries so a real child click and drag can target one object while ordinary Group behavior remains intact.

- Separate welcome configuration and model catalogs from canvas tool execution, defer project parsers and generation contracts until use, and keep scene layout/variables and font catalogs out of first-welcome requests. Start file selection before loading parsers so slow networks preserve picker user activation and filesystem handles.
- Extract canvas gestures and shared camera responsibilities; preserve pointer cancellation and Space-pan behavior with real input regressions. Remove scene model unused-import suppressions and guard public exports with actual ESLint checks.
- Keep model weights out of ordinary web builds, publish them independently with a deployment preflight, retain optional desktop bundling, correct the remote fallback and reject HTML fallback pages as model bytes; serve models through a read-only CORS route with genuine missing-file responses.

- Add real-browser GPU/CPU spatial-filter parity checks; align detail/motion radius bounds, transparent-pixel readback and motion sampling precision/direction while preserving the per-channel tolerance.

- Remove eight unused legacy workflow/storage facades with missing imports, repair the active video-duration constant path, and guard all relative source imports in tests. Actual PSD import, storage and collaboration paths remain covered.
- Defer the editor on first welcome, isolate inspector loading and load PDF/PPTX builders on demand; extract document aids and palette responsibilities from the editor container with pointer/history regressions.
- Normalize Settings text and shortcut groups through English/Chinese translations; language changes recompute search results and descriptions use the shared hint control.
- Filesystem operations distinguish absent targets and cancellation from genuine failures, abort failed writes, and report sanitized operation/error diagnostics instead of false success.

- Finish the retained compact histogram draft: image tools show one luminance row while Levels/Curves keep four channels and clipping readouts; add regression coverage and retain the custom font-weight menu assertions.
- Remove the obsolete mobile generation-row CSS and duplicate open-state attribute; keep all six generation types reachable through the single advanced menu on touch devices.

- Welcome composer: retain the clearer prompt/button surfaces, two-slider settings icon and right-aligned submit action from `aa9f6aa`; keep generation type together with advanced settings behind the existing popover, following Design.md.

- Free-canvas migration preserves visible top-level Frame surfaces and page cameras; regression checks cover content-preserving save/reopen and per-filter selection masks.

- Pending-work integration: signature artifact systems (AXIOM, VOID OS, BLOOM) now carry the welcome choice into agent contracts and starter templates; registry/template builders are split into focused modules.
- Nested frame resize/move resolves descendant constraints; colour-variable v2 controls bind through the current model; bucket tolerance/contiguous/sample-all settings affect the clicked region and reject empty/out-of-bounds seeds.
- 2026-10-28 verification follow-up: replace stale native-select/radio-row assertions with custom-menu contracts and real browser option/callback checks; restore the pen taskbar's finish-path action.
- Mobile editor: touch-aware layouts, independently collapsible panels and panel tabs, larger properties allocation, viewport gestures, compact file actions and mobile onboarding without local CLI setup.
- Menus: editor colour/blend, typography, variants and other native dropdowns now use the shared custom menu with keyboard navigation and consistent dark styling.
- Agent mutations: structured gradients, layer effects/blur, stroke details, blend modes and extended typography fields share validation across single and batch updates; group layout translates descendants atomically and Auto Layout enable/alignment aliases match the scene model.
- Canvas resize: dragging page edges, size presets and exact sizes now resolve child constraints (right, bottom, centre, stretch, scale, nested containers) in one undoable step.
- Skia text rendering keeps the italic style.
- Right panel: Figma-style fill and stroke type menus, independent horizontal/vertical anchor arms, nine-position anchor selector, Layers/Assets tabs on the left panel.
- Agents: CLI bridge authentication uses a private token file; the `new_document` MCP tool; connection retry and help on the first-run agent step; DeepSeek Harness connector.
- Onboarding: a single agent-setup step.
- Editor: supplied resize/rotate cursors, grabbable crop edges, unified live-filter stack and surfaced image tools.
- Deployment: the editor deploys directly to the `la2` host (see `docs/deploy-la.md`).
- Commercial release of VOO Design for macOS, Windows, and Linux.
- Includes the canvas editor, local project workflows, and crash recovery for unsaved drafts.
- Provides English and Simplified Chinese interfaces.
