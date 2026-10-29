# Changelog

## 1.0.0

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
