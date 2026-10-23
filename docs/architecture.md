# Architecture

VOO Design is a single-page React application that runs identically in the
browser and inside Electron. Everything below describes the code in this
repository.

## Stack

| Layer | Technology |
| :--- | :--- |
| UI | React 18, Tailwind CSS 3, lucide-react icons |
| State | zustand (`src/store/design_store.js`) |
| Build | Vite 5, vitest for tests |
| Rendering | Skia via CanvasKit WASM (`canvaskit-wasm` + `vendor/voo-canvas-core`) |
| Local AI | `onnxruntime-web` (RMBG matting, LaMa inpainting, upscaling) |
| Desktop | Electron 43 (`contextIsolation: true`, `nodeIntegration: false`) |

The renderer owns one design document per page. Pages themselves are canvas
tabs managed by the zustand store, so a window can hold several open
documents.

## Document model

- A document is a **flat, bottom-first node list**. Groups are folders: their
  children keep absolute boxes and a `parentId`, in pre-order
  (`scene_doc_factory.js`). This shape makes import flattening (PSD, `.fig`,
  Pen), canvas mutation by agents and code export share one representation.
- Node kinds: `image`, `rect`, `ellipse`, `path`, `text`, `region`.
- Auto layout is resolved into concrete boxes on import but keeps an
  `autoLayout` on frames that map cleanly, so it stays editable.
- Geometry mutations go through **undo contracts**
  (`src/canvas/undo-action-contracts.js` and the
  `undo_contracts_*.js` modules): every effect on document state registers an
  inverse action so undo/redo stays consistent across tools, agents and
  imports.

## Rendering

`vendor/voo-canvas-core` (packaged as `@voo/canvas-core`) hosts the Skia scene
renderer. The CanvasKit WASM binary is copied into `public/` by
`scripts/copy-canvaskit-wasm.mjs` — the loader expects the unhashed
`/canvaskit.js` and `/canvaskit.wasm` URLs, which is why Vite cannot manage
that file itself. React hooks bridge the two worlds:
`src/canvas/use_editor_engine.js`, `src/canvas/use_skia_page.js` and
`src/canvas/use_editor_shortcuts.js` wire engine state, page rendering and
keyboard shortcuts into React components.

Overlay work (selection chrome, warp handles, retouch and pixel-selection
regions, agent focus rings) lives in `src/canvas/editor/chrome_*.js` and is
drawn by the same Skia pipeline.

## Source layout

| Directory | Responsibility |
| :--- | :--- |
| `src/canvas/editor/` | Editor engine: tools, command table, selection, snapping, brush/brush-pressure presets, adjustments (CPU kernels), crop, booleans, export, AI pipelines (matting models, healing, upscale), chrome overlays |
| `src/canvas/components/` | React UI: properties panels, dialogs (export, code export, find & replace, command palette), onboarding, presentation UI, agent panel |
| `src/canvas/store/` | Project I/O (`project_io.js`), save formats with loss reporting (`save_formats.js`), file folders, image cache and thumbnails, PSD import, recent files, save queue |
| `src/canvas/agent/` | Design agent loop, canvas tool schemas and implementation, chat streaming, image generation, session history |
| `src/canvas/figma/` | `.fig` container reader/writer (zip + Kiwi schema), Figma-to-VOO conversion with streaming progress, VOO-to-Figma export |
| `src/canvas/pen/`, `src/canvas/presentation/` | Pen-document importer; presentation model, history, and PPTX/PDF writers |
| `src/canvas/codegen/` | Pure code exporters: HTML (Tailwind), React (JSX), CSS — no DOM access, unit-testable |
| `src/canvas/annotations/`, `src/canvas/comments/` | Image annotations and comment model |
| `src/canvas/collab/` | WebRTC collaboration: rooms, presence, identity, stroke bus, chunked blob worker |
| `src/canvas/commands/` | Command registry behind the command palette |
| `src/shared/` | Settings, i18n (English + Chinese), provider catalogs, CLI agent catalog, bridge protocol, app endpoints |
| `src/services/` | Storage layer: an Electron file-system driver plus web drivers for FSA and IndexedDB, with workspace storage on top |
| `src/storage/`, `src/store/` | IndexedDB helper and the zustand dashboard store |
| `electron/` | Main and preload processes (see below) |
| `design/` | Design tokens, contrast utilities and the lint rule used by `npm run lint:design` |

## Electron layer

Electron adds local-machine capabilities to the same web app
(`electron/main.cjs`, `electron/preload.cjs`):

- **File dialogs and host I/O** — open/save dialogs, file reads/writes for
  documents and exports.
- **Workspace manager** (`electron/workspace_manager.cjs`) — a chosen
  workspace directory: folder listing and creation, file scanning, rename,
  move to trash and restore, reveal in Finder — surfaced in the dashboard's
  workspace view.
- **Model bytes** — the desktop app loads AI model weights from its
  `extraResources` (`model:loadBytes`); the packaged `electron-builder`
  config ships the LaMa and RMBG ONNX files. In the browser they are fetched
  from `VITE_MODEL_BASE_URL` instead and cached by the browser.
- **Local CLI agent sessions** (`electron/claude_agent_session.js`,
  `codex_agent_session.js`, `antigravity_agent_session.js`, plus
  `agent_tool_turn.js` and `agent_mcp_server.js`) — described in
  [agents.md](agents.md).
- **Dev-server fallback** — when the Vite dev server is unavailable, the
  desktop window falls back to loading `dist/index.html`.

Security posture: the renderer is sandboxed web code (`contextIsolation: true`,
`nodeIntegration: false`); every host capability is a named IPC channel the
preload exposes.

## Figma import and export

`src/canvas/figma/` implements `.fig` files both ways:

- **Import**: a `.fig` file is a zip containing a Kiwi-schema binary
  (`fig-zip-reader.js`, `figma-kiwi.js`, `figma-schema.js`). `figma-to-voo.js`
  converts the decoded Figma tree into VOO nodes, resolving variables/themes,
  instances (`figma-instances.js`), effects, glyph outlines, text and vector
  paths. The work runs in a **streaming worker**
  (`figma_import_client.js`): progress, page headers, image assets and node
  chunks arrive as messages, so large files render a first screen before they
  finish decoding.
- **Export** (`voo-to-fig.js`): frames, rectangles and ellipses with solid
  fills are written back to a `.fig`. Both directions report per-format
  **losses** before saving (`save_formats.js`).

The same importer pattern covers PSD (`ag-psd` based), SVG, and Pen
documents (`.pen`), each producing the flat VOO node list above and reporting
unsupported layers as warnings instead of failing the whole file.

## Local AI pipelines

- Models are plain data (`src/canvas/editor/matting_models.js`): input size,
  normalisation constants, download size and license per entry. The matting
  setting offers RMBG-1.4 (precise edges) and a smaller fallback.
- All models run through `onnxruntime-web`; its WASM binaries are copied into
  `public/ort` by `scripts/copy-ort-wasm.mjs` because the runtime builds its
  own wasm URL that Vite cannot rewrite.
- The desktop build resolves model bytes through IPC (`model:loadBytes`);
  web builds download from `VITE_MODEL_BASE_URL` and cache them.

## Design lint and tooling

- `scripts/check-design.mjs` (the `lint:design` script) walks the source tree
  with an ESLint rule (`design/lint.cjs`, rule `design/design-system`) plus a
  CSS scanner (`design/scan_css.cjs`), enforcing the token rules from
  `design/tokens.cjs`. It supports whole-tree runs, per-path runs and
  `--staged` for pre-commit checks.
- `scripts/verify-dist-integrity.mjs` and
  `scripts/verify-electron-headless.mjs` are build/CI helpers.
