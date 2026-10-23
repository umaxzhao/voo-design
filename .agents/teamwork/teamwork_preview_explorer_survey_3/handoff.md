# Comprehensive Survey Report: Pen App Aesthetic, Step-by-Step Plan Stream UX, Canvas Engine Bidirectional Sync & Safety

**Explorer**: Explorer 3 (Survey Phase)  
**Date**: 2026-10-21  
**Working Directory**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_3`  
**Reference Request**: `ORIGINAL_REQUEST.md` (## 2026-10-21T00:15:39Z)

---

## 1. Observation

### 1.1 Canvas Engine Node Mutation & Undo/Redo Contracts
- **Action Registry & Contracts**:
  - `src/canvas/editor/editor_undo_actions.js:6-277`: Defines `MANUAL_ACTIONS` covering atomic (`ATOMIC`) and continuous (`GESTURE`) mutations, such as `editor.layer.add`, `editor.layer.delete`, `editor.layer.settings`, `editor.layer.move`, `editor.boolean.combine`, and `editor.bitmap.outpaint`.
  - `src/canvas/editor/editor_undo_actions.js:332-346`: Dynamically registers all command table commands from `EDITOR_COMMAND_UNDO_METADATA` (`src/canvas/editor/command_table/undo-metadata.js`) as `editor.command.${definition.id}`.
  - `src/canvas/undo-action-contracts.js:35-56`: `commitEditorAction(actionId, reduce)` manages an execution stack (`editorActionStack`), extracts the active `historyLabel` via `currentEditorHistoryLabel()`, and guarantees contract pop via `try...catch...finally`.
- **Command Execution & Transaction Safety**:
  - `src/canvas/editor/command_table/executor.js:232-241`:
    ```javascript
    const implementation = IMPLEMENTATIONS[id];
    const run = () => implementation({ engine }, args);
    const result = def.undoable
      ? await commitEditorAction(editorCommandActionId(def.id), run)
      : await run();
    if (def.undoable && result !== false && result?.preview !== true) {
      engine?.tagLastHistoryEntry?.(def.id, args);
    }
    return result;
    ```
  - `src/canvas/editor/command_table/implementations_part2.js:209-287` (`apply_design_patches`):
    - **Pass 1 (Validation)**: Resolves all targets (`document` or layer ID in `nodes`), validates numeric bounds, and asserts locks (`assertPatchAllowed`). If any node is invalid or locked, throws immediately with zero mutations applied.
    - **Pass 2 (Mutation)**: Iterates over plan applying `engine.updateNode(step.targetId, step.patch, { commit: false })`.
    - **Commit Phase**: In a `finally` block, executes `engine.commit(COMMAND_DEFINITIONS.apply_design_patches.historyLabel)` once, folding N node modifications into a single undo step.
- **Engine Document State & Undo Stack**:
  - `src/canvas/editor/editor_engine.js:207-232` (`setDoc`):
    - Accepts `{ commit = true, name = null }`.
    - Updates `doc`, increments `docVersion`, recalculates text measurements, and triggers font loading.
    - When `commit === true`: calls `commitEditorAction("editor.document.set", () => history.push(historyState.snapshotState(), name ?? currentEditorHistoryLabel() ?? ...))`.
    - Always triggers `requestRender()` and `notify()`.
  - `src/canvas/editor/editor_engine_node_ops.js:81-88`: `updateNode(id, patch, options)` delegates to `commitOrPreviewEditorDocument("editor.document.set", setDoc, ops.updateNode(getDoc(), id, patch), options)`.
  - `src/App.jsx:36-41`: Global keyboard/menu undo/redo actions invoke `window.__vooEditor?.undo?.()` and `window.__vooEditor?.redo?.()`.
- **Live Engine Binding Deficiency**:
  - `src/canvas/use_editor_engine.js:113-125`:
    ```javascript
    if (
      registerCommands &&
      new URLSearchParams(window.location.search).has("voo-test")
    ) {
      window.__vooEditor = created;
      ...
    }
    ```
    `window.__vooEditor` is only assigned when `voo-test` is present in the query string. In normal interactive sessions, `window.__vooEditor` remains null unless explicitly assigned on focus.
  - `src/canvas/agent/canvas_tools.js:73-77`: `requireEditor()` queries `window.__vooEditor` and throws `TOOL_ERROR.NO_EDITOR` (`agentNoEditor`) if null.

### 1.2 Agent Panel & Plan Stream State
- **Current Panel Implementation**:
  - `src/canvas/components/canvas_agent_panel.jsx:59-358`:
    - Header (lines 200-224): Shows `VooBrandLogo`, active session title, `History` toggle, `New Session` button, and `Collapse` button.
    - State (lines 61-68): Manages `sessions`, `activeId`, `transcript`, `input`, `streamingText`, `busy`, `error`, `historyOpen`.
    - Transcript rendering (lines 291-317): Renders user bubbles, assistant bubbles, and `ToolCallCard` (`item.kind === "tool"`).
    - Composer (lines 325-355): Basic textarea with model name text and send button.
  - `src/canvas/components/tool_call_card.jsx:28-62`: Simple collapsible card displaying tool name, status mark (`…`, `✓`, `✗`), JSON arguments, result, and error.
- **Event Bus Infrastructure**:
  - `src/canvas/store/agent_panel_bus.js:21-75`: Exports `LAYOUT_EVENT` (`START`, `THINKING`, `STAGE`, `DECISION`, `PALETTE`, `CRITIQUE`, `DONE`, `ERROR`), `subscribeAgentPanel`, and `emitAgentPanelEvent`.
  - `src/canvas/store/layout_action_review.js:21-60`: Emits `LAYOUT_EVENT.CRITIQUE` and `LAYOUT_EVENT.DECISION` to `agent_panel_bus`.
  - Currently, `CanvasAgentPanel.jsx` does not subscribe to `subscribeAgentPanel` or handle external context dispatches.

### 1.3 Contextual Taskbar (Selection Island)
- **Current Implementation**:
  - `src/canvas/components/editor_contextual_taskbar.jsx:60-980`: Renders a bottom floating bar mounted on `editor_page.jsx:954,1168` with dynamic positioning `left: docRect.x + docRect.width / 2`, `top: docRect.y + docRect.height + 8px`.
  - Switches layout based on selection kind: Marquee/Lasso, Transform, Pixel Selection Repaint, Boolean Combine, Multi-Layer Align, Pen Edit, Shape, Text, Image.
  - Does NOT yet contain a Pen App style embedded AI prompt quick-input box or direct Agent dispatch trigger.

### 1.4 Test Setup & Deployment
- **Vitest Configuration**:
  - `package.json:19`: `"test": "vitest run"`.
  - `vite.config.js:22-26`:
    ```javascript
    test: {
      globals: true,
      environment: "node",
      include: ["tests/unit/**/*.test.{js,jsx}"],
    }
    ```
- **Existing Agent Tests**:
  - `tests/unit/agent_session_history.test.js`: Verifies session upsert, title generation, and deletion.
  - `tests/unit/canvas_image_generation.test.js`: Verifies `runImageJob` polling/timeout and `placeImageInEditor` engine insertion using Vitest mocks (`vi.fn()`).
  - `tests/unit/align_section.test.jsx`: Demonstrates testing React UI components in a node environment using `renderToStaticMarkup` and JSX element inspection with mocked i18n.
- **Verification Commands & Results**:
  - `npm run lint:design`: Ran `node scripts/check-design.mjs` -> Result: `design: clean — 798 file(s) match Design.md` (0 violations).
  - `npm test`: Ran Vitest -> 61 of 62 test files passed, 696 of 697 tests passed. (The single failure is in `tests/unit/single_canvas_integration.test.js > M3.6` due to WebGL mock initialization under ongoing Milestone 3 refactoring).
- **Deployment Pipeline**:
  - `scripts/deploy-editor.sh:4-21`:
    - Target: strictly enforced to `la` (`VOO_DEPLOY_TARGET:-la`). Exits with error if target is not `la`.
    - Builds via `npm run build`.
    - Deploys via `ssh` and `rsync -avz --delete dist/` to `la:/var/www/voo.run/editor/`.
    - Live endpoint: `https://la.voo.run/editor/`.

---

## 2. Logic Chain

1. **Safety & Bidirectional Sync (Observation 1.1)**:
   - When the Agent executes operations on canvas nodes, direct uncontrolled mutations would corrupt the undo/redo stack, bypass font loading, fail to clear temporary selection handles, and cause out-of-sync dirty states.
   - The established engine architecture provides `commitEditorAction` (`undo-action-contracts.js`) and command implementations with two-pass batch execution (`implementations_part2.js:266-287`).
   - By executing multi-property or multi-layer modifications with `{ commit: false }` and invoking `engine.commit(historyLabel)` once at the conclusion of the turn, the entire agent action is recorded as a single atomic undoable entry in the history stack.
   - For image insertion, `editor.insertImage(url, point)` in `editor_engine_layers.js:379` already commits via `commitEditorDocument("editor.layer.add", ...)`, ensuring instant layer tree updates, texture caching, and undoability.
   - **Crucial Sync Prerequisite**: `window.__vooEditor` is currently conditioned on `voo-test=1` in `use_editor_engine.js:115`. For the agent tools to execute in standard production usage, `window.__vooEditor` must always mirror the currently focused editor engine, or the agent must retrieve the active engine via `useDesignStore.getState().editorBridges[activeNodeId]`.

2. **Context Dispatch from Selection Island (Observation 1.2 & 1.3)**:
   - R1 & R2 require that when an object (Frame, Shape, Image, Text) is selected, a floating island bar provides an embedded AI quick prompt input and contextual quick actions (Outpaint, Style Transfer, Remove BG, Vectorize, Edit Copy).
   - Submitting from this island requires:
     1. Capturing selected node metadata: `{ id: selected.id, name: selected.name, kind: selected.kind, width: selected.width, height: selected.height, text: selected.text, imageId: selected.imageId }`.
     2. Revealing the right-side Agent panel by toggling `agentOpen` to `true` (via `useDesignStore` action `setAgentOpen(true)` or `window.dispatchEvent(new CustomEvent("voo:open-agent", ...))`).
     3. Dispatching the prompt and context into the agent session via `agent_panel_bus.js` or custom event.

3. **Pen App Aesthetic & Plan Stream Structure (Observation 1.2)**:
   - Current `CanvasAgentPanel` only has a basic title and collapses tool calls into generic expandable pre tags.
   - Aligning with Pen App standards requires:
     - **Header**: Active model pill (e.g. `Gemini 2.5 Flash`) and a live status indicator pill (`Ready`, `Thinking...`, `Planning...`, `Executing...`, `Done`).
     - **Context Badge**: An attached reference chip (`@Frame 1`, `@Image`) showing layer type, name, and dimensions with a dismissable `x` button.
     - **4-Phase Plan Stream Cards**:
       - *Thinking*: Collapsible streaming thought disclosure with pulse animation.
       - *Planning*: Structured sub-step checklist with progress indicators (`pending`, `active`, `completed`, `failed`).
       - *Executing*: Focused action card showing tool name, arguments, and progress.
       - *Done & Canvas Diff Confirmation*: Summary of changes, affected node tags, and a one-click "Undo" button wired to `window.__vooEditor?.undo?.()`.

4. **Testing & Deployment Conformity (Observation 1.4)**:
   - Vitest runs in `node` environment. New unit tests for context dispatch, island taskbar AI input, and panel plan stream cards should follow the established pattern in `tests/unit/align_section.test.jsx` (using `react-dom/server`'s `renderToStaticMarkup` or JSX element tree inspection, paired with `vi.mock` for i18n and store).
   - Design tokens must strictly adhere to `Design.md` (dark surface `#18181b`, background `#0c0c0c`, mint accent `#a7ffd4`, no prohibited flat colors or unauthorized gradients) to ensure `npm run lint:design` passes with 0 violations.
   - Deployment must execute `VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh` targeting `la` (`103.114.160.86`).

---

## 3. Caveats

1. **Active Single Canvas Refactoring**:
   - As observed in test run output, `tests/unit/single_canvas_integration.test.js > M3.6` failed due to WebGL mock context during the concurrent Milestone 3 single canvas integration. Our agent panel and contextual taskbar design must interface through standard engine contracts (`engine.updateNode`, `engine.commit`, `engine.insertImage`, `engine.undo`) so that whether the engine is backed by Skia WASM or 2D canvas, the agent layer remains completely agnostic.
2. **Context Persistence Across Turn History**:
   - When a user submits an action targeting `@Frame 1` and later deselects the frame, the transcript record of that turn must retain the snapshot of the context attachment badge (`@Frame 1`) in its stored message history (`session_history.js`), rather than dynamically reflecting subsequent canvas selection changes.
3. **No Code Modification Constraint**:
   - In accordance with the Explorer role instructions, no source files were altered during this survey.

---

## 4. Conclusion

1. **Architecture & Contract Blueprint**:
   - **Engine Safety Contract**: Canvas mutations must follow the two-pass pattern: validate all targets upfront -> apply modifications with `{ commit: false }` -> execute `engine.commit(historyLabel)` inside a `finally` block wrapped by `commitEditorAction()`.
   - **Engine Accessibility**: `use_editor_engine.js` must assign `window.__vooEditor = created` whenever focused (not just under `?voo-test=1`), ensuring `requireEditor()` and menu undo/redo operate reliably.
   - **Island Taskbar**: Extend `src/canvas/components/editor_contextual_taskbar.jsx` with a Pen App-styled glassmorphic pill containing an input field and contextual quick actions.
   - **Cross-Component Coordination**: Dispatch events from the taskbar using `agent_panel_bus.js` and `useDesignStore`, triggering `setAgentOpen(true)` in `App.jsx` and populating the active turn with an attached context badge.
   - **Side Panel Plan Stream**: Upgrade `src/canvas/components/canvas_agent_panel.jsx` to render:
     1. Header model pill and status pill (`Thinking` / `Planning` / `Executing` / `Done`).
     2. Context attachment badge (`@Frame 1`, `@Image`) above the composer.
     3. 4-phase plan execution cards with live progress and canvas diff confirmation.
2. **File Paths for Implementation**:
   - Taskbar selection island: `src/canvas/components/editor_contextual_taskbar.jsx`
   - Agent panel UI: `src/canvas/components/canvas_agent_panel.jsx`
   - Plan stream & execution cards: `src/canvas/components/plan_execution_card.jsx` (new component)
   - Event bus & communication: `src/canvas/store/agent_panel_bus.js`, `src/store/design_store.js`, `src/App.jsx`
   - Engine global assignment fix: `src/canvas/use_editor_engine.js`
   - Test suites: `tests/unit/agent_context_dispatch.test.jsx`, `tests/unit/agent_plan_stream.test.jsx`

---

## 5. Verification Method

To independently verify the implementation when executing future phases:

1. **Design Token Linter**:
   ```bash
   npm run lint:design
   ```
   *Expected*: Zero violations reported across all modified and newly created files.

2. **Automated Unit Tests**:
   ```bash
   npm test
   ```
   *Targeted run for agent & taskbar tests*:
   ```bash
   npx vitest run tests/unit/agent_session_history.test.js tests/unit/canvas_image_generation.test.js
   ```
   *Expected*: 100% passing test suites for session history, image generation, context dispatch, and plan execution card rendering.

3. **Production Build**:
   ```bash
   npm run build
   ```
   *Expected*: Vite builds `dist/` cleanly with no syntax, bundling, or TypeScript errors.

4. **Production Deployment**:
   ```bash
   VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh
   ```
   *Verification Endpoint*:
   ```bash
   curl -sI https://la.voo.run/editor/ | head -n 5
   ```
   *Expected*: HTTP 200 OK returned from `https://la.voo.run/editor/`.

5. **Invalidation Conditions**:
   - Mutating canvas nodes directly without `{ commit: false }` or without wrapping in `commitEditorAction`, resulting in fragmented or corrupted undo/redo history.
   - Bottom selection island or agent panel violating `Design.md` (e.g. using unauthorized gradients, unapproved box-shadows, or light-theme controls).
   - Dispatching from the contextual taskbar failing to open `CanvasAgentPanel` or losing the selected node reference badge.
   - Deploying to any host other than `la` (`103.114.160.86`).
