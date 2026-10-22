# Canvas, Agent UI & Test Infrastructure Survey Report

## 1. Observation

### 1.1 Bottom Floating Selection Taskbar (Island Bar) & Context Capture
- **Location**: `src/canvas/components/editor_contextual_taskbar.jsx` (Lines 1047–1350) and `src/canvas/components/editor_contextual_ai_input.jsx` (Lines 10–145).
- **Trigger Condition**: Rendered when `!isTransforming && (selected || selectedCount > 0)` at line 1048.
- **Context Extraction (`extractNodeContext`, lines 10–75 in `editor_contextual_ai_input.jsx`)**:
  - `nodeId`: `node.id || "selection"`
  - `layerType`: `"frame"` (if `node.isFrame || node.kind === "frame" || node.kind === "artboard" || (node.kind === "rect" && node.isFrame) || node.type === "imageEditor"`), `"image"`, `"text"`, `"shape"` (for rect, ellipse, path, boolean), or `node.kind`.
  - `dimensions`: `{ x: Math.round(node.x ?? 0), y: Math.round(node.y ?? 0), width: Math.round(node.width ?? node.w ?? 0), height: Math.round(node.height ?? node.h ?? 0) }`.
  - `imageAsset`: `node.url || node.src || node.imageId || node.assetId || null`.
  - `textContent`: `node.text || node.content || null`.
  - `badge`: `@${rawName}`.
- **UI Elements in Island Bar**:
  - Sparkle button (`data-testid="editor-taskbar-ai-sparkle"`): triggers general prompt / panel expansion.
  - Quick input field (`EditorContextualAiInput`, `data-testid="editor-taskbar-ai-input"`): dynamic placeholder based on layer kind (e.g. `Ask AI to edit @Hero Photo...`, `Ask AI to layout @Frame 1...`, `Ask AI to rewrite @Heading...`).
  - Specialized action pills by layer kind:
    - **Image**: Remove BG (`matting`), Expand (`expand`), Style Transfer (`style_transfer`), Vectorize (`vectorize`).
    - **Frame / Artboard**: Expand (`expand`), Style Transfer (`style_transfer`), Edit Layout (`edit_layout`), Auto Layout (`autolayout`), Generate Layout (`generate_layout`).
    - **Text**: Edit Copy (`edit_copy`), Polish / Rewrite (`rewrite`), Vectorize (`vectorize`).
    - **Shape**: Color Theme / Style (`style_transfer`), Smooth Paths (`vectorize`), Boolean Ops (`boolean_op`).
- **Dispatch Mechanism (`dispatchToAgent`, lines 80–145 in `editor_contextual_ai_input.jsx`)**:
  1. Zustand Store dispatch: calls `store.dispatchAgentIntent(...)`, `store.dispatchToAgent(...)`, `store.setAgentPanelOpen(true)`, `store.setAgentOpen(true)`.
  2. DOM CustomEvents dispatched on `window`:
     - `voo:agent-dispatch` with `{ prompt, intent, tool, context, autoSend }`.
     - `voo:open-agent-panel` with `{ context }`.
     - `voo:agent-prompt` with `{ prompt, intent, tool, context, autoSend }`.

### 1.2 Right-Side CanvasAgentPanel & Local CLI Provider Communication
- **Location**: `src/canvas/components/canvas_agent_panel.jsx` (Lines 1–439).
- **Session & Transcript State**:
  - Uses `loadStoredSessions()` and `upsertSession` from `src/canvas/agent/session_history.js`.
  - Maintains `sessions`, `activeId`, `transcript` (array of `{ kind: "text", role, content, contextBadge }` and `{ kind: "tool", call }`), `streamingText`, `busy`, `activeContext`.
- **Event Listeners (Lines 194–216)**:
  - Listens to `window` for `voo:agent-prompt` and `voo:open-agent-panel`.
  - Automatically updates `activeContext` and triggers `send(prompt, context)`.
- **Active Model Pill & UI (Lines 249–254)**:
  - Displays green pulsing indicator `<span className="size-1.5 rounded-full bg-[#a7ffd4] animate-pulse" />`.
  - Shows active model name: `modelName || "Flash"` and `<span className="text-[9px] text-[#a7ffd4] uppercase font-semibold">Active</span>`.
- **Tool Execution & Step Card (Lines 338–342 & `src/canvas/components/tool_call_card.jsx`)**:
  - Tool calls are represented via `ToolCallCard({ call })` with status marks: `in_progress: "…"`, `completed: "✓"`, `failed: "✗"`. Expandable to inspect arguments, return value, or error.
- **Current Backend Communication**:
  - Lines 154–168 in `canvas_agent_panel.jsx` call `runAgentTurn` from `src/canvas/agent/canvas_agent.js`.
  - `runAgentTurn` invokes `streamChatTurn` (`src/canvas/agent/chat_stream.js`), which makes a direct `fetch` to `${config.baseUrl}/chat/completions` (OpenAI-compatible HTTP SSE).
  - **Bridge Integration Status**:
    - `src/shared/providers/provider_cli.js` exists and provides `parseCliModelId`, `submitProviderJob`, and `fetchProviderJob`, checking `window.vooDesktop?.localCli`.
    - `src/shared/cli_bridge_protocol.js` defines wire channels (`voo:codex-connect`, `voo:codex-advance`, `voo:codex-cancel`, `voo:cli-check-all`) on loopback port `4179`.
    - In `electron/preload.cjs` and `electron/main.cjs`, `vooDesktop.localCli` IPC is **not yet exposed**.
    - In web mode, a loopback WebSocket bridge client (like `createWebCliBridge` in voo-run) is **not yet hooked into `canvas_agent_panel.jsx`**.

### 1.3 Canvas Engine Node Mutations & Undo/Redo Transactions
- **Location**: `src/canvas/undo-action-contracts.js`, `src/canvas/editor/editor_undo_actions.js`, `src/canvas/editor/editor_history_api.js`, and `src/canvas/editor/editor_engine_layers.js`.
- **Contract & Boundary Design**:
  - `UNDO_ACTION_CONTRACTS` registers explicit contracts for every mutating operation (e.g., `editor.layer.add`, `editor.layer.delete`, `editor.layer.move`, `editor.layer.order`, `editor.layer.settings`, `editor.boolean.*`, `editor.pen.change`, `editor.transform.change`).
  - Boundaries: `ATOMIC` (single discrete action) vs `GESTURE` (continuous drag/transform with start/commit).
- **Transaction Dispatch**:
  - All engine mutations funnel through `commitEditorDocument(actionId, setDoc, nextDoc, options)`:
    ```js
    export function commitEditorAction(actionId, reduce) {
      const contract = undoActionContract(actionId);
      editorActionStack.push(contract);
      try {
        result = reduce(contract);
      } finally {
        editorActionStack.pop();
      }
      return result;
    }
    export function commitEditorDocument(actionId, setDoc, next, options) {
      return commitEditorAction(actionId, () => setDoc(next, options));
    }
    ```
  - `setDoc` updates the scene tree and invokes `history.push(snapshotState(), name)`.
- **Tool Execution Compatibility**:
  - `executeCanvasTool` (`src/canvas/agent/canvas_tools.js`) calls `placeImageInEditor` -> `editor.insertImage(url, point)` -> `commitEditorDocument("editor.layer.add", setDoc, ops.addNode(doc, node))` (line 379 of `editor_engine_layers.js`).
  - Undo/redo stack (`editor.undo()`, `editor.redo()`) is cleanly updated without corrupting selection state, dirty flags, or history entries.
  - Can safely support any new CLI agent tools (e.g. `modify_node`, `create_frame`, `apply_autolayout`) using `commitEditorDocument`.

### 1.4 Test Infrastructure, Design Linter, Build & Deployment Scripts
- **Test Suite (`npm test`)**:
  - Configured in `vite.config.js`:
    ```js
    test: {
      globals: true,
      environment: "node",
      include: ["tests/unit/**/*.test.{js,jsx}"],
    }
    ```
  - Execution Result:
    - Command: `npm test`
    - Outcome: **66 test files passed, 760 tests passed (100%) in 3.47s**.
    - Note: Because environment is `"node"`, tests interacting with DOM/window polyfill `globalThis.window` or `globalThis.CustomEvent`, or mock stores/i18n.
- **Design System Linter (`npm run lint:design`)**:
  - Command: `node scripts/check-design.mjs`
  - Enforces `Design.md` across JSX and CSS.
  - Checks:
    - Banned raw emojis in JSX (must use icons).
    - Prohibited arbitrary gradients (`bg-gradient-to-...`).
    - Disallowed CSS properties (inset box-shadow, non-standard transitions).
    - Shadow token ladder (`shadow-pop`, `shadow-menu`, `shadow-panel`).
    - Standard color hierarchy (`#0c0c0c` stage, `#18181b`/`#161616` surfaces, `#a7ffd4` mint accent, `#E5B2FF` lavender AI accent).
  - Execution Result:
    - Output: `design: clean — 799 file(s) match Design.md.` (0 violations).
- **Production Build (`npm run build`)**:
  - Command: `npm run copy:ort && npm run copy:canvaskit && vite build`
  - Execution Result:
    - Bundles ESM assets cleanly into `dist/` in 6.00s with 0 errors.
- **Deployment Script (`scripts/deploy-editor.sh`)**:
  - Strictly enforces `VOO_DEPLOY_TARGET=la`:
    ```bash
    TARGET="${VOO_DEPLOY_TARGET:-la}"
    if [ "$TARGET" != "la" ]; then
      echo "Error: Only 'la' (la.voo.run / 103.114.160.86) target is permitted!" >&2
      exit 1
    fi
    ```
  - Executes `npm run build`.
  - Deploys via rsync to `la` (`103.114.160.86`) at `/var/www/voo.run/editor/`.
  - Target server verification URL: `https://la.voo.run/editor/`.

---

## 2. Logic Chain

1. **Selection Context & Island Bar Coupling**:
   - `EditorContextualTaskbar` is mounted inside the main editor overlay.
   - When a node is selected, `extractNodeContext` parses geometry (`{x, y, width, height}`), kind (`frame`, `image`, `text`, `shape`), text content, and image URLs.
   - The user can either type an inline prompt into `EditorContextualAiInput` or click quick-action pills (`Remove BG`, `Auto Layout`, etc.).
   - Both pathways route to `dispatchToAgent()`, which writes to Zustand and dispatches `voo:agent-prompt` and `voo:open-agent-panel`.
   - `CanvasAgentPanel` subscribes to these window events, pops open, records the attached context badge (`@NodeName`), and starts the agent turn.
   - *Conclusion*: The Island Bar <-> Agent Panel dispatch flow is structurally sound and battle-tested by existing unit tests (`contextual_island.test.jsx`).

2. **Agent Panel & Local CLI Bridge Integration Need**:
   - Currently, `CanvasAgentPanel` communicates directly with HTTP SSE via `runAgentTurn` and `streamChatTurn`.
   - The user requirement (under ## 2026-10-21T02:46:27Z and 2026-10-21T02:49:26Z) demands connecting local CLI agents (Claude Code default, Codex, Antigravity) across Desktop Electron IPC and Web loopback WebSocket (`ws://127.0.0.1:4179`).
   - `src/shared/cli_bridge_protocol.js` and `src/shared/cli-agents.js` already define the protocols and agent metadata.
   - In voo-run (`/Volumes/TD/Projects/voo-run`), this is cleanly handled by `local_cli_bridge.js` providing `getLocalCliBridge()`, `ensureLocalCliBridge()`, and bridging IPC channels (`voo:codex-connect`, `voo:codex-advance`, `voo:cli-check-all`).
   - *Conclusion*: By introducing `local_cli_bridge.js` and wiring `provider_cli.js` into the agent panel turn loop, the panel will seamlessly stream responses and plan steps from Claude Code / Codex / Antigravity in both shells.

3. **Onboarding Guide Alignment**:
   - User update ## 2026-10-21T02:49:26Z requests: "直接复刻voo-run的引导界面样式，简化流程" (clone voo-run onboarding styling, simplify into 3 steps).
   - In `/Volumes/TD/Projects/voo-run/src/canvas/components/onboarding/`, the layout uses `OnboardingStepProgress.jsx` (sliding pill track), `OnboardingArt.jsx` (cover artwork), and a modal container (`rounded-3xl border border-white/10 bg-[#161616] shadow-panel`).
   - The flow can be streamlined into:
     - Step 1: Welcome & Agent Selection (defaulting to Claude Code `@anthropic-ai/claude-code`, toggle for Codex and Antigravity).
     - Step 2: Local Detection & Connection (live probe for binary/bridge, install instructions if missing, test probe).
     - Step 3: Ready & Enter Canvas (persist `voo.onboarding.completedVersion` in `settings.js`, close modal, focus editor).
   - *Conclusion*: Porting `OnboardingStepProgress`, `OnboardingArt`, and a streamlined 3-step `OnboardingGuide` will directly fulfill the requirement with zero `Design.md` violations.

4. **Transactional Safety for Canvas Edits**:
   - Agent tool execution modifies the canvas through the editor engine APIs (`window.__vooEditor`).
   - Every mutation method internally executes `commitEditorDocument(actionId, setDoc, nextDoc)`.
   - This records state snapshots into `editor_history_api.js`, providing native undo/redo history (`⌘Z` / `⇧⌘Z`).
   - *Conclusion*: No custom undo stack is required for the agent; adhering to `commitEditorDocument` guarantees 100% undo/redo fidelity.

---

## 3. Caveats

1. **Electron Preload & Headless Testing**:
   - Electron main and preload files (`electron/main.cjs`, `electron/preload.cjs`) run in Node/Electron runtime, not in Vite web build.
   - Tests in `tests/unit/` run in Vitest under `environment: "node"` and do not spin up full Electron windows. IPC channels must be unit-tested using mocked IPC objects (mirroring `tests/desktop_agent_bridge.test.js` in voo-run).
2. **Web Loopback Bridge Port**:
   - In Web browser mode, loopback WebSocket `ws://127.0.0.1:4179` connects to a locally running bridge process (`npm run bridge` / `cli_bridge_server.js`).
   - In automated headless CI environments without a running bridge, the bridge probe must gracefully report `cli.bridgeDisconnected` or offline status without throwing unhandled exceptions.
3. **Vitest DOM Polyfill Requirements**:
   - Since `vitest` runs in `environment: "node"`, any newly written tests for React components (`OnboardingGuide.jsx`, `CanvasAgentPanel.jsx`) must use `renderToStaticMarkup` or supply minimal DOM event polyfills (`CustomEvent`, `window.addEventListener`).

---

## 4. Conclusion & Recommended Plan

The VOO Design canvas architecture is in excellent health: 760/760 unit tests pass, `npm run lint:design` is 100% clean across 799 files, and production bundling is fast and error-free.

To complete the alignment with Pen App and local CLI agents:
1. **CLI Bridge Architecture**:
   - Port `src/canvas/components/agent-panel/local_cli_bridge.js` to support dual-channel connection (desktop `window.vooDesktop.localCli` + web `ws://127.0.0.1:4179`).
   - Expose `localCli` in `electron/preload.cjs` and handle channels (`voo:cli-check-all`, `voo:codex-connect`, `voo:codex-advance`, `voo:codex-cancel`) in `electron/main.cjs`.
   - Update `src/shared/cli-agents.js` so Claude Code (`claude-opus-5-5` / `@anthropic-ai/claude-code`) is the active default.
2. **Onboarding Guide (3-Step Streamlined Flow)**:
   - Port `OnboardingStepProgress.jsx`, `OnboardingArt.jsx`, and create `OnboardingGuide.jsx` in `src/canvas/components/onboarding/`.
   - Implement the 3 steps: (1) Agent Selection (Claude Code default), (2) Local Detection & Connection Probe, (3) Enter Canvas.
   - Wire onboarding trigger into `App.jsx` on first launch (persisting completion in `settings.js` under `voo.onboarding.completedVersion`).
3. **Agent Panel & Tool Dispatch**:
   - Connect `canvas_agent_panel.jsx` to the active CLI provider via `local_cli_bridge`.
   - Support streaming thought tokens, plan steps, and executing node mutations with `commitEditorDocument`.

---

## 5. Enumerated Test Suite Requirements

To achieve 100% test coverage and ensure zero regressions, the following test suites must be implemented/extended in `tests/unit/`:

### Suite 1: CLI Bridge Protocol Tests (`tests/unit/cli_bridge_protocol.test.js`)
- [ ] **Frame encoding & decoding**: Verify JSON frame parsing for `INVOKE`, `RESULT`, and `EVENT` message types per `cli_bridge_protocol.js`.
- [ ] **Channel routing**: Test invocation of `voo:cli-check-all`, `voo:codex-connect`, `voo:codex-advance`, and `voo:codex-cancel`.
- [ ] **Event streaming**: Verify `voo:codex-text` listener receives streamed text chunks and tool events.
- [ ] **Disconnection & Error handling**: Verify graceful rejection with `cli.bridgeDisconnected` when socket closes or connection fails.
- [ ] **Lazy dial policy**: Verify `dial: false` returns null without opening a socket, while `dial: true` attempts connection.

### Suite 2: Provider Registry & Local CLI Provider Tests (`tests/unit/provider_cli_registry.test.js`)
- [ ] **Default Agent Selection**: Verify `CLI_AGENTS` defaults to Claude Code (`id: "claude"`, model: `claude-opus-5-5`).
- [ ] **Model ID parsing**: Verify `parseCliModelId("claude:claude-opus-5-5")` and `parseCliModelId("codex:gpt-4o")` correctly split `cliId` and `model`.
- [ ] **Provider Config check**: Verify `getProviderConfig()` honestly reports availability based on bridge presence (`cliBridgeAvailable()`).
- [ ] **Job submission & fetch**: Verify `submitProviderJob` and `fetchProviderJob` handle text jobs and return expected task structures.
- [ ] **Antigravity experimental flag**: Verify `isAntigravityOptedIn()` and `getVisibleCliAgents()` hide Antigravity by default and reveal it when enabled.

### Suite 3: Onboarding State & 3-Step Wizard Tests (`tests/unit/onboarding_guide.test.jsx`)
- [ ] **First-launch gating**: Verify onboarding modal opens when `voo.onboarding.completedVersion` is absent, and stays closed when present.
- [ ] **Step indicator progression**: Verify `OnboardingStepProgress` renders exact slot counts and updates `aria-valuenow` and progress width.
- [ ] **Step 1 (Agent Selection)**: Verify Claude Code is pre-selected by default; switching to Codex or Antigravity updates state.
- [ ] **Step 2 (Local Detection Probe)**: Verify detection status indicator renders connected / missing binary states and displays correct install commands (`npm install -g @anthropic-ai/claude-code`).
- [ ] **Step 3 (Completion & Persistence)**: Verify clicking "Enter Canvas" saves `voo.onboarding.completedVersion`, sets chosen agent route, and closes the modal.
- [ ] **Skip & Re-open**: Verify clicking "Skip" or close button marks onboarding complete, and can be re-triggered from header/settings.

### Suite 4: Agent Panel & Contextual Island Dispatch Tests (`tests/unit/agent_panel_dispatch.test.jsx`)
- [ ] **Selection context extraction**: Verify `extractNodeContext` accurately extracts geometry, type, image URL, and text from Frame, Image, Text, and Shape nodes.
- [ ] **Event dispatch & panel expansion**: Verify submitting from Island Bar fires `voo:agent-prompt` and opens `CanvasAgentPanel`.
- [ ] **Context badge & detachment**: Verify `CanvasAgentPanel` renders context badge (e.g. `@Frame 1`), and clicking `✕` detaches context.
- [ ] **Tool call card status rendering**: Verify `ToolCallCard` displays correct status indicators (`…`, `✓`, `✗`) for `in_progress`, `completed`, and `failed`.
- [ ] **Undo/Redo transactional integrity**: Verify agent tool modifications go through `commitEditorDocument` and can be undone via `editor.undo()`.

---

## 6. Verification Method

1. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   *Expected*: All 66+ test files pass 100% with zero failures.

2. **Run Design System Linter**:
   ```bash
   npm run lint:design
   ```
   *Expected*: Zero violations reported; 100% compliance with `Design.md`.

3. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Expected*: Vite builds `dist/` cleanly with 0 TypeScript/bundler errors.

4. **Verify Target Deployment Configuration**:
   ```bash
   grep -n "VOO_DEPLOY_TARGET" scripts/deploy-editor.sh
   ```
   *Expected*: Script requires `VOO_DEPLOY_TARGET=la` and deploys to `/var/www/voo.run/editor/` on `la` (`103.114.160.86`).
