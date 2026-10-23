# Requirement R1 Investigation Handoff Report: Local Agent Canvas Bidirectional Execution & Visual Feedback

## 1. Observation

### 1.1 Local CLI Agent Configuration & Execution Defaults
- **File**: `src/shared/agent-defaults.js` (lines 1-11)
  - Line 2: `export const DEFAULT_CODEX_MODEL = "gpt-6-astra";`
  - Line 3: `export const DEFAULT_AGENT_MODEL = "codex:gpt-6-astra";`
  - Observation: `DEFAULT_AGENT_MODEL` is currently set to `codex:gpt-6-astra` rather than defaulting to Claude Code (`claude:claude-opus-5-5`), even though requirement R1 and user specifications demand Claude Code as the default connected agent.
- **File**: `src/shared/cli-agents.js` (lines 15-73)
  - Defines `CLI_AGENTS`:
    - `id: "claude"`, `providerId: "claude-cli"`, `displayName: "Claude Code"`, `defaultModel: "claude-opus-5-5"`, `installCmd: "npm install -g @anthropic-ai/claude-code"`, `supported: true`.
    - `id: "codex"`, `providerId: "cli"`, `displayName: "Codex"`, `defaultModel: DEFAULT_CODEX_MODEL`, `installCmd: "npm install -g @openai/codex"`, `supported: true`.
    - `id: "antigravity"`, `providerId: "antigravity-cli"`, `displayName: "Antigravity"`, `defaultModel: ""`, `installCmd: "npm install -g @google/antigravity-cli"`, `supported: false`, `experimental: true` (controlled by `isAntigravityOptedIn()`).
- **File**: `src/canvas/components/onboarding/onboarding_agent_model.js` (lines 8-18)
  - `AGENT_DEFAULT_MODELS = { claude: "claude:claude-opus-5-5", codex: "codex:gpt-6-astra", antigravity: "antigravity:" }`.
  - `applyAgentModel(agent)` persists model choice into `AGENT_SETTING.MODEL`.
- **File**: `src/shared/providers/provider_cli.js` (lines 27-47)
  - `cliBridgeAvailable()` checks `typeof window !== "undefined" && Boolean(window.vooDesktop?.localCli)`.
  - `runCliText(cliId, model, prompt)` executes headless runs via `bridge.runText(cliId, { prompt, model })`.

### 1.2 Dual-Channel Bridge Transport Architecture
- **Web Loopback Client**: `src/canvas/components/agent-panel/local_cli_bridge.js` (lines 25-45, 157-204, 301-332)
  - Default URL: `ws://127.0.0.1:4179` (`CLI_BRIDGE_DEFAULT_PORT = 4179`).
  - `getLocalCliBridge()` returns desktop preload bridge or loopback `webBridge`.
  - `createWebCliBridge`: implements WebSocket RPC with message types `CLI_BRIDGE_MESSAGE.INVOKE`, `RESULT`, and `EVENT` (`CLI_BRIDGE_EVENT.TEXT`).
- **Desktop Electron Main Process Bridge**: `electron/local_backend_bridge.js` & `electron/codex_agent_bridge.js`
  - `registerLocalCliIpc`: handles `voo:cli-status`, `voo:cli-run-text`, and calls `registerCodexAgentIpc`.
  - `registerCodexAgentIpc` (lines 48-60): resolves binaries via `findBinary` (Codex), `findClaudeBinary` (Claude), `findAntigravityBinary` (Antigravity).
  - Handles `voo:codex-connect`, `voo:codex-advance`, `voo:codex-cancel`, and emits `voo:codex-text`.
- **Loopback Bridge Server**: `electron/cli_bridge_server.js` (lines 51-125)
  - Serves HTTP `/health` on `127.0.0.1:4179` and attaches `createWsIpcAdapter()` to `WebSocketServer`.
  - Allows verified origins (localhost, 127.0.0.1, `https://voo.run`, `https://la.voo.run`).
- **Stream Generator**: `src/canvas/components/agent-panel/codex_transport.js` (lines 38-172)
  - `streamCodexCompletion`: invokes `bridge.advance` and streams tokens from `bridge.onText`, returning delta chunks with tool calls `{ id, function: { name, arguments } }`.
- **CLI Adapter**: `src/canvas/agent/cli_agent_step.js` (lines 25-48)
  - `streamCliStep`: adapts `streamCodexCompletion` into `{ text, toolCalls }`.

### 1.3 Canvas Agent Panel & Selection Context Dispatch
- **Context Extraction**: `src/canvas/components/editor_contextual_ai_input.jsx` (lines 10-75)
  - `extractNodeContext(node)` extracts `{ nodeId, layerType, name, dimensions: { x, y, width, height }, imageAsset, textContent, badge }`.
  - Missing: Subtree hierarchy (children array, child count, nested frame layers), Auto-Layout configuration (`autoLayout`: direction, gap, padding, wrap, alignment), styling attributes (`fills`, `strokes`, `strokeWidth`, `cornerRadius`, `opacity`, `blendMode`).
- **Context Dispatch**: `src/canvas/components/editor_contextual_ai_input.jsx` (lines 80-145)
  - `dispatchToAgent`: sets `useDesignStore.getState().pendingAgentIntent`, dispatches window event `voo:agent-prompt` and `voo:open-agent-panel`.
- **Agent Panel Turn Execution**: `src/canvas/components/canvas_agent_panel.jsx` (lines 130-192)
  - Listens to `voo:agent-prompt`.
  - Formats prompt with context header: `[Context: ${targetContext.name} (${targetContext.kind || "layer"}, id: ${targetContext.nodeId}...)]`.
  - Invokes `runAgentTurn` from `src/canvas/agent/canvas_agent.js`.

### 1.4 Canvas Tool Definitions & Execution Capabilities
- **File**: `src/canvas/agent/canvas_tools.js` (lines 45-71, 118-128)
  - Current `CANVAS_TOOL_SCHEMAS`:
    1. `generate_image`: `{ prompt, size, useSelection }`
    2. `describe_selection`: `{}` -> returns `{ selectedId: editor.getSelectedId?.() ?? null }`
  - Observation: There are ZERO tools for canvas node mutations! The agent cannot inspect full layer trees, adjust layout geometry, change fills or strokes, edit text properties, or configure Auto-Layout!
- **Active Editor Engine Reference Bug**: `src/canvas/use_editor_engine.js` (lines 110-125)
  ```js
  if (
    registerCommands &&
    new URLSearchParams(window.location.search).has("voo-test")
  ) {
    window.__vooEditor = created;
    ...
  }
  ```
  - Observation: `window.__vooEditor` is only assigned when `?voo-test` query parameter is present! In normal application usage, `window.__vooEditor` is `undefined`.
  - In `src/canvas/agent/canvas_tools.js` line 74:
    ```js
    function requireEditor() {
      const editor = typeof window !== "undefined" ? window.__vooEditor : null;
      if (!editor) throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), { code: TOOL_ERROR.NO_EDITOR });
      return editor;
    }
    ```
    `requireEditor()` throws `agentNoEditor` in production/normal mode because `window.__vooEditor` is null!
  - In `src/App.jsx` lines 54-63:
    Keyboard shortcuts `window.__vooEditor?.undo?.()` and `window.__vooEditor?.redo?.()` silently do nothing!

### 1.5 Canvas Visual Feedback Overlays
- **Current Canvas Overlays**: `src/canvas/editor/chrome_stage_overlays.js` & `src/canvas/editor/chrome_draw.js`
  - Supports: `cropRect`, `selectionSet`, `selectionRect`, `marqueeRect`, `textDraftRect`, `lasso`, `polygonDraft`, `magneticLassoDraft`, `selectionTransformBox`, `pixelSelection`, `guides`.
  - Observation: There is NO transient focus highlight ring or agent status pill rendered on the canvas stage for targeted nodes during agent execution.
- **Panel Feedback**: `src/canvas/components/canvas_agent_panel.jsx` & `tool_call_card.jsx`
  - Only displays `ToolCallCard` in the side panel list with in-progress, completed, or failed state and a busy spinner. Nothing is reflected directly onto the canvas nodes.

### 1.6 Transactional Safety & Undo/Redo Synchronization
- **File**: `src/canvas/undo-action-contracts.js` (lines 35-65)
  - `commitEditorAction(actionId, reduce)` and `commitEditorDocument(actionId, setDoc, next, options)`.
  - Reduces next document tree and records snapshot to undo/redo history.
- **File**: `src/canvas/editor/editor_engine_node_ops.js` (lines 69, 81-88, 111, 122, 130)
  - `updateNode(id, patch, options)` calls `commitOrPreviewEditorDocument("editor.document.set", setDoc, ops.updateNode(getDoc(), id, patch), options)`.
  - `removeIds`, `reorderNode`, `moveNodesBy` all cleanly invoke `commitEditorDocument`.
- **File**: `src/canvas/editor/editor_engine_groups.js` (lines 45, 77, 92, 145, 207)
  - `layoutSelection`, `groupSelection`, `ungroupSelection` all use `commitEditorDocument`.

### 1.7 Existing Unit Test Coverage
- Total tests in repository: 101 test files, 1367 passing tests.
- Local CLI & agent tests:
  - `tests/unit/cli_agent_step.test.js` (4 tests): verifies `isCliAgentModel` and mocked `streamCliStep`.
  - `tests/unit/cli_bridge_protocol.test.js` (12 tests): verifies protocol framing and loopback roundtrip.
  - `tests/unit/challenger_stress_cli.test.js` (29 tests): stress tests bridge failure recovery.
  - `tests/unit/pen_hybrid_agent.test.jsx` (5 tests): verifies contextual island rendering and `voo:agent-prompt` event dispatch.
  - `tests/unit/contextual_island.test.jsx` (20 tests): verifies `extractNodeContext` and `dispatchToAgent`.
- **Design Lint Check**:
  - `npm run lint:design` fails with 3 violations in `src/canvas/components/editor_toolbar.jsx` lines 259, 273, 288 (`shadow-sm` used instead of `shadow-pop`).

---

## 2. Logic Chain

1. **Local CLI Execution Default**:
   - R1 explicitly requires "Claude Code as default, OpenAI Codex, and Google Antigravity CLI".
   - In `src/shared/agent-defaults.js:3`, `DEFAULT_AGENT_MODEL` is set to `"codex:gpt-6-astra"`. Although `OnboardingGuide.jsx` applies `"claude"`, entering the canvas without onboarding leaves the model as Codex unless `DEFAULT_AGENT_MODEL` in `agent-defaults.js` is corrected to `"claude:claude-opus-5-5"`.

2. **Active Editor Engine Accessibility (`window.__vooEditor`)**:
   - `use_editor_engine.js:114-116` gates setting `window.__vooEditor = created` behind `new URLSearchParams(window.location.search).has("voo-test")`.
   - In standard usage, `window.__vooEditor` remains `null`.
   - `canvas_tools.js:75` checks `window.__vooEditor`, causing `requireEditor()` to throw `TOOL_ERROR.NO_EDITOR`.
   - Therefore, exposing `window.__vooEditor = created` whenever `registerCommands` is true (or via a clean accessor in `useDesignStore`) is a prerequisite for any agent tool execution.

3. **Selected Layer Tree Inspection**:
   - Currently, `extractNodeContext` only extracts flat dimensions and names. When a user selects a Frame, the agent cannot see the children or nested structure.
   - `describe_selection` in `canvas_tools.js:114` only returns `{ selectedId }`.
   - For bidirectional execution, the agent must be able to inspect the entire selected node hierarchy (geometry, styles, fills, strokes, autoLayout, and child nodes).
   - Providing an expanded context serializer and an `inspect_layer_tree` / `get_layer_tree` tool allows the LLM to understand layout and styles before issuing edits.

4. **Bidirectional Canvas Mutation Tools**:
   - Currently, the agent tool schemas only support `generate_image` and `describe_selection`.
   - When users prompt the agent from the bottom taskbar (e.g. "Optimize layout hierarchy", "Apply smart auto-layout", "Set fill to dark blue"), the agent has no corresponding tools to call.
   - Adding structured tools (`mutate_layer_layout`, `mutate_layer_style`, `mutate_layer_text`, `create_canvas_layer`, `delete_canvas_layer`, `batch_mutate_layers`) directly maps agent intent into canvas mutations.

5. **Transactional Safety & Undo/Redo**:
   - `editor.updateNode` and `commitEditorDocument` are already fully implemented in `editor_engine_node_ops.js` and `undo-action-contracts.js`.
   - If the new tool executors call `editor.updateNode(nodeId, patch)` or `commitEditorDocument("editor.agent.mutate", setDoc, nextDoc)`, all agent mutations automatically push history entries onto `history.stack`.
   - This ensures `⌘Z` / `⌘⇧Z` and the History Panel cleanly undo and redo agent actions without corrupting document state.

6. **Canvas Visual Feedback**:
   - Currently, the canvas has no awareness of agent tool steps.
   - Adding an `agentFocus` overlay state to the editor engine (or stage overlays in `chrome_stage_overlays.js` / `chrome_draw.js`) allows drawing a pulsing highlight ring (using VOO token purple `#E5B2FF` or mint `#a7ffd4`) and a status pill badge (e.g. `AI: Updating Auto-Layout`) around the active node while tools run.
   - Firing `voo:agent-focus-node` events from `runAgentTurn.onToolEvent` seamlessly links the agent loop to canvas rendering.

---

## 3. Caveats & Gaps

1. **`window.__vooEditor` Lifetime**:
   - When switching between artboard pages, multiple engines could exist if multiple pages are loaded. However, `useDesignStore.editingNodeId` tracks the currently focused artboard. `window.__vooEditor` should point to the active page's engine.
2. **CLI Process Startup Latency**:
   - Spawning local CLI subprocesses (especially `claude` or `codex mcp-server`) can take 500-1500ms on initial start. Visual feedback (pulsing active status pill) must be displayed immediately upon prompt submission to avoid perceived unresponsiveness.
3. **Design Lint Violations**:
   - `scripts/check-design.mjs` failed on `src/canvas/components/editor_toolbar.jsx` (3 instances of `shadow-sm`). This must be fixed to pass the quality gate `npm run lint:design`.
4. **Token Limits in Layer Trees**:
   - Serializing a deep layer tree with thousands of vector paths could overflow context windows. The serialization must prune verbose SVG path data and deeply nested non-selected nodes, keeping relevant layout, text, and styling nodes.

---

## 4. Conclusion & Concrete Implementation Recommendations

Requirement R1 has solid foundational infrastructure (dual-channel CLI bridge, protocol adapters, Pen-style taskbar and agent panel), but lacks the bidirectional tool layer, active editor binding, and canvas visual feedback.

### Concrete Recommendations for Implementation Workers:

#### 1. Fix Editor Engine Accessibility & Defaults
- In `src/shared/agent-defaults.js`:
  - Change line 3: `export const DEFAULT_AGENT_MODEL = "claude:claude-opus-5-5";`
- In `src/canvas/use_editor_engine.js`:
  - Ensure `window.__vooEditor = created;` is assigned whenever `registerCommands` is true (not gated by `voo-test`).
  - Register `sourceWorkflowNodeId` to `window.__vooEditors[sourceWorkflowNodeId] = created;`.

#### 2. Implement Layer Tree Serialization & Inspection
- In `src/canvas/components/editor_contextual_ai_input.jsx` and `src/canvas/agent/canvas_tools.js`:
  - Provide `serializeLayerTree(node, depth = 3)`:
    - Extracts `id`, `name`, `kind`, `x`, `y`, `width`, `height`, `rotation`, `cornerRadius`.
    - Extracts `autoLayout` (`direction`, `gap`, `padding`, `wrap`, `alignItems`, `justifyContent`).
    - Extracts `fills`, `strokes`, `strokeWidth`, `opacity`.
    - Extracts `text`, `fontSize`, `fontFamily`, `textAlign` for text layers.
    - Recursively extracts children for frames and groups.
  - Add tool `inspect_layer_tree` to `CANVAS_TOOL_SCHEMAS`.

#### 3. Implement Canvas Mutation Tools in `canvas_tools.js`
- Add tools to `CANVAS_TOOL_SCHEMAS`:
  - `mutate_layer_layout`: `{ nodeId, x, y, width, height, autoLayout: { direction, gap, padding, wrap, alignItems, justifyContent } }`
  - `mutate_layer_style`: `{ nodeId, fill, stroke, strokeWidth, cornerRadius, opacity }`
  - `mutate_layer_text`: `{ nodeId, text, fontSize, fontFamily, textAlign }`
  - `create_canvas_layer`: `{ kind: "rect"|"ellipse"|"text"|"frame", x, y, width, height, fill, name, parentId }`
  - `delete_canvas_layer`: `{ nodeId }`
- In `executeCanvasTool`:
  - Map each tool to `editor.updateNode(nodeId, patch)`, `editor.removeNode(nodeId)`, or `editor.addNode(newNode)`.
  - All calls route through `commitEditorDocument`, automatically preserving undo/redo history.

#### 4. Implement Canvas Visual Feedback (Highlight Ring & Status Pill)
- In `src/canvas/editor/chrome_stage_overlays.js`:
  - Implement `drawAgentFocusHighlight(ctx, focusState, viewport)`:
    - Bounding box from target node using `docToScreenRect(nodeAABB(node), viewport)`.
    - Renders a double-ring with glow (outer: `rgba(229, 178, 255, 0.4)`, inner: `#E5B2FF` or `#a7ffd4` mint).
    - Renders floating pill badge displaying status (e.g. `AI modifying: Auto-Layout (gap: 16px)`).
- In `src/canvas/editor/editor_engine.js`:
  - Expose `editor.setAgentFocus({ nodeId, status, action })`.
  - Trigger repaint via `requestRender()`.
- In `src/canvas/agent/canvas_agent.js`:
  - In `onToolEvent`, update `agentFocus` on start, clear on completion.

#### 5. Fix Design Lint Violations
- In `src/canvas/components/editor_toolbar.jsx`:
  - Replace `shadow-sm` on lines 259, 273, 288 with `shadow-pop`.

#### 6. Add Automated Unit Test Coverage
- Create `tests/unit/agent_canvas_mutations.test.js`:
  - Test layer tree serialization (geometry, auto-layout, styles, children).
  - Test execution of `mutate_layer_layout`, `mutate_layer_style`, `mutate_layer_text`.
  - Test transactional undo/redo: verify `editor.undo()` rolls back agent mutations.
  - Test agent focus highlight overlay rendering.

---

## 5. Verification Method

### 5.1 Automated Unit Tests
Run existing and new unit test suites:
```bash
npx vitest run tests/unit/cli_agent_step.test.js tests/unit/pen_hybrid_agent.test.jsx tests/unit/contextual_island.test.jsx tests/unit/cli_bridge_protocol.test.js tests/unit/challenger_stress_cli.test.js
```
Expected: All tests pass (0 failures).

Full regression test:
```bash
npm test
```
Expected: 101+ test suites pass, 1367+ tests pass.

### 5.2 Design Consistency Lint
```bash
npm run lint:design
```
Expected: 0 violations reported.

### 5.3 Production Build Validation
```bash
npm run build
```
Expected: Clean Vite production bundling without errors or missing imports.

### 5.4 Invalidation Conditions
- If `window.__vooEditor` remains unexposed in non-test mode, agent tool mutations will throw `agentNoEditor`.
- If agent tools do not call `commitEditorDocument`, `⌘Z` will fail to revert agent changes.
- If `shadow-sm` remains in `editor_toolbar.jsx`, `npm run lint:design` will exit with code 1.
