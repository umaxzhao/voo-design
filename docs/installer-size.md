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
