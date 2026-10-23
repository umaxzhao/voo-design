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
- [ ] Run `npm test` — all suites pass (target: 154 test files, 1905+ tests)
  - Verify no flaky test failures (race conditions fixed in M4)
  - Verify agent tools e2e passes: `npm run test:e2e`
- [ ] Run `npm run build` — production vite bundle succeeds
- [ ] Run `npm run dist` — AppImage generation succeeds
  - Verify artifact size reasonable (~150–200 MB range)
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

Reference: `docs/benchmark-parity-matrix.md` and `docs/editor-ui-gaps.md`

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
| **Browser FPS e2e** | ✅ SHIPPED — `npm run test:e2e:fps` (`tests/e2e/canvas_fps.e2e.mjs`) writes `docs/canvas-fps-results.json` |
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
  - 🐧 [Linux AppImage](…) | SHA256: `…`
  - 🍎 [macOS DMG](…) | SHA256: `…`
  - 🪟 [Windows NSIS](…) | SHA256: `…`
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
- `docs/benchmark-parity-matrix.md` — Gap closure table and deferrals
- `docs/editor-ui-gaps.md` — UI control audit findings
- `docs/code-signing.md` — macOS & Windows certificate setup (to be added)
- `README.md` — User-facing feature overview
