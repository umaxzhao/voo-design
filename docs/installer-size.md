# Installer size audit — 2026-10-23

Linux x64, VOO Design 1.0.0, Electron 43.8.0 (unchanged), branch `codex/release-hardening`.
All sizes below use MiB (1,048,576 bytes). Extracted sizes are sums of logical file bytes,
not filesystem allocation. Rows overlap; do not add parent/child rows or cross-cutting totals.

The AppImage shrank from **212,993,716 bytes (203.13 MiB)** to
**106,382,855 bytes (101.45 MiB)**: **106,610,861 bytes saved (50.05%)**.

| Contributor | Before MiB | After MiB |
| --- | ---: | ---: |
| AppImage (compressed) | 203.13 | 101.45 |
| app.asar | 286.48 | 60.01 |
| app.asar.unpacked | 15.98 | 0.00 |
| node_modules (extracted ASAR, includes unpacked entries) | 214.30 | 1.18 |
| ↳ onnxruntime-web package | 137.81 | 0.00 |
| ↳ canvaskit-wasm package | 24.14 | 0.00 |
| ↳ lucide-react package | 23.00 | 0.00 |
| ↳ ag-psd package / V8 cache payload | 15.98 | 0.00 |
| dist total | 84.45 | 57.40 |
| ↳ dist/ort (two WASM variants + loaders) | 40.65 | 40.65 |
| ↳ dist/assets (JS/CSS + former duplicate WASM) | 31.18 | 4.14 |
| ↳ dist/canvaskit.wasm | 6.83 | 6.83 |
| Electron executable | 215.01 | 215.01 |
| Electron locales | 45.89 | 1.07 |
| All sourcemaps | 40.10 | 0.00 |
| All WASM (11 → 3 files) | 180.01 | 47.41 |
| ONNX models | 0.00 | 0.00 |

## Measurement and changes

Extracted each actual AppImage using `--appimage-extract` into separate temporary directories.
Used `npx @electron/asar list <app.asar>` and `npx @electron/asar extract <app.asar> <dir>`,
then `du -ah <dir> | sort -rh` to find contributors; final table uses file byte totals.
ASAR extraction materializes unpacked entries too, so the node_modules row includes ag-psd
that was stored outside the archive. Baseline disk allocation was approximately 287 MiB ASAR,
25 MiB unpacked, 239 MiB extracted node_modules, and 47 MiB locales.

- Reviewed static/dynamic imports and requires in `electron/`, its `src/shared` and `src/content`
  imports, and preload. Only `electron-updater` and `ws` remain direct production dependencies.
  React, React DOM, Zustand, Lucide, ag-psd, ONNX, CanvasKit, the local canvas package, prop-types,
  fzstd and uzip are build/renderer inputs. fs-extra remains available for tooling and is also
  pulled into production transitively by electron-updater. No application workspace or
  file-management source was changed.
- The redundant production packages included 137.81 MiB ONNX runtime distributions,
  24.14 MiB CanvasKit distributions, 23.00 MiB Lucide sources, and 15.98 MiB ag-psd payload
  including its leaked `.v8-cache`. This was dependency classification leakage, rather than
  electron-builder shipping all root devDependencies.
- Kept notices for bundled renderer libraries via explicit `rendererDependencies` metadata;
  the notices generator traverses those libraries and their transitive dependencies too.
  Build tools such as Vite, Electron builder and the visualizer stay out of legal runtime assets.
- Excluded maps, tests, examples, docs, Markdown and typings from packaging, with explicit
  EULA exceptions. Production Vite sourcemaps are disabled. Baseline contained 2,638 maps
  (40.10 MiB), primarily package distribution maps; the final archive has zero.
- Restricted Electron locales to `zh-CN` and `en-US`; enabled builder `compression: "maximum"`.
- Selected ONNX's `onnxruntime-web-use-extern-wasm` export condition so Vite does not emit
  another hashed JSEP WASM into `dist/assets`. Existing `env.wasm.wasmPaths` points to `ort/`.
  Kept plain SIMD/threaded and JSEP SIMD/threaded binaries and their loaders for the module
  contract and CPU/WebGPU paths. Removed unused asyncify/JSPI/package copies by moving the
  dependency to build inputs. CanvasKit keeps the base binary loaded by `skia_host.js`;
  profiling/full variants no longer ship. Total WASM falls from 180.01 to 47.41 MiB.
  SHA-256 comparison found three identical JSEP copies, two plain ORT copies and two base
  CanvasKit copies before; the final three binaries each have a distinct hash.
  Browser export conditions apply outside Vitest only, preserving Node resolution in tests.

## Optional models and offline behavior

Neither baseline nor final package contains any `.onnx` models, so there are no model bytes
left to remove. Existing `model_asset_loader.js` already downloads remote model URLs on first
use, reports progress, and persists bytes in CacheStorage/IndexedDB. In Electron these stores
live in the default persistent Chromium profile under `app.getPath("userData")`; no separate
filesystem model cache or new IPC was needed. Cached models can be reused offline. A missing
model while offline rejects the optional operation through the existing caller error handling;
normal editing/canvas startup does not load ONNX. The packaged smoke covers startup offline
from models, not a complete model download/inference or GPU validation. Pre-seeding models for
fully offline first use remains a separate distribution choice.

## Renderer analysis

Run `ANALYZE=1 npm run build`, then open `analysis/bundle.html` locally (ignored by Git).
The opt-in rollup-plugin-visualizer reports rendered, gzip and Brotli sizes without opening
an external service. Inspected the generated report: large rendered modules are properties
(~1.84 MB before minification) and presentation (~1.70 MB); ONNX is ~0.37 MB. Vite's emitted
minified chunks are respectively ~821 KB, ~717 KB and ~367 KB. The dominant installer cost
was duplicate dependency/WASM payload rather than renderer JavaScript; the final `dist/assets`
is 4.14 MiB. The report itself is outside `dist` and is never packaged.

## Other platform estimates (not built here)

The shared final app payload is about **60 MiB uncompressed**, including WASM, fonts,
renderer and Electron-side dependencies. Linux's remaining uncompressed platform payload is
about 273 MiB, dominated by the unchanged 215 MiB Electron executable. Compression produces
the measured 101.45 MiB installer. Platform Electron frameworks/binaries and compression
algorithms differ, so these are planning ranges, not measured artifacts:

| Target | Estimated compressed installer | Reason |
| --- | --- | --- |
| macOS DMG, single architecture | 110–150 MiB | Same ~60 MiB app payload plus a platform Electron framework; DMG compression and signing overhead differ from AppImage. |
| Windows x64 NSIS EXE | 95–130 MiB | Same app payload plus Windows Electron/DLLs; NSIS LZMA can compress differently from SquashFS. |

Universal macOS binaries can be substantially larger because they contain two CPU slices.
Build and measure on macOS/Windows release hosts before promising download sizes.

## Validation

- `ANALYZE=1 npm run build`, `npm run build`, and `npm run dist`: passed; publishing disabled.
- `npm run smoke:packaged`: passed on the final AppImage, exposed canvas rendered,
  zero renderer console errors, About legal documents loaded. Refreshed and visually inspected
  `docs/screenshots/packaged-smoke.png`. Container D-Bus diagnostics are system stderr,
  separate from renderer console errors.
- `npm test -- --testTimeout=20000 --maxWorkers=2 --minWorkers=1`: **164 files passed,
  1,954 tests passed, 5 skipped**. The notices regression also passed independently.
  Updated the artifact check from the old hashed duplicate to the retained public ONNX
  binary, checking its WASM header and absence of emitted duplicate WASM.
  The initial run exposed browser export conditions affecting Node tests; scoping those
  conditions outside test mode resolved it.
- Existing Vite `node:zlib` browser-externalization warning in the PDF fallback remains.
  Cross-platform packaging/signing and optional AI inference remain platform QA tasks.

## Incremental follow-up — `codex/installer-size`

Rebuilt the latest branch before changing packaging, rather than using the historical
101.45 MiB artifact above. Linux x64 and Electron 43.8.0 remain unchanged. Unpacked
sizes below sum file bytes across the entire `release/linux-unpacked` directory;
the ASAR row is a subset of that directory.

| Artifact | Baseline bytes | Final bytes | Baseline MiB | Final MiB | Reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| AppImage | 106,431,827 | 104,516,963 | 101.50 | 99.68 | 1.80% |
| Entire unpacked app | 347,774,791 | 343,678,018 | 331.66 | 327.76 | 1.18% |
| app.asar | 63,026,150 | 58,929,377 | 60.11 | 56.20 | 6.50% |

The incremental savings are **1,914,864 compressed bytes** and **4,096,773 unpacked
bytes**. The installer is now below 100 MiB.

- Excluded the nine redundant `dist/fonts/*.ttf` source copies. The UI references
  WOFF2 files; source TTFs remain in the repository. WOFF2 fonts and OFL notices ship.
- Excluded js-yaml's unused browser JavaScript builds and the js-yaml/semver CLI
  entry points. Kept js-yaml's CommonJS implementation and its exported ESM build.
  Excluded benchmark, coverage, and cache directories alongside existing exclusions
  for source maps, typings, tests, examples, and docs.
- Rechecked production imports: both remaining direct dependencies,
  `electron-updater` and `ws`, are runtime requirements. No further direct dependency
  can move to devDependencies. The new archive inspection tool, `@electron/asar`, is
  explicitly a devDependency and does not ship.
- Retained ASAR with no unpacked payload, maximum compression, and the existing
  `en-US`/`zh-CN` locale allowlist. Explicitly selected AppImage XZ compression,
  matching maximum compression's existing behavior. Retained all three WASM binaries
  and both ONNX loaders for CPU/WebGPU support.
- Added `npm run verify:package`, run automatically after the Linux `dist` build.
  It inspects the actual ASAR for required runtime/legal assets and production
  dependencies, rejects unnecessary development files, and checks the locale files.
- Strengthened packaged smoke checks to load both runtime dependencies even with
  update checks disabled. Fixed fresh-profile smoke navigation to dismiss the native
  first-run dialog and handle English/Chinese welcome buttons. Failure screenshots
  are saved too; the runner accepts `VOO_SMOKE_SCREENSHOT` for external output paths.

Validation:

- Baseline: `flock /tmp/voo-e2e.lock npm run dist`.
- Optimized full build: `flock /tmp/voo-e2e.lock npm run dist`; after the smoke-only
  fixes, repackaged the same renderer with `node scripts/signing-env.mjs --linux
  AppImage --publish never` under the same lock, then ran `npm run verify:package`
  and `npm run smoke:packaged` while still holding it.
- Final package inspection: 618 archive entries, exactly `en-US.pak` and `zh-CN.pak`.
- Final AppImage smoke: `PACKAGED_SMOKE_OK`, exposed canvas rendered, updater and
  WebSocket imports loaded, About legal documents loaded, zero renderer console errors.
  The baseline smoke initially exposed the pre-existing first-run/welcome navigation
  assumptions; the final smoke and regression tests cover the corrected path.
- Six focused Vitest files: **27 tests passed**, with `--maxWorkers=2 --minWorkers=1`.
  Coverage includes real ASAR fixtures, missing runtime assets, leaked development
  files, missing/excess locales, fresh-profile navigation in both languages, failure
  screenshots, updater behavior, signing configuration, and third-party notices.
- Screenshot visually inspected: `/tmp/shots-installer-size/optimized.png`.
  The requested `/workspace/tmp/shots-installer-size/` destination is read-only in
  this session's sandbox, so the screenshot uses the writable `/tmp` fallback.
- UI and workspace/file-management implementation remain unchanged. Optional AI
  inference and other platform installers were not exercised by this Linux startup test.

## Second incremental follow-up — `codex/installer-size2`

Measured the current main-derived tree again on Linux x64 with Electron 43.8.0.
The historical 101.45 MiB release is not this round's baseline; the previous
incremental work is already present. Sizes use MiB, not decimal MB.

| Artifact | Before bytes | After bytes | Before MiB | After MiB | Reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| AppImage | 104,524,972 | 103,008,832 | 99.68 | 98.24 | 1.45% |
| Entire unpacked app | 343,733,227 | 343,733,227 | 327.81 | 327.81 | 0.00% |
| app.asar | 58,984,586 | 58,984,586 | 56.25 | 56.25 | 0.00% |

The AppImage saves **1,516,140 bytes (1.45 MiB, 1.45%)**.
SHA-256 hashes of the executable, ASAR and both locales match the baseline;
the unpacked byte totals are unchanged.

The safe remaining change is XZ's **x86 BCJ filter**. SquashFS tries branch-address
normalization and unfiltered compression per block, then retains the smaller
result. This is lossless container compression; it does not strip or rewrite the
shipped executable. Keep ASAR, maximum compression, XZ's existing 1 MiB block and
100% dictionary, and the `en-US` / `zh-CN` locale allowlist.

The signing/build wrapper creates a private temporary view of electron-builder's
checksum-verified legacy AppImage toolset and wraps only `mksquashfs`, adding
`-Xbcj x86 -processors 2 -mem 512M`. It removes that view after the builder exits;
the shared tool cache is never modified. Apply this only to Linux x64 XZ builds;
directory builds, explicit alternate architectures, static-runtime toolsets,
other compressors/platforms and explicit `APPIMAGE_TOOLS_PATH` overrides retain
their existing behavior. The internal toolset resolver is supplied by the locked
electron-builder dependency, so revalidate this integration on builder upgrades.

Rechecked the remaining payload:

- Both direct production dependencies (`ws`, `electron-updater`) are runtime
  imports; renderer/build dependencies already live in devDependencies.
- Maps, typings, tests, docs, source TTF copies and build-only dependencies are
  already excluded. Package inspection now also rejects V8 cache directories.
- Retained both ONNX WASM variants and their loaders for the current module
  contract and CPU/WebGPU support. Neither ONNX binary has a custom/debug section
  to strip. Retained CanvasKit and the native canvas engine. Package inspection
  now permits exactly those four WASM binaries, including exactly one hashed
  canvas engine binary, and rejects extra/duplicate WASM payloads.
- Kept Chromium GPU/SwiftShader/Vulkan resources for runtime compatibility.
  UI and workspace/file-management implementation are unchanged.

### Why 80 MB is not feasible with this Electron payload

Measured the 225,451,256-byte (215.01 MiB) Electron executable alone using the same
SquashFS XZ settings: **73,404,416 bytes (70.00 MiB)** without BCJ and
**72,355,840 bytes (69.00 MiB)** with BCJ. More decisively, compressed the entire
`release/linux-unpacked` platform payload while excluding its whole `resources`
directory (including VOO's ASAR), with BCJ, XZ, 1 MiB blocks, 100% dictionary and
no fragments/xattrs: **89,878,528 bytes (85.71 MiB)**. That platform-only SquashFS
already exceeds both 80 decimal MB and 80 MiB, before VOO's renderer, fonts,
WASM or AppImage launcher/additional libraries. This is a measured floor for the
retained platform files under these settings, not a universal compression limit.
A larger cut requires changing the Electron distribution or runtime feature
coverage, rather than removing more unused app files.

### Validation for this round

- Installed dependencies with `npm ci --prefer-offline`; explicitly ran Electron's
  install script because its binary was initially absent after dependency install.
- Baseline: `flock /tmp/voo-e2e.lock npm run dist` produced the measured artifact.
  The new WASM inspection initially rejected the existing native engine; after
  correcting the allowlist, `node scripts/verify-package.mjs` passed on that same
  artifact. Baseline packaged smoke passed with zero renderer console errors.
- Optimized: `flock /tmp/voo-e2e.lock npm run dist` passed, including package
  inspection: 620 ASAR entries, exactly `en-US.pak` and `zh-CN.pak`, exactly four
  expected WASM binaries. Temporary compression tools were removed after the build.
- Six focused Vitest files passed **32 tests** with
  `--testTimeout=60000 --maxWorkers=2 --minWorkers=1`. After adding the native
  engine cases, the package suite passed **17 tests**, for **34 distinct tests**
  across the final six files. Shared-host scheduling stalls caused preliminary
  fixture timeouts; the package rerun used `--testTimeout=300000
  --hookTimeout=300000 --maxWorkers=2 --minWorkers=1` and passed in 1.33 seconds.
- Final `flock /tmp/voo-e2e.lock env
  VOO_SMOKE_SCREENSHOT=/workspace/tmp/shots-installer-size2/after.png npm run
  smoke:packaged` passed: `PACKAGED_SMOKE_OK`, exposed canvas rendered, runtime
  updater/WebSocket imports loaded, About legal documents loaded, zero renderer
  console errors. The first final-artifact attempt hit the outer runner's 90-second
  timeout under heavy host load; the same artifact passed on retry with unchanged
  smoke timeouts and assertions. Both screenshots were visually inspected.
- Screenshots: `/workspace/tmp/shots-installer-size2/before.png` and
  `/workspace/tmp/shots-installer-size2/after.png`.
- Optional model inference, GPU execution and non-Linux installers were not tested.
  The existing Vite `node:zlib` browser-externalization warning remains.
