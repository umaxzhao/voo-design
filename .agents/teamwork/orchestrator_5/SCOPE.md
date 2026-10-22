# Scope: Pen App Hybrid Agent Architecture & Test Fixes

## Architecture
VOO Design's Agent interaction architecture aligns with Pen App's hybrid model:
1. **Contextual Selection Island Bar (`src/canvas/components/editor_contextual_taskbar.jsx`)**:
   - Bottom floating island bar rendered when any canvas object (Frame, Image, Text, Shape) is selected.
   - Compact rounded-island styling (`rounded-full` / `rounded-2xl`, `#18181b` / `#111111` dark surface, border glow, `#a7ffd4` mint accents).
   - Embedded AI prompt quick-input field (`Enter` to submit) alongside contextual AI action buttons (Expand / Outpaint, Style Transfer, Remove Background, Vectorize, Edit Copy / Layout).
2. **Context Dispatch & Session Coordination (`src/store/design_store.js` & `src/canvas/components/canvas_agent_panel.jsx`)**:
   - Submitting a prompt or clicking an AI quick-action captures selected node context (ID, layer type, dimensions, image data / text).
   - Automatically opens/expands the right-side `CanvasAgentPanel` and dispatches the prompt with attached context pill.
3. **Pen App Aesthetic & Plan Stream in Side Panel (`src/canvas/components/canvas_agent_panel.jsx`)**:
   - Header with active model pill and status indicator.
   - Context attachment badges (e.g., `@Frame 1`, `@Image`) showing what the agent is currently acting on.
   - Step-by-step plan execution cards (plan generation, executing action, diff/update confirmation, completion state).
4. **Canvas Engine Bidirectional Sync & Safety**:
   - Agent tool actions apply modifications via atomic commands with full undo/redo history preservation and selection stability.
5. **Regression Fixes (`tests/unit/single_canvas_integration.test.js`)**:
   - Fix M3.1 and M3.2 hook execution / test render setup.
   - Fix M3.6 bare `window` reference in node test environment.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Fix single_canvas_integration regressions | Resolve M3.1, M3.2 (useState null error) and M3.6 (window reference error) | M0 | Victory Audit Report |
| 2 | Selection Floating Island Bar (Pen Style) | Sleek bottom floating taskbar with dark glassmorphism and rounded island styling | M1 | ORIGINAL_REQUEST § R1 |
| 3 | Embedded AI Quick Prompt Input | In-island input field with placeholder and submit button/Enter key handler | M1 | ORIGINAL_REQUEST § R1 |
| 4 | Contextual Quick Action Buttons | Icon buttons for Expand/Outpaint, Style Transfer, Remove Background, Vectorize, Edit Copy | M1 | ORIGINAL_REQUEST § R1 |
| 5 | Context Capture & Dispatch | Captures node metadata and dispatches intent into Agent session | M2 | ORIGINAL_REQUEST § R2 |
| 6 | Automatic Side Panel Reveal | Opens right-side `CanvasAgentPanel` automatically on prompt or action trigger | M2 | ORIGINAL_REQUEST § R2 |
| 7 | Side Panel Active Model & Status Pill | Pen-style header showing active model badge and status indicator | M2 | ORIGINAL_REQUEST § R3 |
| 8 | Context Attachment Badges | Visual pill badges (e.g. `@Frame 1`, `@Image`) representing active reference | M2 | ORIGINAL_REQUEST § R3 |
| 9 | Step-by-Step Plan Stream Cards | Visual plan cards displaying status (Thinking, Planning, Executing, Done) | M2 | ORIGINAL_REQUEST § R3 |
| 10 | Canvas Engine Sync & Undo/Redo Safety | Atomic operations preserving history and selection state | M3 | ORIGINAL_REQUEST § R4 |
| 11 | Unit Tests for Pen Hybrid Agent | Dedicated tests for island bar, quick input, context dispatch, and panel sync | M4 | ORIGINAL_REQUEST § R5 |
| 12 | Verification, PROJECT.md Update & Deploy | `npm test` 100%, `npm run lint:design` 0 violations, `npm run build` clean, deploy to `la` | M4 | ORIGINAL_REQUEST § R5 & User Rules |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Regression Test Fixes | Fix M3.1, M3.2, M3.6 in `tests/unit/single_canvas_integration.test.js` | None | PLANNED |
| M1 | Contextual Agent Island Bar | Bottom floating taskbar in `editor_contextual_taskbar.jsx` with AI prompt & action tools | None | PLANNED |
| M2 | Context Dispatch & Side Panel Alignment | Dispatch in `design_store.js`, auto-open, model pill, context badges, plan cards in `canvas_agent_panel.jsx` | M1 | PLANNED |
| M3 | Canvas Engine Sync & Safety | Live node updates, undo/redo compatibility, error boundaries | M2 | PLANNED |
| M4 | Comprehensive Testing & Deployment | Unit tests in `tests/unit/pen_hybrid_agent.test.jsx`, full quality gates, PROJECT.md sync, deploy to `la` | M0, M1, M2, M3 | PLANNED |

---

## Interface Contracts
### 1. `editor_contextual_taskbar.jsx` ↔ `design_store.js`
- Quick input submit or quick action click dispatches:
  ```javascript
  useDesignStore.getState().dispatchAgentIntent({
    prompt: string,
    action: string, // e.g., 'expand' | 'style_transfer' | 'remove_bg' | 'vectorize' | 'edit_copy' | 'custom'
    node: { id: string, kind: string, title?: string, width: number, height: number, ... }
  });
  ```
- Ensures `agentPanelOpen` is set to `true`.

### 2. `canvas_agent_panel.jsx`
- Subscribes to pending agent intent from store or custom event.
- Displays active context badge `@<NodeTitle or NodeKind>`.
- Displays step-by-step plan execution cards with status indicators.
