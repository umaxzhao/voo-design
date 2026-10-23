# Handoff Report: Investigation & Minimal Fix Strategy for Single Canvas Integration Tests (M0)

## 1. Observation

### 1.1 Context of Failures in Victory Audit Report
The Victory Audit Report (`.agents/teamwork/teamwork_preview_victory_auditor_1/victory_audit_report.md:21-24` and `handoff.md:37-62`) documented 3 test failures in `tests/unit/single_canvas_integration.test.js` when running `npm test` at 2026-10-21 08:22:01:

1. **Failure in M3.1 & M3.2**:
   ```
   FAIL tests/unit/single_canvas_integration.test.js > Milestone 3: Unified Single Canvas & Viewport Architecture > 1. Single Canvas Shell & Multi-DOM Elimination > M3.1: verifies free-mode artboards eliminate per-artboard DOM canvas elements
   TypeError: Cannot read properties of null (reading 'useState')
    ❯ Proxy.useState node_modules/react/cjs/react.development.js:1622:21
    ❯ Module.useI18n src/canvas/use_i18n.js:9:36
    ❯ EditorPage src/canvas/components/editor_page.jsx:306:17
    ❯ tests/unit/single_canvas_integration.test.js:73:9

   FAIL tests/unit/single_canvas_integration.test.js > Milestone 3: Unified Single Canvas & Viewport Architecture > 1. Single Canvas Shell & Multi-DOM Elimination > M3.2: preserves full-mode / single-page DOM canvas fallback
   TypeError: Cannot read properties of null (reading 'useState')
    ❯ Proxy.useState node_modules/react/cjs/react.development.js:1622:21
    ❯ Module.useI18n src/canvas/use_i18n.js:9:36
    ❯ EditorPage src/canvas/components/editor_page.jsx:306:17
    ❯ tests/unit/single_canvas_integration.test.js:100:28
   ```

2. **Failure in M3.6**:
   ```
   FAIL tests/unit/single_canvas_integration.test.js > Milestone 3: Unified Single Canvas & Viewport Architecture > 3. Viewport Matrix Pan/Zoom Optimization > M3.6: SkiaHost resize guard prevents surface recreation during pan/zoom
   ReferenceError: window is not defined
    ❯ getInitializer vendor/voo-canvas-core/src/lib/skia/canvas-kit-loader.ts:30:22
    ❯ loadInitializer vendor/voo-canvas-core/src/lib/skia/canvas-kit-loader.ts:38:20
    ❯ SkiaRenderer.loadCanvasKit [as loader] vendor/voo-canvas-core/src/lib/skia/canvas-kit-loader.ts:68:22
    ❯ SkiaRenderer.initialize vendor/voo-canvas-core/src/lib/skia/skia-renderer.ts:122:34
    ❯ createSkiaHost src/canvas/editor/skia_host.js:52:34
    ❯ tests/unit/single_canvas_integration.test.js:240:20
   ```

### 1.2 Inspection of Source Modules
1. **`src/canvas/use_i18n.js` (Lines 8–25)**:
   ```javascript
   export function useI18n() {
     const [locale, setLocaleState] = useState(getLocale);
     const [, setRevision] = useState(0);
     useEffect(() => onLocaleChange((next) => { ... }), []);
     return { t, locale, toggleLocale };
   }
   ```
   In `src/canvas/components/editor_page.jsx:306`, `const { t } = useI18n();` is called at the top of `EditorPage`. When evaluated in server-side test rendering (`renderToStaticMarkup`) in Node, `react.development.js:1622` attempts `resolveDispatcher().useState(...)`. Across dynamic Vitest module evaluation boundaries, `ReactCurrentDispatcher.current` resolves to `null`, triggering `TypeError: Cannot read properties of null (reading 'useState')`.
   In existing tests such as `tests/unit/align_section.test.jsx:6-12`, this is solved by providing a lightweight mock for `useI18n`.

2. **`vendor/voo-canvas-core/dist/lib/skia/canvas-kit-loader.js` (Lines 11–17)**:
   ```javascript
   function getInitializer() {
       const candidate = window
           .CanvasKitInit;
       return typeof candidate === "function"
           ? candidate
           : null;
   }
   ```
   Because Vitest executes test suites in Node.js by default without JSDOM, `window` is undeclared in the global scope. Accessing `window.CanvasKitInit` directly results in an uncaught `ReferenceError: window is not defined`.

### 1.3 Inspection of Working Directory State
- File `tests/unit/single_canvas_integration.test.js` was updated at `2026-10-21 08:24:49` (after the auditor run).
- Top of `tests/unit/single_canvas_integration.test.js:6-12` already contains:
  ```javascript
  vi.mock("../../src/canvas/use_i18n.js", () => ({
    useI18n: () => ({
      t: (key) => key,
      locale: "en",
      toggleLocale: () => {},
    }),
  }));
  ```
- Lines 208–274 inside `M3.6` already contain:
  ```javascript
  if (typeof globalThis.window === "undefined") {
    globalThis.window = {};
  }
  const prevCanvasKitInit = globalThis.window.CanvasKitInit;
  globalThis.window.CanvasKitInit = async () => ({
    GetWebGLContext: () => 1,
    MakeWebGLContext: () => ({ delete: () => {} }),
    MakeOnScreenGLSurface: () => ({
      getCanvas: () => ({
        clear: () => {},
        save: () => {},
        restore: () => {},
        scale: () => {},
        translate: () => {},
      }),
      delete: () => {},
    }),
    MakeSWCanvasSurface: () => ({
      getCanvas: () => ({
        clear: () => {},
        save: () => {},
        restore: () => {},
        scale: () => {},
        translate: () => {},
      }),
      delete: () => {},
    }),
    ColorSpace: { SRGB: {} },
    ParagraphStyle: class {},
    FontCollection: class {},
    TextStyle: class {},
    TypefaceFontProvider: {
      Make: () => ({
        registerFont: () => {},
        delete: () => {},
      }),
    },
    ParagraphBuilder: {
      MakeFromFontProvider: () => ({
        build: () => ({ layout: () => {} }),
      }),
    },
    Paint: class {
      setAntiAlias() {}
      setColor() {}
      setStyle() {}
      setShader() {}
      setImageFilter() {}
      setMaskFilter() {}
      setBlendMode() {}
      setStrokeWidth() {}
      setStrokeJoin() {}
      delete() {}
    },
    PaintStyle: { Fill: 0, Stroke: 1 },
    Path: {
      MakeFromSVGString: () => ({ delete: () => {} }),
    },
    StrokeJoin: { Round: 1, Miter: 0, Bevel: 2 },
    BlendMode: {},
    ClipOp: { Intersect: 0 },
    FontWeight: { Bold: 700, SemiBold: 600, Medium: 500, Normal: 400, Light: 300, ExtraLight: 200 },
    FontSlant: { Italic: 1, Upright: 0 },
    TextDirection: { LTR: 0, RTL: 1 },
    parseColorString: () => [0, 0, 0, 1],
  });
  ```
  With restoration in `finally` (lines 307–311):
  ```javascript
  } finally {
    if (prevCanvasKitInit) {
      globalThis.window.CanvasKitInit = prevCanvasKitInit;
    } else {
      delete globalThis.window.CanvasKitInit;
    }
  }
  ```

### 1.4 Verification Command Results
- `npx vitest run tests/unit/single_canvas_integration.test.js`:
  ```
  ✓ tests/unit/single_canvas_integration.test.js (11) 1658ms
  Test Files  1 passed (1)
       Tests  11 passed (11)
  ```
- `npm test`:
  ```
  Test Files  62 passed (62)
       Tests  697 passed (697)
    Duration  3.13s
  ```
- `git status -s`:
  `?? tests/unit/single_canvas_integration.test.js` is an untracked file.

---

## 2. Logic Chain

1. **Derivation of M3.1 & M3.2 Fix (Derives from Observation 1.1 & 1.2)**:
   - `renderToStaticMarkup` in Node is designed to evaluate pure JSX structures without dynamic event listeners or browser storage side effects.
   - `EditorPage` invokes `useI18n()` at line 306. Because `useI18n` calls `useState(getLocale)` and `useEffect` with asynchronous locale subscription handlers, running it inside Node server rendering when React's internal dispatcher is detached causes a null reference exception.
   - Mocking `useI18n` with a static identity translator (`t: (k) => k`) matches the established codebase convention (`tests/unit/align_section.test.jsx`), eliminates the null dispatcher error, and allows `EditorPage` to render its DOM output cleanly.

2. **Derivation of M3.6 Fix (Derives from Observation 1.1 & 1.2)**:
   - `createSkiaHost` in `src/canvas/editor/skia_host.js` instantiates `SkiaRenderer` from `@voo/canvas-core`.
   - `SkiaRenderer.initialize()` invokes `canvas-kit-loader.js:12`, which queries `window.CanvasKitInit`.
   - In Node.js, `window` does not exist on the global scope. Defining `globalThis.window = {}` and providing a mocked `CanvasKitInit` satisfying `@voo/canvas-core`'s initialization contract allows `createSkiaHost` to initialize without a real GPU or WASM binary, accurately testing the resize guard logic.
   - Teardown in `finally` cleans up `CanvasKitInit`. To ensure pristine hygiene, `globalThis.window` can also be deleted if it was not previously present.

3. **Status Assessment (Derives from Observation 1.3 & 1.4)**:
   - Worker M3 completed the implementation of both fixes in `tests/unit/single_canvas_integration.test.js` at 08:24:49, shortly after the auditor's rejection at 08:22:01.
   - Both `npx vitest run tests/unit/single_canvas_integration.test.js` and the canonical `npm test` pass with 100% success rate (697 of 697 tests passing across all 62 test files).

---

## 3. Caveats

1. **Untracked Test File**:
   `tests/unit/single_canvas_integration.test.js` is currently untracked (`??` in `git status`). The orchestrator and subsequent workers must ensure this file is not lost during any git operations and is included in the final repository commit.
2. **Concurrent M1/M2 Lint Violations**:
   Running `npm run lint:design` currently reports 4 design token violations in `src/canvas/components/canvas_agent_panel.jsx` and `src/canvas/components/editor_contextual_taskbar.jsx`. These were introduced by concurrent workers implementing M1 and M2 and are outside M0, but must be resolved before the final deployment gate.
3. **Global Scope Hygiene**:
   In `M3.6`, `globalThis.window` is created if undefined. In the current file, `delete globalThis.window.CanvasKitInit` is performed in `finally`, leaving `globalThis.window = {}`. While this causes zero issues across all 62 test files in the suite, an even cleaner teardown would check `const wasWindowDefined = typeof globalThis.window !== "undefined"` and `if (!wasWindowDefined) delete globalThis.window` in `finally`.

---

## 4. Conclusion

- The 3 failing tests in `tests/unit/single_canvas_integration.test.js` reported by the victory auditor failed due to:
  1. (M3.1, M3.2): Unmocked `useI18n` calling `useState` during `renderToStaticMarkup` in Node.
  2. (M3.6): Bare `window.CanvasKitInit` access in `@voo/canvas-core`'s `canvas-kit-loader.js` during headless Node testing.
- The exact minimal fix strategy is:
  1. Provide module-level mock `vi.mock("../../src/canvas/use_i18n.js")` at the top of the test file.
  2. Mock `globalThis.window` and `CanvasKitInit` in M3.6 with proper `finally` restoration.
- **Current Status**: This exact fix strategy is **already fully applied** in `tests/unit/single_canvas_integration.test.js`.
- All 11 tests in `tests/unit/single_canvas_integration.test.js` pass, and `npm test` passes 100% (697/697). Milestone M0 is verified.

---

## 5. Verification Method

To independently verify this assessment:

1. **Run Single Canvas Integration Tests**:
   ```bash
   npx vitest run tests/unit/single_canvas_integration.test.js
   ```
   *Expected result*: 11 of 11 tests pass in ~1.7s.

2. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   *Expected result*: 62 of 62 test files pass, 697 of 697 tests pass with exit code 0.

3. **Inspect Implementation Points**:
   - `tests/unit/single_canvas_integration.test.js:6-12`: Mock for `useI18n`.
   - `tests/unit/single_canvas_integration.test.js:208-274`: Mock for `globalThis.window.CanvasKitInit`.
   - `tests/unit/single_canvas_integration.test.js:307-311`: Cleanup in `finally`.

4. **Invalidation Conditions**:
   - Any test failure in `tests/unit/single_canvas_integration.test.js`.
   - Deletion of `tests/unit/single_canvas_integration.test.js` prior to git commit.
