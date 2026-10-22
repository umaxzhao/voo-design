# Handoff Report: R3 & R4 Figma App Micro-Interaction, Island Bar, Navigation Ergonomics, and Design System Compliance

**Explorer Subagent**: `survey_r3_figma_ergonomics`  
**Working Directory**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/survey_r3_figma_ergonomics`  
**Target Milestone**: Requirements R3 & R4  
**Date**: 2026-10-21  

---

## 1. Observation

### 1.1 Design System Lint Failures (`npm run lint:design`)
Running `npm run lint:design` executes `node scripts/check-design.mjs` using rules defined in `design/tokens.cjs` and `design/lint.cjs`.
The check exits with code 1 and outputs 3 violations:
```
src/canvas/components/editor_toolbar.jsx
   259:23  shadow  `shadow-sm` is not on the overlay shadow ladder. Use `shadow-pop` (tooltips, hints, capsule buttons) / `shadow-menu` (dropdowns, selects) / `shadow-panel` (drawers, modals) — picked by how far off the canvas the thing floats (Design.md §1).
   273:23  shadow  `shadow-sm` is not on the overlay shadow ladder. Use `shadow-pop` (tooltips, hints, capsule buttons) / `shadow-menu` (dropdowns, selects) / `shadow-panel` (drawers, modals) — picked by how far off the canvas the thing floats (Design.md §1).
   288:23  shadow  `shadow-sm` is not on the overlay shadow ladder. Use `shadow-pop` (tooltips, hints, capsule buttons) / `shadow-menu` (dropdowns, selects) / `shadow-panel` (drawers, modals) — picked by how far off the canvas the thing floats (Design.md §1).

design: 3 violation(s) in 1 file(s) — shadow 3
```
- Location: `src/canvas/components/editor_toolbar.jsx`:
  - Line 259: `persona === "all" ? "bg-white text-black shadow-sm"`
  - Line 273: `persona === "vector" ? "bg-white text-black shadow-sm"`
  - Line 288: `persona === "pixel" ? "bg-white text-black shadow-sm"`
- Rule definition in `design/tokens.cjs`:
  - Line 48: `pop: "0 8px 24px rgba(0, 0, 0, 0.5)", // tooltips, hints, capsule buttons"`
  - Line 244: `SHADOW_OFF_LADDER = /(?<![\w-])shadow(?:-(?:sm|xl|2xl))?(?![\w-])/g;`
  - Capsule buttons must use `shadow-pop` rather than `shadow-sm`.

### 1.2 Canvas Interaction Ergonomics (Pan, Zoom, Snapping, Measurement)
- **Middle-mouse & Space Drag**:
  - In `src/canvas/components/image_editor.jsx`:
    - Line 2757: `const onFreePointerDown = useCallback((event) => { const isPanTrigger = event.button === 1 || spaceRef.current; ... });`
    - Line 2784: `freeStageRef.current?.setPointerCapture?.(event.pointerId);`
    - Line 3335: Attached via capture phase: `onPointerDownCapture={onFreePointerDown}`.
    - Line 2818: Threshold is 1px for middle button/space: `const threshold = gesture.button === 1 || spaceRef.current ? 1 : 4;`.
    - Line 2823: Calls `panEditorCamera(dx, dy)`.
    - Line 3339: `onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }}` prevents browser scroll circle icon.
  - In `src/canvas/editor/editor_pointer.js`:
    - Line 77: `const shared = cameraMode === "shared";`
    - Lines 421-424: When `cameraMode === "shared"`, per-artboard stage wheel listener is bypassed; free-stage handles it.
  - In `src/canvas/editor/editor_pointer_events.js`:
    - Line 21: `if (spaceDown || event.button === 1) { if (!shared) pan.startPan(event); }`
- **Wheel Zoom & Trackpad Pinch/Pan**:
  - In `src/canvas/components/image_editor.jsx`:
    - Lines 2575-2591: Native listener on freeStage:
      ```javascript
      if (event.ctrlKey || event.metaKey) {
        const bounds = stage.getBoundingClientRect();
        setEditorCamera((prev) =>
          zoomCameraAt(prev, wheelZoomFactor(event.deltaY), {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          }),
        );
        return;
      }
      const { dx, dy } = wheelPanDelta(event);
      panEditorCamera(dx, dy);
      ```
    - Trackpad pinch in macOS/Chromium/WebKit emits `wheel` with `ctrlKey = true`, smoothly zooming around cursor.
    - Two-finger pan emits standard `deltaX` and `deltaY` wheel events, driving `panEditorCamera(dx, dy)`.
  - In `src/canvas/editor/editor_constants.js`:
    - Line 345: `wheelZoomFactor(deltaY)` returns `0.999 ** deltaY` (Figma-standard exponential zoom).
    - Line 350: `wheelPanDelta(event)` converts Shift+vertical wheel into horizontal pan (`{ dx: -deltaY || 0, dy: 0 }`).
- **Snapping & Distance Indicators**:
  - In `src/canvas/editor/scene_snapping.js`:
    - Lines 424-780: Equidistant gap snapping computes horizontal (`gap_h`) and vertical (`gap_v`) equidistant spacing between pairs of sibling node bounding boxes.
  - In `src/canvas/editor/chrome_stage_overlays.js`:
    - Lines 189-280: `drawGapGuides` renders magenta `#e056fd` lines, 8px perpendicular end ticks, and rounded pill badges with pixel labels (e.g. `16px`).
  - **Gap Identified**: Canvas lacks Figma-style Option/Alt hover distance measurement pills (holding Alt and hovering over adjacent objects to display direct distance hairlines and gap labels to all 4 edges).

### 1.3 Bottom Floating Island Bar (`editor_contextual_taskbar.jsx`)
- In `src/canvas/components/editor_contextual_taskbar.jsx`:
  - Styling: `rounded-full`, `bg-neutral-900/95`, `border-white/10`, `shadow-pop`.
  - AI button styling: `ICON_BTN_AI` (`bg-[#E5B2FF]/10 text-[#E5B2FF] hover:bg-[#E5B2FF]/20 hover:text-[#eed0ff]`).
  - Standard button styling: `ICON_BTN_DEFAULT` (`text-neutral-300 hover:bg-white/10 hover:text-white`).
  - Multi-selection action triggers:
    - Lines 463-550: When `selectedCount > 1`:
      - Align Left, Center, Right, Top, Middle, Bottom.
      - Group (`IconFolder`), Delete (`IconTrash`).
      - Lines 360-462: If `canCombine` (vector paths): Union, Subtract, Intersect, Exclude.
    - **CRITICAL GAP**: There is **NO Equal Spacing (distribute horizontally/vertically)** button on the multi-selection taskbar! (Grep for `distribute` in `editor_contextual_taskbar.jsx` returned 0 results).
    - **CRITICAL GAP**: There is **NO direct One-Click Auto Layout** button on the multi-selection taskbar or frame taskbar!
      - Line 1218: `editor-taskbar-ai-autolayout` is merely an AI prompt button that dispatches a prompt to the agent panel (`Analyze and apply optimal auto-layout structure to @...`), not a direct native auto-layout action.
  - Single-node action triggers:
    - Image: Remove BG, Expand (Outpaint), Style Transfer, Vectorize (`editor-taskbar-ai-vectorize`).
    - Text: Edit Copy, Polish Tone / Rewrite (`editor-taskbar-ai-rewrite`), Vectorize (`editor-taskbar-ai-vectorize`).
    - Shape: Vectorize, Boolean, Style Transfer.

### 1.4 Keyboard Shortcuts Across Web and Electron Shells
- **Dead Code in `src/canvas/use_editor_shortcuts.js`**:
  - Line 839:
    ```javascript
    case "Digit0":
      event.preventDefault();
      if (onZoomToHundred) onZoomToHundred();
      else engine.zoomToHundred();
      return;
    ```
  - Line 896:
    ```javascript
    case "Digit0":
    case "Numpad0":
      event.preventDefault();
      if (onZoomToFit) onZoomToFit();
      else engine.zoomToFit();
      return;
    ```
  - `case "Digit0"` at line 896 is completely unreachable dead code. `Cmd+0` always maps to `zoomToHundred()`, while `Shift+1` maps to `zoomToFit()`.
- **Electron Shell Menu Accelerators vs Web Shell**:
  - In `electron/main.cjs`:
    - Line 188: `"Fit to Screen"` is bound to accelerator `"CmdOrCtrl+0"`.
    - Line 193: `"Actual Size (100%)"` is bound to accelerator `"CmdOrCtrl+1"`.
    - Line 167: `"Duplicate"` -> `"CmdOrCtrl+D"`.
    - Line 172: `"Delete"` -> `"Backspace"`.
  - In `src/App.jsx`:
    - Lines 59-64:
      ```javascript
      case "view:fit":
        window.__vooEditor?.getViewport?.()?.zoomToFit?.();
        break;
      case "view:actualSize":
        window.__vooEditor?.getViewport?.()?.zoomToHundred?.();
        break;
      ```
    - **BUG**: `getViewport()` in `src/canvas/editor/editor_viewport.js` (line 140) returns the plain viewport data object `{ zoom, panX, panY }`, which DOES NOT have `.zoomToFit()` or `.zoomToHundred()`. Those methods exist on `window.__vooEditor` directly (`window.__vooEditor.zoomToFit()`, `window.__vooEditor.zoomToHundred()`), or via `useDesignStore.getState().editorCamera`.
    - **BUG**: `App.jsx` has NO handlers for Electron menu actions:
      - `"edit:duplicate"`
      - `"edit:delete"`
      - `"edit:selectAll"`
      - `"view:zoomIn"`
      - `"view:zoomOut"`
      - `"view:zoomSelection"`
    - In Electron, because native menus intercept global accelerators before the webview DOM receives key events, user shortcuts triggered via Electron menus fail silently.

### 1.5 i18n Translation Key Inconsistency
- In `src/canvas/components/editor_toolbar.jsx`:
  - Lines 669 & 673:
    `aria-label={t("editor.props.distribute.h") || "水平等距分布"}`
    `aria-label={t("editor.props.distribute.v") || "垂直等距分布"}`
  - In `src/shared/i18n/extended-en.js` (line 558) and `extended-zh.js` (line 543):
    Keys are named `"editor.props.distribute.horizontal"` and `"editor.props.distribute.vertical"`.
  - In `src/canvas/components/editor_properties/align_section.jsx` (line 414):
    Uses `t("editor.props.distribute.${axis}")` (`"horizontal"`, `"vertical"`).
  - Calling non-existent key `"editor.props.distribute.h"` causes `t()` to fall back to the raw string in English or default text.

---

## 2. Logic Chain

1. **Design System Linting**:
   - `design/tokens.cjs` defines standard shadow tokens: `pop` (`0 8px 24px rgba(0,0,0,0.5)` for capsule buttons/pills), `menu`, and `panel`.
   - `scripts/check-design.mjs` explicitly rejects Tailwind's `shadow-sm` via `SHADOW_OFF_LADDER`.
   - `editor_toolbar.jsx` lines 259, 273, 288 use `shadow-sm` on the Persona switcher buttons (`All`, `Vector`, `Pixel`).
   - Therefore, `npm run lint:design` fails with 3 violations. Replacing `shadow-sm` with `shadow-pop` will bring `lint:design` to 0 violations.

2. **Island Bar Ergonomics & Action Triggers**:
   - Requirement R3 & R4 demand fluid one-click adjustments on the bottom floating Island Bar: Equal Spacing (distribute horizontally/vertically), Auto Layout, AI Rewrite, and Vectorize.
   - Vectorize and AI Rewrite are present in `editor_contextual_taskbar.jsx` (lines 1135, 1281, 1300, 1324).
   - However, when 2+ objects are selected (`selectedCount > 1`), `editor_contextual_taskbar.jsx` only shows Align Left/Center/Right/Top/Middle/Bottom, Group, and Delete.
   - `distributeNodes` and `distributeSpacingNodes` are already implemented in `src/canvas/editor/align_ops.js`, and `DistributeIcon` exists in `align_section.jsx`.
   - Adding Equal Spacing Horizontal (`DistributeIcon` axis="horizontal") and Equal Spacing Vertical (`DistributeIcon` axis="vertical") to `editor_contextual_taskbar.jsx` directly completes the required multi-selection micro-interaction.
   - Furthermore, adding a direct one-click Auto Layout button (`IconLayoutGrid`) that either enables Auto Layout on a selected Frame or creates an Auto Layout group from selected nodes completes the Figma parity.

3. **Shortcuts & Shell Parity**:
   - In Electron, native menus bind accelerators (`CmdOrCtrl+0`, `CmdOrCtrl+1`, `CmdOrCtrl+D`, `Backspace`). When pressed, Electron emits `"menu:action"`.
   - `App.jsx` listens to `"menu:action"`, but attempts to call `window.__vooEditor?.getViewport?.()?.zoomToFit?.()`. Since `getViewport()` returns `{ zoom, panX, panY }`, this throws a silent TypeError/noop.
   - Calling `window.__vooEditor?.zoomToFit?.()` or triggering the store's `fitAll()` fixes "Fit to Screen".
   - Adding missing handlers in `App.jsx` for `edit:duplicate`, `edit:delete`, `edit:selectAll`, `view:zoomIn`, `view:zoomOut` ensures seamless behavior in Electron desktop shell.
   - Removing the dead `case "Digit0"` at line 896 in `use_editor_shortcuts.js` cleans up unreachable switch logic.

4. **i18n Key Alignment**:
   - Aligning `editor_toolbar.jsx` lines 669 & 673 to use `t("editor.props.distribute.horizontal")` and `t("editor.props.distribute.vertical")` prevents fallback string leakage and test instability across locale changes.

---

## 3. Caveats & Gaps

1. **Option/Alt Distance Inspection on Hover**:
   - The canvas currently supports smart spacing snapping during active dragging (`scene_snapping.js`).
   - However, it does not currently render hover distance measurement lines when holding Alt without dragging (Figma's Alt-hover inspector). This is a known nuance; the current implementation satisfies R1-R4 drag-snapping guidelines.
2. **Multi-Selection Island Bar Context Node**:
   - In `editor_contextual_taskbar.jsx`, `selectedNode` currently defaults to `selected || engine.getSelected() || null`. When multiple nodes are selected, `selected` is `null` and `engine.getSelected()` returns only the first node.
   - For multi-selection, the AI input prompt says `Ask AI to edit @Layer 1...` instead of `Ask AI to edit @2 layers...`. This can be refined to display a multi-selection badge `@2 objects`.
3. **Electron Dev Environment**:
   - Verification of Electron menu IPC requires running Electron or testing via mocked `window.electronAPI.onMenuAction`. Automated tests in `vitest` run in Node/jsdom, so Electron IPC must be tested via unit mock suites.

---

## 4. Conclusion & Concrete Implementation Plan

### 4.1 Summary of Findings
| Area | Status | Issue | Recommended Action |
|---|---|---|---|
| **Design System** | ❌ 3 Violations | `shadow-sm` in `editor_toolbar.jsx` (lines 259, 273, 288) | Change `shadow-sm` to `shadow-pop` |
| **i18n Consistency** | ⚠️ Mismatch | `editor.props.distribute.h` in `editor_toolbar.jsx` | Change to `editor.props.distribute.horizontal` / `.vertical` |
| **Island Bar** | ⚠️ Incomplete | Missing Equal Spacing & Auto Layout buttons in `editor_contextual_taskbar.jsx` | Add horizontal/vertical distribute and Auto Layout buttons to multi-selection & frame bar |
| **Shortcuts (Web)** | ⚠️ Dead Code | Duplicate `case "Digit0"` at line 896 in `use_editor_shortcuts.js` | Clean up duplicate case |
| **Shortcuts (Electron)** | ❌ Broken Actions | `App.jsx` calls invalid `getViewport()?.zoomToFit()`, misses `edit:duplicate`, `edit:delete`, `view:zoomIn/Out` | Fix method calls to `__vooEditor.zoomToFit()` and add missing action handlers |
| **Unit Test Suite** | ⚠️ Coverage Gap | No tests for contextual taskbar distribute buttons or Electron menu actions | Add unit test cases in `contextual_island.test.jsx` |

### 4.2 Proposed Code Snippets for Workers

#### A. Fix Design Tokens in `src/canvas/components/editor_toolbar.jsx`
```diff
--- a/src/canvas/components/editor_toolbar.jsx
+++ b/src/canvas/components/editor_toolbar.jsx
@@ -256,7 +256,7 @@ export default function EditorToolbar({
                 aria-pressed={persona === "all"}
                 className={`rounded-full px-2 py-1 text-[11px] font-medium transition-all ${
                   persona === "all"
-                    ? "bg-white text-black shadow-sm"
+                    ? "bg-white text-black shadow-pop"
                     : "text-neutral-400 hover:text-white"
                 }`}
               >
@@ -270,7 +270,7 @@ export default function EditorToolbar({
                 aria-pressed={persona === "vector"}
                 className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-all ${
                   persona === "vector"
-                    ? "bg-white text-black shadow-sm"
+                    ? "bg-white text-black shadow-pop"
                     : "text-neutral-400 hover:text-white"
                 }`}
               >
@@ -285,7 +285,7 @@ export default function EditorToolbar({
                 aria-pressed={persona === "pixel"}
                 className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-all ${
                   persona === "pixel"
-                    ? "bg-white text-black shadow-sm"
+                    ? "bg-white text-black shadow-pop"
                     : "text-neutral-400 hover:text-white"
                 }`}
               >
```

#### B. Align i18n Keys in `src/canvas/components/editor_toolbar.jsx`
```diff
--- a/src/canvas/components/editor_toolbar.jsx
+++ b/src/canvas/components/editor_toolbar.jsx
@@ -666,18 +666,18 @@ export default function EditorToolbar({
             {isMultipleSelected && onDistribute ? (
               <>
-                <EditorTooltip title={t("editor.props.distribute.h") || "水平等距分布"} side="top">
+                <EditorTooltip title={t("editor.props.distribute.horizontal") || "水平等距分布"} side="top">
                   <button
                     type="button"
                     onClick={() => onDistribute("horizontal")}
-                    aria-label={t("editor.props.distribute.h") || "水平等距分布"}
+                    aria-label={t("editor.props.distribute.horizontal") || "水平等距分布"}
                     className={`relative ${compactToolButtonClass(false)}`}
                   >
                     <DistributeIcon axis="horizontal" />
                   </button>
                 </EditorTooltip>
-                <EditorTooltip title={t("editor.props.distribute.v") || "垂直等距分布"} side="top">
+                <EditorTooltip title={t("editor.props.distribute.vertical") || "垂直等距分布"} side="top">
                   <button
                     type="button"
                     onClick={() => onDistribute("vertical")}
-                    aria-label={t("editor.props.distribute.v") || "垂直等距分布"}
+                    aria-label={t("editor.props.distribute.vertical") || "垂直等距分布"}
                     className={`relative ${compactToolButtonClass(false)}`}
                   >
                     <DistributeIcon axis="vertical" />
                   </button>
                 </EditorTooltip>
```

#### C. Add Equal Spacing and Auto Layout to `src/canvas/components/editor_contextual_taskbar.jsx`
Import `DistributeIcon` from `./editor_properties/align_section.jsx` and `distributeNodes` from `../editor/align_ops.js`.
In the `selectedCount > 1` section (line 531):
```jsx
          {/* Equal Spacing (Distribute Horizontal / Vertical) */}
          <EditorTooltip title={t("editor.props.distribute.horizontal") || "水平等间距分布"}>
            <button
              type="button"
              data-testid="editor-taskbar-distribute-h"
              onClick={() => engine?.layoutSelection?.(distributeNodes, "horizontal")}
              aria-label={t("editor.props.distribute.horizontal") || "水平等间距分布"}
              className={ICON_BTN_DEFAULT}
            >
              <DistributeIcon axis="horizontal" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.props.distribute.vertical") || "垂直等间距分布"}>
            <button
              type="button"
              data-testid="editor-taskbar-distribute-v"
              onClick={() => engine?.layoutSelection?.(distributeNodes, "vertical")}
              aria-label={t("editor.props.distribute.vertical") || "垂直等间距分布"}
              className={ICON_BTN_DEFAULT}
            >
              <DistributeIcon axis="vertical" />
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* Direct Auto Layout Button */}
          <EditorTooltip title={t("editor.autoLayout.title") || "自动布局 (Auto Layout)"}>
            <button
              type="button"
              data-testid="editor-taskbar-auto-layout"
              onClick={() => {
                if (isFrame && selectedNode) {
                  const current = selectedNode.autoLayout;
                  engine?.updateNode?.(selectedNode.id, {
                    autoLayout: current ? null : { direction: "horizontal", gap: 12, padding: 12 },
                  });
                } else if (engine?.createAutoLayoutFromSelection) {
                  engine.createAutoLayoutFromSelection();
                } else {
                  engine?.groupSelection?.();
                }
              }}
              aria-label={t("editor.autoLayout.title") || "自动布局"}
              className={ICON_BTN_DEFAULT}
            >
              <IconLayoutGrid size={12} />
            </button>
          </EditorTooltip>
```

#### D. Fix Electron Menu Actions in `src/App.jsx`
```javascript
          case "edit:undo":
            window.__vooEditor?.undo?.();
            break;
          case "edit:redo":
            window.__vooEditor?.redo?.();
            break;
          case "edit:duplicate":
            window.__vooEditor?.duplicateSelected?.();
            break;
          case "edit:delete":
            window.__vooEditor?.deleteSelected?.();
            break;
          case "edit:selectAll":
            window.__vooEditor?.selectAll?.();
            break;
          case "view:fit":
            if (window.__vooEditor?.zoomToFit) {
              window.__vooEditor.zoomToFit();
            } else {
              window.dispatchEvent(new CustomEvent("voo:zoom-fit"));
            }
            break;
          case "view:actualSize":
            if (window.__vooEditor?.zoomToHundred) {
              window.__vooEditor.zoomToHundred();
            } else {
              window.dispatchEvent(new CustomEvent("voo:zoom-hundred"));
            }
            break;
          case "view:zoomIn":
            window.__vooEditor?.zoomStep?.(1);
            break;
          case "view:zoomOut":
            window.__vooEditor?.zoomStep?.(-1);
            break;
          case "view:zoomSelection":
            window.__vooEditor?.zoomToSelection?.();
            break;
```

#### E. Remove Dead Case in `src/canvas/use_editor_shortcuts.js`
In `use_editor_shortcuts.js`, lines 896-901:
Remove redundant `case "Digit0":` from the `Numpad0` block so only `case "Numpad0":` triggers `onZoomToFit`.

---

## 5. Verification Method

1. **Design System Lint**:
   ```bash
   npm run lint:design
   ```
   *Expected outcome*: 0 violations reported across all files (`design: clean — X file(s) match Design.md`).

2. **Automated Unit Tests**:
   ```bash
   npx vitest run tests/unit/contextual_island.test.jsx tests/unit/editor_toolbar_affinity.test.jsx tests/unit/navigation_ergonomics.test.js tests/unit/smart_spacing_snapping.test.js
   ```
   *Expected outcome*: 100% tests pass cleanly.

3. **Full Test Suite & Production Build**:
   ```bash
   npm test
   npm run build
   ```
   *Expected outcome*: All test suites pass (0 failures), and Vite build bundles cleanly with exit code 0.

4. **Production Deployment Gate**:
   ```bash
   VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh
   ```
   *Expected outcome*: Successfully deploys to `/var/www/voo.run/editor/` on `la` (`103.114.160.86`), and `curl -I https://la.voo.run/editor/` returns HTTP 200.
