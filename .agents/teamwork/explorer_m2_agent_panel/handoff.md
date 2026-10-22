# Handoff Report: Investigation of Requirements R2, R3, and R4 (Agent Panel, Context Dispatch, Canvas Engine Sync)

**Author**: Explorer Subagent (Agent Panel Explorer)  
**Date**: 2026-10-21  
**Milestones Covered**: M2 (Context Dispatch & Side Panel Alignment), M3 (Canvas Engine Sync & Safety)  
**Parent Orchestrator**: `a1081093-4900-47ba-94b2-dda2d1dd5880`  

---

## 1. Observation

### Obs 1. Context Dispatch in Contextual Taskbar and Store Disconnect (R2)
- In `src/canvas/components/editor_contextual_taskbar.jsx`:
  - Line 2: `import { memo, useEffect, useMemo, useRef, useState } from "react";`
  - Line 129: `const handleAiDispatch = useCallback(...)` — **`useCallback` is used but never imported from `"react"`**, causing runtime crash:
    `ReferenceError: useCallback is not defined`
    when rendering `EditorContextualTaskBar`.
  - Lines 149-164:
    ```javascript
    window.dispatchEvent(
      new CustomEvent("voo:open-agent-panel", { detail: { context } })
    );
    if (promptText) {
      window.dispatchEvent(
        new CustomEvent("voo:agent-prompt", {
          detail: { prompt: promptText, context },
        })
      );
    }
    ```
- In `src/store/design_store.js`:
  - Lines 26-50: The store does NOT contain `agentPanelOpen`, `setAgentPanelOpen`, `pendingAgentIntent`, or `dispatchAgentIntent`.
  - In `src/App.jsx`:
    - Line 15: `const [agentOpen, setAgentOpen] = useState(false);` (local React state, disconnected from `design_store`).
    - Lines 20-23: Listens to `"voo:open-agent-panel"` and `"voo:agent-prompt"` to set `agentOpen(true)`.
  - In `SCOPE.md` (Interface Contract 1, lines 54-63):
    - Requirement specifies:
      ```javascript
      useDesignStore.getState().dispatchAgentIntent({
        prompt: string,
        action: string, // e.g. 'expand' | 'style_transfer' | 'remove_bg' | 'vectorize' | 'edit_copy' | 'custom'
        node: { id: string, kind: string, title?: string, width: number, height: number, ... }
      });
      ```
      and that `dispatchAgentIntent` sets `agentPanelOpen` to `true`.

### Obs 2. Pen App Aesthetic & Plan Stream Alignment (R3)
- In `src/canvas/components/canvas_agent_panel.jsx`:
  - Lines 250-254: Active model pill exists:
    ```jsx
    <div className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-neutral-300">
      <span className="size-1.5 rounded-full bg-[#a7ffd4] animate-pulse" aria-hidden="true" />
      <span className="font-mono text-[9px] text-neutral-300 max-w-[80px] truncate">{modelName || "Flash"}</span>
      <span className="text-[9px] text-[#a7ffd4] uppercase tracking-wider font-semibold">Active</span>
    </div>
    ```
  - Lines 371-394: Active context pill above composer exists:
    ```jsx
    <div className="flex items-center gap-1.5 px-4 pt-1 pb-1">
      <span data-testid="agent-context-badge" className="flex items-center gap-1 rounded-md bg-[#a7ffd4]/15 px-2 py-0.5 text-[10px] font-mono text-[#a7ffd4]">
        <span>@{activeContext.name || activeContext.kind}</span>
        <button type="button" data-testid="agent-context-detach" onClick={() => setActiveContext(null)} ...>✕</button>
      </span>
      ...
    </div>
    ```
  - Lines 351-355: User message bubble renders `{item.contextBadge}`.
  - Lines 336-366: Transcript currently renders only raw `ToolCallCard` and a single pulsing dot with `streamingText`.
  - **Missing**: The 4-phase step-by-step Plan Execution Stream (Thinking / Planning / Executing / Done) as required by R3 and Acceptance Criteria:
    - No structured turn status state machine (`turnStatus: "thinking" | "planning" | "executing" | "done"`).
    - No multi-step checklist visualization for planned vs executed actions.
    - No live diff confirmation card showing node modifications with instant undo trigger.

### Obs 3. Canvas Engine Sync & Safety (R4)
- In `src/canvas/editor/command_table/receipt.js`:
  - Lines 123-157: `captureTransactionBaseline(engine)` captures full document snapshot (`docSnapshot`), `historyIndex`, `pixelSelectionSnapshot`, `activeTool`, and `selectedIds`.
  - Lines 166-249: `rollbackTransaction(engine, baseline)` completely restores the baseline document snapshot, dimensions, pixel selection, tool, and selected node IDs, guaranteeing 100% snapshot restoration without corrupting history.
  - Lines 263-330: `executeTransactionPipeline(engine, commands, options)` implements multi-step transaction execution with automatic rollback on error.
- In `src/canvas/editor/editor_engine.js`:
  - Lines 436-452: History methods from `ctrl.historyApi` (`canUndo`, `canRedo`, `commit`, `undo`, `redo`, `isDirty`, `markApplied`) are spread onto the public engine `api`.
  - **Missing**: `editor.transaction(name, fn)` is not yet directly exposed as a top-level method on the engine instance.
  - Agent operations in `canvas_tools.js` currently only call `placeImageInEditor` directly, without wrapping in an atomic transaction or preserving node selection.

### Obs 4. Test Infrastructure
- `npm test -- tests/unit/single_canvas_integration.test.js`: Passes 11/11 tests (1.68s duration).
- `npm run lint:design`: Clean across all 799 files.
- `npm test -- tests/unit/pen_hybrid_agent.test.jsx`: 4 failed, 1 passed due to:
  1. `ReferenceError: useCallback is not defined` at `editor_contextual_taskbar.jsx:129`.
  2. `ReferenceError: window is not defined` in `pen_hybrid_agent.test.jsx:116` (vitest environment is `"node"` per `vite.config.js:24`).

---

## 2. Logic Chain

1. **Context Dispatch (R2)**:
   - When user interacts with the contextual taskbar (`editor_contextual_taskbar.jsx`), the selected node metadata must flow cleanly into the agent subsystem.
   - Relying solely on `window.dispatchEvent` couples the UI to DOM presence and makes headless/state testing fragile.
   - By adding `agentPanelOpen`, `setAgentPanelOpen`, `pendingAgentIntent`, and `dispatchAgentIntent` to `useDesignStore` (Contract 1):
     - The taskbar calls `dispatchAgentIntent({ prompt, action, node })`.
     - The store automatically sets `agentPanelOpen: true`.
     - `App.jsx` reads `agentPanelOpen` from `useDesignStore`, revealing `CanvasAgentPanel`.
     - `CanvasAgentPanel` subscribes to `pendingAgentIntent`, attaches the node context badge `@<Node>`, and triggers the turn.
     - Dual-dispatching `voo:agent-prompt` preserves backwards compatibility with existing event listeners.

2. **Pen App Aesthetic & Plan Stream Alignment (R3)**:
   - Pen App's agent experience is characterized by high transparency of agent cognition:
     - Header pill: confirms active model (`Flash`, `Claude`, `GPT-4o`) and readiness (`ACTIVE`).
     - Context badges: displays what node `@<Name>` the agent is currently looking at or mutating.
     - Plan stream execution cards: breaks down the turn into 4 distinct visual states:
       - **Thinking**: Agent is analyzing user prompt and canvas node geometry/style. Pulsing glow indicator.
       - **Planning**: Agent generates structured step plan (e.g. 1. Inspect hierarchy, 2. Resize frame, 3. Apply auto-layout properties).
       - **Executing**: Agent executes canvas tool / transaction, showing current step and progress.
       - **Done**: Execution completes successfully. Shows diff summary ("Updated 1 frame") and provides an interactive "Undo" button that calls `editor.undo()`.
   - Creating a structured `AgentPlanCard` component or embedding this state in `canvas_agent_panel.jsx` delivers 100% compliance with R3 and the Acceptance Criteria.

3. **Canvas Engine Bidirectional Sync & Safety (R4)**:
   - The canvas engine uses Skia and WebGL with an internal document representation (`sceneDoc`).
   - If an agent mutates the document halfway and fails (e.g. API timeout, invalid dimensions), the canvas must not remain in a half-mutated dirty state.
   - `captureTransactionBaseline` and `rollbackTransaction` in `src/canvas/editor/command_table/receipt.js` already implement clean document snapshot restoration without polluting `editor_history`.
   - By exposing `editor.transaction(name, async (tx) => { ... })` on `editor_engine.js`:
     1. Baseline snapshot is captured.
     2. Mutations are executed against the engine.
     3. If successful: `engine.commit(name)` is called once, creating a single atomic undo entry. `engine.requestRender()` and `engine.notify()` are called.
     4. If an exception occurs: `rollbackTransaction(engine, baseline)` cleanly restores the document snapshot, dimensions, tool, and selection. No bogus undo history entry is created, and canvas re-renders cleanly.
     5. User undo (`⌘Z`) cleanly reverts all operations executed in that transaction in one step.

---

## 3. Caveats

- **No Caveats on Feasibility**: All required primitives exist in the repository (`receipt.js`, `command_table`, `design_store`, `canvas_agent_panel`).
- **Vitest Environment**: `vite.config.js` sets `environment: "node"`. Tests asserting DOM event dispatching or component markup must ensure `globalThis.window` is appropriately mocked or use standard React server rendering (`renderToStaticMarkup`).

---

## 4. Conclusion

The exact implementation blueprint for R2, R3, and R4 is structured across three core modules:

### Module 1: `src/store/design_store.js` & `src/App.jsx` (R2)
1. In `src/store/design_store.js`:
   - Add state properties:
     ```javascript
     agentPanelOpen: false,
     pendingAgentIntent: null,
     ```
   - Add actions:
     ```javascript
     setAgentPanelOpen: (agentPanelOpen) => set({ agentPanelOpen }),
     dispatchAgentIntent: ({ prompt, action = "custom", node = null }) => {
       set({
         agentPanelOpen: true,
         pendingAgentIntent: { prompt, action, node, timestamp: Date.now() },
       });
     },
     clearPendingAgentIntent: () => set({ pendingAgentIntent: null }),
     ```
2. In `src/App.jsx`:
   - Replace `const [agentOpen, setAgentOpen] = useState(false);` with:
     ```javascript
     const agentOpen = useDesignStore((s) => s.agentPanelOpen);
     const setAgentOpen = useDesignStore((s) => s.setAgentPanelOpen);
     ```
   - Keep the `voo:open-agent-panel` listener calling `setAgentOpen(true)`.

### Module 2: `src/canvas/components/editor_contextual_taskbar.jsx` & `src/canvas/components/canvas_agent_panel.jsx` (R2 & R3)
1. In `src/canvas/components/editor_contextual_taskbar.jsx`:
   - Fix import on line 2: add `useCallback` to `import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";`.
   - In `handleAiDispatch(customPrompt)`:
     - Read selected node metadata (`id`, `name`/`label`, `kind`, `width`, `height`, `text`, `url`).
     - Call `useDesignStore.getState().dispatchAgentIntent({ prompt: promptText, action, node: context })`.
     - Also dispatch `voo:agent-prompt` and `voo:open-agent-panel` for DOM listeners.
2. In `src/canvas/components/canvas_agent_panel.jsx`:
   - Subscribe to `useDesignStore((s) => s.pendingAgentIntent)` and clear upon consumption.
   - Introduce `turnState`: `'idle' | 'thinking' | 'planning' | 'executing' | 'done'`.
   - Render the Plan Execution Card:
     - Header: Active model pill (`modelName` + pulsing green dot + `ACTIVE`).
     - Context attachment pill: `@${activeContext.name}` with dimensions and `✕` detach button.
     - Step cards:
       - `thinking`: Pulsing animation with reasoning / typing stream.
       - `planning`: Numbered step breakdown.
       - `executing`: Active tool with spinner and target node badge.
       - `done`: Checkmark, summary, and "Undo" shortcut (`editor.undo()`).

### Module 3: `src/canvas/editor/editor_engine.js` (R4)
1. Import `captureTransactionBaseline` and `rollbackTransaction` from `./command_table/receipt.js`.
2. In `createEditor`:
   - Add `api.transaction = async (name, fn) => { ... }`:
     ```javascript
     transaction: async (name, fn) => {
       const label = typeof name === "string" ? name : "editor.transaction";
       const executor = typeof name === "function" ? name : fn;
       if (typeof executor !== "function") throw new TypeError("Transaction function required");

       const baseline = captureTransactionBaseline(api);
       try {
         const result = await executor(api);
         api.commit(label);
         api.requestRender();
         api.notify();
         return { success: true, result };
       } catch (err) {
         await rollbackTransaction(api, baseline);
         api.requestRender();
         api.notify();
         throw err;
       }
     },
     ```
3. Expose `window.__vooEditor = api` (already done in `use_editor_engine.js`).
4. Ensure selection and dirty flags remain 100% consistent after transaction commit or rollback.

---

## 5. Verification Method

1. **Unit Testing**:
   - Fix `useCallback` import in `editor_contextual_taskbar.jsx`.
   - Run vitest suite:
     ```bash
     npm test -- tests/unit/pen_hybrid_agent.test.jsx
     ```
     Verify that:
     - Contextual taskbar renders AI island, sparkle button, and quick actions (`Vectorize`, `Polish`, `Auto Layout`).
     - Submitting prompt dispatches intent and context payload.
     - `CanvasAgentPanel` renders model status pill, context attachment badge, and plan stream cards.
   - Run full regression suite:
     ```bash
     npm test
     ```
     Ensure 100% test passing across all existing unit tests.

2. **Design System & Linter**:
     ```bash
     npm run lint:design
     ```
     Ensure 0 violations against `Design.md`.

3. **Build Check**:
     ```bash
     npm run build
     ```
     Ensure Vite build completes cleanly with no errors.

4. **Invalidation Conditions**:
   - Any commit to the undo stack during a failed transaction indicates rollback leakage.
   - Inability of `CanvasAgentPanel` to receive selection context without manual opening indicates broken intent coordination.
