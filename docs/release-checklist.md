# VOO Design 商业版 释放清单 / Commercial Release Checklist

**Version**: 1.0.0  
**Target Branch**: main  
**Release Artifacts**: AppImage (Linux), DMG (macOS), NSIS (Windows)

---

## Pre-Release Phase

### Version & Metadata
- [ ] Bump `package.json` version (currently 1.0.0)
- [ ] Update `CHANGELOG.md` with release notes, date, and shipping feature list
- [ ] Verify `package-lock.json` is committed and clean
- [ ] Update app icon files: `build/icon.ico`, `build/icon.png`, `build/icon.icns`

### Build & Testing
- [ ] Run `npm test` — all suites pass (verified: 164 test files, 1954 passed, 5 skipped)
  - Verify no flaky test failures (race conditions fixed in M4)
  - Verify agent tools e2e passes: `npm run test:e2e`
- [ ] Run `npm run build` — production vite bundle succeeds
- [ ] Run `npm run dist` — AppImage generation succeeds
  - Compare artifact size against `docs/installer-size.md` (Linux baseline after hardening: ~101 MiB)
  - Verify dist output in `release/` directory
- [ ] Code signing (see `docs/code-signing.md` for setup)
  - [ ] **macOS**: Sign DMG with Apple Developer certificate
  - [ ] **Windows**: Sign NSIS with Authenticode certificate
  - [ ] **Linux**: AppImage does not require signing (distribution trust model)

### Smoke Test (Electron Launch)
- [ ] Start Electron app from built artifacts: `npm run electron:dev`
- [ ] Verify app window opens, loads canvas, and renders
- [ ] Check DevTools for console errors (none expected)
- [ ] Verify main menu items respond (File, Edit, View, Help)

---

## Product Gates (Audit & Ship-Readiness)

Reference: `docs/audits/benchmark-parity-matrix.md` and `docs/audits/editor-ui-gaps.md`

### Ship-Blockers ✓ COMPLETE

These features were audit priorities and are **required for release**:

| Gate | Feature | Status | Notes |
|:-----|:--------|:-------|:------|
| **A1** | Multi-stop gradient tool | ✅ SHIPPED | Stops editor, angle slider, type chips (radial/linear), reverse button, apply-to-layer. Committed v0.9. |
| **A2** | Brush advanced controls (default open) | ✅ SHIPPED | Advanced sliders (roundness/angle/blend) now visible by default. Committed v0.85. |
| **B1** | Live filters UI (non-destructive stack) | ✅ SHIPPED | Blur, sharpen, roughness, high-pass, motion-blur, pixelate. Persist under adjustments. Committed v0.9. |
| **C** | Agent tools (boolean_combine, set_constraints, export_layers) | ✅ SHIPPED | Schema-validated, end-to-end tested, documented. Committed v0.8. |

### Known Deferrals (Non-Blockers)

These were audit items marked for post-release:

| Deferral | Reason |
|:---------|:-------|
| **GL highPass / clarity / motionBlur twins** | ✅ SHIPPED in commercial-readiness — single-pass GLSL in `gl_spatial.js`; no longer force `cpuOnly` |
| **Browser FPS e2e** | ✅ SHIPPED — `npm run test:e2e:fps` (`tests/e2e/canvas_fps.e2e.mjs`) writes `docs/canvas-fps-results.json` (gitignored run output; the committed baseline is `docs/canvas-perf-results.json`) |
| **Workspace Cursor line** | Cursor is schema/file diff; UI gaps fixed were product-impact, not network schema |
| **Agent session persistence** | Follows shipped JSONL session layer; quality follow-up post-release |
| **Component variants (basic)** | ✅ Basic agent tools (`create_component_variant` / list) shipped; full UI variant picker still polish |
| **Non-destructive masks / blend ranges / frequency separation / Liquify / Camera RAW** | Each is product-sized project; live filter platform already seamed for composition |

---


## Robustness & Packaging (commercial-readiness)

- [x] Electron packaging: `npm run dist` → AppImage; `dist:all` for mac/win/linux
- [x] Code-signing hooks documented in `docs/code-signing.md` (no secrets in repo)
- [x] Global `AppErrorBoundary` (zh/en) + `installGlobalErrorHandlers`
- [x] Crash-recovery drafts: `src/shared/crash_recovery.js`
- [x] Large-image / OOM guard: `src/shared/image_size_guard.js` wired into decode
- [x] GL spatial twins: highPass / clarity / motionBlur
- [x] Playwright FPS instrumentation: `npm run test:e2e:fps`
- [x] Basic component variants (agent tools)

## QA Checklist

### Localization & UI Smoke

- [ ] **Mandarin (中文)**: Launch app, verify menu text, dialog prompts, toast messages render correctly
- [ ] **English (en)**: Repeat smoke test in English locale
- [ ] Font rendering for CJK characters (no mojibake, proper glyph fallback)

### Core File I/O

- [ ] **Create & save**: New file → add shapes → `File > Save As` → save as `.voo` → close
- [ ] **Open & verify**: `File > Open` → select saved `.voo` file → verify all objects restored, layers correct
- [ ] **Round-trip**: Save → close → reopen → save again → verify no data loss or corruption
- [ ] **Legacy format**: If applicable, test opening older `.voo` or `.fig` exports

### Image Handling

- [ ] **Large image placement**: Insert >10MB image (e.g., 8K photo) → verify memory does not spike excessively
  - Confirm bitmap cache eviction works (byte-budgeted LRU in `bitmap_cache.js`)
  - Check GPU texture release on evict (via `onEvict` hook)
- [ ] **Rapid image operations**: Paste 20+ images → verify no crash, cache maintains bounds (~256MB default)
- [ ] **Remove background / matte**: Test image processing tools (ONNX inference) with large image

### Crash Recovery & Error Handling

- [ ] **Crash recovery**: Force kill app mid-edit → relaunch → verify unsaved state recovered from temp backup
- [ ] **Error boundary reload**: Intentionally trigger error in a component → verify error boundary catches it → reload works
- [ ] **Out-of-memory handling**: Verify graceful degradation (not hard crash) when texture budget exceeded

### Agent & Automation (If Enabled)

- [ ] **Agent tool calls**: Test agent executing boolean_combine, set_constraints, export_layers without error
- [ ] **Agent session**: Verify agent maintains context across tool invocations (native Codex session kept alive)
- [ ] **Layout planning**: Agent layout tools (align, distribute, frame, ungroup) execute as expected

---

## Release Phase

### Git & Tagging

- [ ] Ensure working tree is clean: `git status` shows no uncommitted changes
- [ ] Create annotated tag: `git tag -a v1.0.0 -m "VOO Design 1.0.0 Commercial Release"`
  - Verify tag message includes brief release summary
- [ ] Push tag: `git push origin v1.0.0`

### Artifact Preparation

- [ ] Collect release artifacts from `release/` directory:
  - [ ] **AppImage**: `VOO Design-1.0.0.AppImage` (or `.appimagetool` intermediate)
  - [ ] **DMG**: `VOO Design-1.0.0.dmg` (macOS signed)
  - [ ] **NSIS**: `VOO Design 1.0.0.exe` (Windows signed)
- [ ] Verify artifact integrity: compute checksums (SHA256) for all three
  - Store checksums in `release/CHECKSUMS.txt` or GitHub release notes

### GitHub Release

- [ ] Create GitHub release from tag `v1.0.0`
- [ ] Release notes template:
  ```markdown
  ## VOO Design 1.0.0 – Commercial Release

  **Highlights:**
  - Multi-stop gradient tool with angle support, type selector, reverse
  - Live filters UI (non-destructive stack: blur, sharpen, high-pass, motion-blur, pixelate)
  - Agent tools for shape operations (boolean combine, constraints, layer export)
  - Canvas performance: 60 FPS viewport culling, layer caching, spatial indexing
  - Brush advanced controls now visible by default

  **Shipping Gate Summary:**
  - Benchmark parity (A-tier): gradient tool, brush UX ✅
  - Benchmark parity (B-tier): live filters ✅
  - Pencil agent (C-tier): boolean/constraints/export tools ✅

  **Known Deferrals:**
  - GPU live-filter shader twins (CPU path functional)
  - Browser FPS instrumentation (post-release)
  - Workspace cursor line schema (post-release)

  **Contributors:**
  - VOO Design Team

  **Downloads:**
  - 🐧 Linux AppImage (link pending) | SHA256: `…`
  - 🍎 macOS DMG (link pending) | SHA256: `…`
  - 🪟 Windows NSIS (link pending) | SHA256: `…`
  ```
- [ ] Attach binary artifacts to release
- [ ] Publish release

---

## Post-Release Verification

### Download & Launch

- [ ] Download each artifact from GitHub release page (test across platforms if available)
- [ ] Launch downloaded app from installation
  - **macOS**: Double-click DMG → drag app to Applications → launch from Launchpad
  - **Windows**: Run NSIS installer → launch from Start menu
  - **Linux**: `chmod +x VOO-Design-1.0.0.AppImage && ./VOO-Design-1.0.0.AppImage`
- [ ] Verify app runs without dependency errors or missing libraries

### Security & Repository

- [ ] **Secrets audit**: Scan repo for hardcoded API keys, tokens, credentials
  - Run: `git log -p -S 'password\|token\|key\|secret' --reverse` (spot-check)
  - Verify `.env`, `*.pem`, `*.key` files are in `.gitignore`
  - Check GitHub Actions secrets are not printed in logs
- [ ] **License compliance**: Verify MIT license header in key source files
- [ ] **Third-party dependencies**: Review `package.json` pinned versions for known CVEs (use `npm audit`)

### Monitoring & Cleanup

- [ ] Tag appears in GitHub release history
- [ ] No branches remain with uncommitted build artifacts
- [ ] Clean up local `release/` build directory (optional; can be recreated from tag)

---

## Rollback Plan

If critical issue discovered post-release:

1. Yank GitHub release as "not ready"
2. Revert tag: `git push origin :refs/tags/v1.0.0` (or use GitHub UI)
3. Identify root cause and commit fix to new branch
4. Restart release process with incremented version (1.0.1)

---

## Definitions & References

- **Ship-Blocker**: Feature from product audit required for launch
- **Known Gap**: Feature identified in audit, deferred to post-release by scope/priority
- **Smoke Test**: Minimal interactive verification (app launches, key features respond)
- **Artifact**: Binary distribution file (AppImage, DMG, NSIS executable)

For detailed feature inventory, see:
- `PROJECT.md` — Architecture and feature milestones
- `docs/audits/benchmark-parity-matrix.md` — Gap closure table and deferrals
- `docs/audits/editor-ui-gaps.md` — UI control audit findings
- `docs/code-signing.md` — macOS & Windows certificate setup (to be added)
- `README.md` — User-facing feature overview

## Updates, licenses, and packaged verification

- [ ] Use Node 22.12+ for the current Electron/build tooling, then `npm ci` (npm network uses the configured HTTPS_PROXY/HTTP_PROXY).
- [ ] Keep source under `LICENSE` (MIT); review `EULA.md` for binary distribution. About is available in the title bar and native Help menu (app menu on macOS), with English/Chinese labels.
- [ ] `npm run notices` walks installed production dependencies recursively and produces `public/THIRD_PARTY_NOTICES.json`, `public/LICENSE`, and `public/EULA.md`. These are generated assets, bundled into `dist/`, and accessible in About. Review missing/undeclared licenses and upstream license supplements in `scripts/license-texts/` on dependency upgrades.
- [ ] Run `npm test`, `npm run build`, and `npm run dist`. Read the complete builder log; missing production modules are release blockers. Keep `release/` uncommitted.
- [ ] Run `npm run smoke:packaged` on Linux with `xvfb-run` installed. It launches the actual AppImage with an isolated temporary profile, disables updates, asserts a nonzero canvas, rejects renderer console errors, captures `docs/screenshots/packaged-smoke.png`, and exits. Inspect the screenshot as well.
- [ ] Packaged builds check GitHub Releases (`umaxzhao/voo-design`) once at launch, download automatically, and install on quit or explicit Restart. Offline failures are logged silently. `VOO_DISABLE_UPDATES=1` disables checks; development/browser builds do not check. Dismiss hides the current notification only.
- [ ] Publish from trusted CI only: set `GH_TOKEN` as a masked CI environment secret with release-write permission. Never put it in source, build config, renderer, or artifacts. Build the versioned tag with `electron-builder --publish always` on each target platform after its normal build/notices steps. Local `npm run dist` uses `--publish never`.
- [ ] Publish installers AND generated update metadata (`latest.yml`, `latest-linux.yml`, `latest-mac.yml` as applicable) and blockmaps to the same GitHub Release. Verify signatures/checksums, then publish the release rather than leaving it draft.
- [ ] Verify an older installed version detects the published update and successfully restarts into it; test an offline launch separately. Linux auto-update requires running the AppImage as an AppImage. Cross-platform updater/signing checks remain required on macOS/Windows hosts.

### Verification record — 2026-10-23

- `npm test -- --testTimeout=20000 --maxWorkers=2 --minWorkers=1`: 164 files passed; 1954 tests passed, 5 skipped. An initial unrestricted run timed out importing the editor under concurrent CPU load; the controlled run passed.
- `npm run build`: passed. `npm run dist`: passed, with GitHub update metadata generated and publishing disabled.
- Fixed unsupported `linux.desktopName` placement, enabled Linux desktop-name synchronization, included `src/shared` and `src/content` runtime imports missing from the packaged Electron bridges, and supplied the local canvas package's MIT metadata/license.
- Reinstalled/resolved production dependencies with the lockfile; no missing-module/dependency-location warnings remain. Builder's duplicate dependency references are informational and deduplicated in the package. Existing Vite `node:zlib` browser externalization is in the presentation PDF fallback; it remains a build warning. Tailwind no longer scans code-generator template literals, eliminating invalid generated CSS warnings.
- `npm audit --omit=dev`: zero reported vulnerabilities. The host uses Node 20 and emits engine warnings for Electron tooling; use Node 22.12+ in release CI. Full development-tool audit still requires maintenance separately.
- `npm run smoke:packaged`: passed on the final AppImage; exposed editor canvas verified by hit testing, About loaded MIT/EULA/third-party documents, zero renderer console errors, no missing main-process imports. Screenshot inspected at `docs/screenshots/packaged-smoke.png`. Headless Chromium's system D-Bus diagnostics are expected in this container and are separate from renderer console errors.

## Installer size gate

- [ ] Compare release artifact and extracted `app.asar`, `app.asar.unpacked`, WASM, maps and locales with [installer-size.md](installer-size.md); investigate regressions from the 106,382,855-byte Linux x64 AppImage.
- [ ] Keep only Electron runtime imports in production dependencies; maintain `rendererDependencies` for bundled-library notices when moving packages to devDependencies.
- [ ] Run `ANALYZE=1 npm run build` and inspect the local `analysis/bundle.html` report. Ship no report, maps, duplicate WASM, tests or build caches; keep EULA/third-party notices intact.
- [ ] Verify `zh-CN`/`en-US` locales, production sourcemaps disabled, maximum compression, and on-demand model caching/offline failure behavior. Smoke-test the rebuilt AppImage and refresh `docs/screenshots/packaged-smoke.png`.
- [ ] Measure DMG/NSIS on their native release hosts; the report's macOS/Windows sizes are estimates.
