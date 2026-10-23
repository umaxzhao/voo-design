# Survey Report: Right-Side Agent Panel (`CanvasAgentPanel`) & Context Dispatch Co-ordination

## 1. Observation

### 1.1 Existing Agent Panel Architecture
- **Component Path**: `src/canvas/components/canvas_agent_panel.jsx` (363 lines)
- **Props**: Receives only `{ onClose }` (`CanvasAgentPanel.propTypes = { onClose: PropTypes.func }`, lines 59, 360-362).
- **Internal State**:
  - `sessions`: Stored and loaded from localStorage (`voo_design_agent_sessions_v1`) via `loadStoredSessions()` in `src/canvas/agent/session_history.js` (lines 6, 23-34).
  - `activeId`: Active session identifier (`session_${Date.now()}_...`).
  - `transcript`: Array of turn items: `{ kind: "text", role: "user" | "assistant", content }` and `{ kind: "tool", call: { id, name, arguments, status, result, error } }` (lines 63, 120-126, 137, 155).
  - `input`: Current composer textarea string (line 64).
  - `streamingText`: Live streaming token chunks (line 65).
  - `busy`: Boolean indicating turn execution lock (line 66).
  - `error`: Null or string `"notConfigured"` / `"failed"` (lines 67, 170).
  - `historyOpen`: Boolean controlling saved session history drawer (lines 68, 226-261).
- **Execution Pipeline**:
  - Submitting input calls `send()` (lines 128-177):
    ```javascript
    const reply = await runAgentTurn({
      config: {
        apiKey: getSetting(AGENT_SETTING.API_KEY),
        baseUrl: getSetting(AGENT_SETTING.BASE_URL),
        model: getSetting(AGENT_SETTING.MODEL),
      },
      maxSteps: Number(getSetting(AGENT_SETTING.MAX_STEPS)) || AGENT_DEFAULTS.maxSteps,
      styleNote: getSetting(AGENT_SETTING.STYLE_NOTE) ?? AGENT_DEFAULTS.styleNote,
      history: historyRef.current,
      userText: text,
      tools: CANVAS_TOOL_SCHEMAS,
      executeTool: executeCanvasTool,
      onText: setStreamingText,
      onToolEvent: updateToolItem,
    });
    ```
  - `runAgentTurn` in `src/canvas/agent/canvas_agent.js` (lines 25-84) executes a multi-step OpenAI function-calling loop via `streamChatTurn` (`src/canvas/agent/chat_stream.js`).
  - `executeCanvasTool` in `src/canvas/agent/canvas_tools.js` (lines 124-128) maps tool calls onto `generateImage` and `describeSelection`, accessing the editor instance via `window.__vooEditor`.
  - Tool calls are displayed using `<ToolCallCard call={item.call} />` (`src/canvas/components/tool_call_card.jsx`).

### 1.2 Panel Visibility & Mounting State
- **File**: `src/App.jsx`
  - Lines 14-15: Panel visibility is managed via local React state:
    ```javascript
    // The AI panel starts collapsed; the floating VOO button opens it.
    const [agentOpen, setAgentOpen] = useState(false);
    ```
  - Lines 69: `<ImageEditor visible={true} agentVisible={false} />` (hardcoded to `false` in `App.jsx`, despite `ImageEditor` supporting `agentVisible`).
  - Lines 80-84: The panel is conditionally mounted:
    ```jsx
    {agentOpen && !welcomeOpen && (
      <aside className="flex w-[376px] shrink-0 flex-col py-3 pr-3">
        <CanvasAgentPanel onClose={() => setAgentOpen(false)} />
      </aside>
    )}
    ```
  - Lines 86-98: The floating trigger button (`.voo-ai-fab`) is rendered only when `!agentOpen && !welcomeOpen`.
- **Finding**: Because `CanvasAgentPanel` is unmounted when `agentOpen === false`, any ephemeral event emitted to component-level listeners while the panel is closed will be dropped. Neither `useDesignStore` nor `EditorContextualTaskBar` currently has access to `agentOpen` or `setAgentOpen`.

### 1.3 Floating Taskbar Architecture (`EditorContextualTaskBar`)
- **Component Path**: `src/canvas/components/editor_contextual_taskbar.jsx` (1011 lines).
- **Mounted In**: `src/canvas/components/editor_page.jsx`:
  - Line 954: In single-page mode, mounted in `editor-page-toolbar` at `top: calc(100% + 8px)`.
  - Line 1168: In multi-artboard free mode, positioned at `left: docRect.x + docRect.width / 2`, `top: docRect.y + docRect.height + EDITOR_PAGE_TOOLBAR_GAP`.
- **Current Taskbar Capabilities**:
  - Selection Tool Shortcuts (Marquee M, Lasso L, lines 174-231).
  - Context 0: Transform Selection (lines 234-261).
  - Context 1: Pixel Selection (Repaint, Transform, Invert, Deselect, lines 262-306).
  - Context 2: Vector Boolean Combine (Union, Subtract, Intersect, Exclude + Align + Group + Delete, lines 307-393).
  - Context 3: Multi-layer Selection Align (Left, Center, Right, Top, Middle, Bottom + Group + Delete, lines 394-488).
  - Context 4: Pen / Path Editing (Finish, Delete Anchor, Flip H, Duplicate, Delete, lines 489-550).
  - Context 5: Single Shape (Flip H/V, Duplicate, Lock, Delete, Edit SVG, Create Component, lines 551-620).
  - Context 6: Single Text (Duplicate, Lock, Delete, lines 621-675).
  - Context 7: Single Image (One-Click Matting, Local Repaint, 2X/4X Upscale, Outpaint, Adjustments, More, lines 681-940).
- **Current Taskbar Styling**:
  - Line 169: `rounded-lg bg-neutral-900/95 p-0.5 backdrop-blur-md whitespace-nowrap font-mono text-[11px] text-neutral-200 select-none`.
- **Identified Gaps against Pen App Style**:
  1. No AI prompt quick-input field (`<input type="text" placeholder="..." />`).
  2. No quick-action triggers for Frame/Artboard selection (e.g., Layout Generation, Edit Copy, Style Transfer).
  3. Lacks Pen App's rounded island aesthetic (`rounded-full` / `rounded-2xl`, `#18181b` card surface, emerald/mint `#a7ffd4` accents, border glow).
  4. Zero coordination/dispatch logic with `CanvasAgentPanel`.

### 1.4 Existing Event Bus & Command Bridge Infrastructure
- **Agent Panel Bus**: `src/canvas/store/agent_panel_bus.js`
  - Defines `LAYOUT_EVENT` (`START`, `THINKING`, `STAGE`, `DECISION`, `PALETTE`, `CRITIQUE`, `DONE`, `ERROR`).
  - Implements `subscribeAgentPanel(listener)` and `emitAgentPanelEvent(type, payload = {})`.
  - Currently used only by `layout_action_review.js`; not yet connected to `CanvasAgentPanel`.
- **Editor Command Bridge**: `src/canvas/editor/editor_command_bridge.js`
  - Created in `src/canvas/use_editor_engine.js` (lines 130-139).
  - Offers `executeStep(command)` and `executeTransaction(commands, txOptions)` with transaction rollback and standardized receipts (`createCommandReceipt`).
  - Command table (`src/canvas/editor/command_table.js` & `command_table/implementations_part1.js`, line 76) exposes `get_editor_context`, `select_region`, `repaint_selection`, `fill_selection`, `refine_selection`.
- **Global State Store**: `src/store/design_store.js`
  - Manages `nodes`, `editingNodeId`, `editingNodeIds`, `welcomeOpen`, `documentLoading`, `editorCamera`, `editorArtboardLayouts`, `isDirty`.

---

## 2. Logic Chain

### 2.1 State Lifting for Panel Visibility
1. `CanvasAgentPanel` visibility is currently trapped in `App.jsx` local state (`[agentOpen, setAgentOpen] = useState(false)`).
2. The bottom taskbar (`EditorContextualTaskBar`) lives deep inside `ImageEditor -> EditorPage`.
3. To allow bottom taskbar submissions or clicks to reveal the right-side panel without prop drilling through 4 component layers:
   - `agentOpen` and controlling actions (`openAgentPanel`, `closeAgentPanel`, `setAgentOpen`) must be moved to `useDesignStore` (`src/store/design_store.js`).
   - `App.jsx` reads `agentOpen` from `useDesignStore`.
   - `ImageEditor` receives `agentVisible={agentOpen}` so layout docking (`right-[376px]` vs `right-0`) synchronizes cleanly.

### 2.2 Lifecycle-Safe Context Dispatch Mechanism
1. When the user interacts with the bottom taskbar, `CanvasAgentPanel` may be closed (`agentOpen === false`) and thus completely unmounted.
2. A purely transient event bus emission (`emitAgentPanelEvent`) would fail because an unmounted component has no active listeners.
3. Therefore, dispatch coordination requires a two-pronged mechanism:
   - **Store Buffer**: `useDesignStore` holds `pendingAgentDispatch` (`{ prompt, intent, context, autoSend, timestamp }`) and `agentActiveContext` (`{ nodeId, layerType, name, dimensions, imageAsset, textContent, badge }`).
   - Calling `dispatchToAgent(payload)` atomically sets `agentOpen: true` AND `pendingAgentDispatch: payload`.
   - When `CanvasAgentPanel` mounts (or renders if already open), an effect consumes `pendingAgentDispatch`, displays the reference pill (e.g. `@Frame 1`), updates the input, triggers `send()` if `autoSend: true`, and clears the pending dispatch.
   - **Real-Time Stream**: For already-mounted panels, `agent_panel_bus.js` emits `agent.dispatch` simultaneously.

### 2.3 Selection Context Capture
From `engine` and `selected` node (or `doc` when an artboard/frame is selected):
- If `selected` exists:
  - `nodeId`: `selected.id`
  - `layerType`: `selected.kind` (`"image"`, `"text"`, `"rect"`, `"path"`, `"boolean"`, `"group"`, etc.)
  - `name`: `selected.name` || `describeNode(selected)`
  - `dimensions`: `{ width: selected.width, height: selected.height, x: selected.x, y: selected.y }`
  - `imageAsset`: If `selected.kind === "image"`, extract `selected.imageId || selected.src` or fallback to `engine.exportNodePng(selected.id)`.
  - `textContent`: If `selected.kind === "text"`, extract `selected.text`.
  - `badge`: `@${name}` (e.g. `@Hero Image`, `@Heading`)
- If no node is selected or artboard is focused:
  - `nodeId`: `frame-${doc.id || "page"}`
  - `layerType`: `"frame"`
  - `name`: `doc.title || doc.label || "Frame 1"`
  - `dimensions`: `{ width: doc.width, height: doc.height, x: 0, y: 0 }`
  - `badge`: `@${doc.title || doc.label || "Frame 1"}`

### 2.4 Pen App Island Styling & Layout Adaptation
1. `EditorContextualTaskBar` requires a Pen App aesthetic redesign:
   - Outer container: `rounded-full` (or `rounded-2xl`), `bg-[#18181b]/95`, `backdrop-blur-md`, `border border-white/10`, `shadow-panel`, with emerald `#a7ffd4` glow accents.
   - Embedded AI Prompt Input:
     - Left VOO AI icon trigger.
     - Text input field (`h-7`, `text-[11px]`, transparent background, neutral-300 text).
     - Enter key or circular send button to submit.
   - Quick Action Chips:
     - For Image: [Remove BG] [Outpaint] [Vectorize] [Style Transfer]
     - For Frame/Artboard: [Generate Layout] [Edit Copy] [Style Transfer]
     - For Text: [Rewrite / Edit Copy] [Translate]
     - For Shapes: [Vectorize] [Convert to Component]
2. Position:
   - Floats anchored to the bottom center of the selection or bottom of viewport, remaining accessible across zoom levels.

### 2.5 Side Panel Elevation (Pen App Stream & Plan Cards)
1. Header:
   - Model name badge (e.g., `GPT-6 Astra`) + Active status pill:
     - `● Idle` (emerald `#a7ffd4`)
     - `● Thinking...` (pulsing `#E5B2FF`)
     - `● Executing...` (blue `#93c5fd`)
2. Context Attachment Badge:
   - Pill badge below header or above composer: `[@Frame 1 ✕]` with a quick dismiss button to unbind the active reference.
3. Plan Stream & Execution Cards:
   - Replace raw text with structured cards:
     - Thinking / Reasoning card (`LAYOUT_EVENT.THINKING` / stream tokens).
     - Action plan card (`Phase 1: Analysis`, `Phase 2: Execution`).
     - Enhanced `ToolCallCard` (`Phase 3: Tool Execution`).
     - Confirmation / Undo chip (`Phase 4: Done`).

---

## 3. Caveats
1. **Window / Engine Availability**: `window.__vooEditor` is populated in single editor mode or when `?voo-test=1` is passed. In multi-artboard canvas mode, engines are tracked in `window.__vooEditors[nodeId]`. Context extraction must use the scoped `engine` prop passed into `EditorPage` / `EditorContextualTaskBar` rather than relying solely on global `window.__vooEditor`.
2. **Exporting Node PNG Asynchronously**: If `imageAsset` requires `engine.exportNodePng(selectedId)`, this can be asynchronous. Fast dispatch should use `selected.imageId || selected.src` immediately and allow the agent tool execution pipeline to call `describe_selection` / `exportNodePng` on demand.
3. **Design Tokens Compliance**: Changes must strictly adhere to `design/tokens.cjs` (`SURFACE.panel = "#171717"`, `SURFACE.card = "#262626"`, `SHADOW.panel`, `RADIUS.full` / `RADIUS['2xl']`, type scale 9, 10, 11, 12, 15) so that `npm run lint:design` remains 100% clean (0 violations).

---

## 4. Conclusion
1. **Panel Visibility State**: `agentOpen` must be lifted from `src/App.jsx` into `src/store/design_store.js` (`agentOpen`, `setAgentOpen`, `openAgentPanel`, `closeAgentPanel`).
2. **Context Dispatch Pipeline**: Add `agentActiveContext` and `pendingAgentDispatch` to `useDesignStore`, supplemented by `emitAgentPanelEvent` in `src/canvas/store/agent_panel_bus.js`. This prevents dropped events when the panel is closed.
3. **Bottom Contextual Taskbar (`EditorContextualTaskBar`)**:
   - Upgrade styling to Pen App rounded island (`rounded-full` / `rounded-2xl`, `#18181b` surface, `border border-white/10`, `shadow-panel`).
   - Integrate a compact AI prompt input with quick submit.
   - Add contextual AI tool triggers for Frame, Image, Text, and Shape nodes.
   - On submission or tool click: package selected node/frame context, dispatch to store/bus, and call `openAgentPanel()`.
4. **Right-Side Agent Panel (`CanvasAgentPanel`)**:
   - Consume `pendingAgentDispatch` on mount/update.
   - Display active context badge (`@Frame 1`, `@Image`) with detach action.
   - Upgrade header with active model pill and status indicator (`● Thinking`, `● Executing`, `● Idle`).
   - Support step-by-step plan execution stream cards.

---

## 5. Verification Method

### 5.1 Unit Tests Execution
Run the complete Vitest test suite to confirm zero regressions:
```bash
npm test
```
*Expected Result*: All 62 test files and 697+ unit tests pass.

### 5.2 Design Tokens Verification
Verify zero design token violations against `Design.md`:
```bash
npm run lint:design
```
*Expected Result*: `design: clean — 798 file(s) match Design.md.`

### 5.3 Production Build Verification
Verify production bundling:
```bash
npm run build
```
*Expected Result*: Build completes cleanly without TypeScript, JSX, or Vite bundle errors.

### 5.4 Functional Dispatch Verification Scenarios
1. **Closed Panel Reveal**:
   - Mount editor with `agentOpen = false`.
   - Select an image node; verify bottom island displays prompt input and AI action chips.
   - Enter `"Make this image pop"` and submit (or click `"Remove Background"`).
   - Verify `agentOpen` becomes `true`, right-side panel mounts, displays `@Image` reference badge, and populates the active turn.
2. **Frame Selection Context**:
   - Click artboard background / frame header.
   - Verify bottom island displays `@Frame 1` context and actions (`Generate Layout`, `Edit Copy`).
   - Submit prompt; verify frame bounds (`{ width, height }`) and node ID are dispatched.
