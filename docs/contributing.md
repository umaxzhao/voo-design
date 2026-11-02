# Contributing

## Setup

```bash
git clone https://github.com/umaxzhao/voo-design.git
cd voo-design
npm install
```

Node.js 20+ is expected. The `predev` / `prebuild` hooks copy the ONNX
Runtime and CanvasKit WASM binaries into `public/` automatically; if you need
to refresh them by hand, run `npm run copy:ort` and `npm run copy:canvaskit`.

## Development workflow

Follow [engineering-workflow.md](engineering-workflow.md) for module ownership,
acceptance scope and cross-module regressions. The machine-readable inventory
is `scripts/editor-module-catalog.mjs`; release checks consume the same list.

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Web dev server at `http://localhost:5173` |
| `npm run electron:dev` | Vite + Electron together |
| `npm test` | Full unit test suite (vitest, run once) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run lint:design` | Design-token lint over the whole tree |
| `npm run check:modules` | Validate feature/module IDs, suite ownership and referenced files |
| `node scripts/editor-checks.mjs --changed --json` | Plan affected modules; unowned executable paths require the full gate |
| `npm run test:module -- --module layers` | Run the module and its declared related browser regressions |
| `node scripts/check-design.mjs src/foo.jsx` | Lint specific paths |
| `node scripts/check-design.mjs --staged` | Lint staged content (use this before committing) |
| `npm run build` / `npm run electron:build` | Production builds |

## The design lint is the gate, not prose

This repository is written by both humans and several different coding
agents, and each reads a different instructions file — or none. Design rules
that live only in prose don't reach everyone. `npm run lint:design`
(`scripts/check-design.mjs`) is how the visual-language rules in `design/`
(`design/tokens.cjs`, `design/lint.cjs`, `design/scan_css.cjs`) are enforced
across everyone: it walks the source tree with an ESLint rule and a CSS
scanner and fails on token violations.

The output is the teaching surface: **every finding states the correct
replacement**, not just the offence, so a contributor (or agent) who never
opened the design rules still learns them from the lint output. Add a lint
self-check — `check-design.mjs` contains a suite of self-tests that verify
the linter catches what it claims to catch — when you extend the rules.

## Conventions

- **Undo contracts**: anything that mutates document state must register an
  inverse action in the undo contracts (`src/canvas/undo-action-contracts.js`
  and the `undo_contracts_*.js` modules) or undo/redo will read inconsistently
  across tools, agents and imports.
- **Pure modules** where the format allows: the codegen (`src/canvas/codegen/`)
  and importer/exporter modules access no DOM, no React and no store, which is
  what makes them unit-testable in plain Node.
- **Importers fail soft**: a layer type that can't be mapped becomes part of
  the `warnings` list; only a document with nothing mappable may throw.
- **Save formats report losses** (`src/canvas/store/save_formats.js`): if you
  add or change a save format, model what it can and cannot round-trip.
- **i18n**: user-facing strings live in `src/shared/i18n/` as paired
  English (`*-en.js`) and Chinese (`*-zh.js`) modules.
- **Agent tools** are declared in `src/canvas/agent/canvas_tools.js`
  (`CANVAS_TOOL_SCHEMAS`) — both the built-in agent and every local CLI reach
  the canvas through that one set, so a new tool is sandbox-safe by
  construction.

## Tests

- Unit tests live in `tests/unit/` and run with vitest (`npm test`).
  The suite covers the save/load formats, path booleans, selection and
  transform math, snapping and distribution, the CLI bridge protocol, storage
  and folder behavior, plus adversarial stress tests that try to break
  invariants rather than happy paths.
- `tests/setup.js` is vitest's setup entry.
- Parser/transform code (figma, pen, PSD, electron) is plain Node and is
  exercised directly by tests; UI tests use a component renderer.

Please make sure `npm test` and `npm run lint:design` pass before opening a
pull request.
