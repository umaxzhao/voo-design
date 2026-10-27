# Remote main verification — 2026-10-28

## Reproduction and source isolation

The starting point is remote commit `497a125`, in a separate managed checkout. The primary workspace has unrelated uncommitted changes, and its fast-forward pull was correctly refused because it would overwrite `image_editor.jsx`. None of those pending files was stashed, discarded, committed or copied into this verification.

After building, the baseline full run reproduced **eleven failed tests in seven files, 3656 passed, twelve skipped**. The failing files match the reported colour picker, variants, mobile layout, taskbar, first-run onboarding, compact text and welcome composer. All artifact-dependent tests passed after the build. Historical shared-workspace counts do not certify this later revision.

## Repairs

- Custom-menu resting-state tests now assert accessible listbox triggers and selected labels. Real browser checks open the menus, count every blend/model/weight/variant option and exercise their bound callbacks. Native `<select>`/`<option>` markup is not required for the custom menu.
- Mobile tests follow the current 8:9 panel allocation. The onboarding test hook now executes lazy state initializers, rather than treating the `useIsNarrow` initializer function as a truthy narrow-screen flag. The welcome model assertion checks the current model name and title.
- The taskbar had actually lost the finish-path action. It now finishes draft/edit sessions for pen, curvature pen and free pen through the existing action helper.
- The brightness/contrast header wrote two edits from one stale snapshot. Its second write restored the first category's previous enabled state. Both categories now change in a single committed patch; a browser regression checks both values and one-step undo.
- The changelog records recent mobile/menu/agent changes. The release checklist explains that notice/EULA files under `public/` are generated, ignored assets and identifies their tracked sources and build command.

## Reproducible gate

Run `node scripts/verify-editor-release.mjs` in a clean checkout with dependencies installed. It rejects pending/untracked source, records the full commit and timestamp in a JSON report under the system temporary directory (override with `VOO_RELEASE_REPORT`), then serially runs build, design lint, full unit tests and all five real-browser suites. Build always precedes artifact tests. It fails on any command error or source change during verification.

The two new suites use real Chromium, the real editor engine and an ephemeral private MCP relay. Pointer tests interact with the actual artboard and shared camera. Inspector tests mount the actual inspector components against the actual engine, using the same adjustment normalization as the main panel; they do not replace controls with fake callbacks. The inspector fixture is distinct from certifying every main-panel placement and responsive combination.

## New real-browser evidence

`tests/e2e/inspector-controls.e2e.mjs`:

- All blend modes and five colour models are exposed; changing a mode updates the bound node.
- All nine font weights are unique; Bold reaches the engine.
- A variant dropdown changes the instance source and undoes once.
- Live Filter blur toggle, opacity and removal alter actual image pixels; undo restores the filter.
- Brightness numeric editing and enable switch alter composited pixels; the paired header switches both parameters atomically and undoes once.
- Raster-mask erase/restore and the inspector invert action alter actual image alpha.
- Export scale produces a real PNG download at exactly 2x dimensions; JPEG/WebP format and quality controls produce corresponding encoded downloads and saved presets.

`tests/e2e/drawing-retouch.e2e.mjs`:

- Rectangle, ellipse, polygon, star, line and arrow: actual pointer creation, visible exported pixels, one-step undo/redo.
- Pen, curvature pen and free pen: real anchors/strokes commit visible paths; the finish button commits the pending draft.
- Brush, eraser, blur, sharpen, smudge, dodge, burn and sponge: actual pointer strokes change raster pixels, with exact pixel restoration on undo/redo.
- Clone: Alt source picking and an actual stamp copy pixels and undo once.
- Fill, gradient and local spot healing: pointer operations change pixels and undo once.
- Text: pointer-created text box, actual typing and committed glyph pixels.
- Patch: actual contour/source drag changes bitmap pixels and undoes once.

## Boundaries

This is dedicated evidence for the previously unverified categories, not a blanket certification of every combination. External paid AI repair/background-removal/model calls were not invoked. Exhaustive filter kinds/parameters, multi-filter ordering/blend interactions, all export transparency/suffix/multi-preset combinations, all mask feather/refinement cases, complex nested layout/warp/pin/variants and every device/font remain separate test dimensions. No stored property alone is used to claim a final rendering passed.

## Verified committed release

The full clean-source gate passes at commit `1e5d8793a70ebc6cca972be77cfc2a2e4287b217`, after merging the remote mobile/tool-menu updates. Build and design lint pass; **3669 unit tests pass, twelve skip**, across 424 passing files and three skipped files. All five browser suites pass: 10 resize/typography, 7 paint/text/mobile, 12 layout/clipping/Boolean, 10 inspector, and 23 drawing/retouch scenarios (**62 total**). The final gate checks that HEAD and source cleanliness have not changed during the run. See the [machine-readable command record](remote-main-verification-2026-10-28.json).

This exact application revision was pushed to `origin/main` and deployed through SSH alias `la2` to https://voo.run/editor/. Backup: `/srv/voo-run/editor-backups/1e5d879-20261027T204415Z`. Subsequent documentation-only commits do not change the deployed application. The original workspace's unrelated pending edits remain intact.
