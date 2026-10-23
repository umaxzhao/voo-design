# Survey Report: Canvas Selection Floating Island & Contextual AI UI (Pen App Hybrid Architecture)

## 1. Observation

### 1.1 Existing Canvas Chrome & Selection Overlays
- **Primary Contextual Toolbar Component**: `src/canvas/components/editor_contextual_taskbar.jsx` (Lines 60–172, 983–1010).
  - Implements an adaptive taskbar with contexts for pixel selection, boolean operations, multi-layer alignment, pen/path editing, single shape, single text, and single image.
  - Currently styled (line 169) as:
    ```jsx
    className={`pointer-events-auto z-20 flex items-center gap-0.5 rounded-lg bg-neutral-900/95 p-0.5 backdrop-blur-md transition-colors whitespace-nowrap font-mono text-[11px] text-neutral-200 select-none ${
      dynamicStyle ? "absolute -translate-x-1/2" : "relative"
    }`}
    ```
  - Mount points in `src/canvas/components/editor_page.jsx`:
    1. Lines 949–980: Inside `editor-page-toolbar`, mounted directly under the page title row:
       ```jsx
       <div data-testid="editor-page-toolbar" className="absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-1" style={{ top: "calc(100% + 8px)" }}>
         {doc && focused ? <EditorContextualTaskBar engine={engine} tool={tool} selected={selected} ... /> : null}
       </div>
       ```
    2. Lines 1167–1195: Inside free/multi-canvas layout with `docRect`:
       ```jsx
       <EditorContextualTaskBar engine={engine} tool={tool} selected={selected} docRect={docRect} ... />
       ```
  - Top Floating Tool Rail: `src/canvas/components/editor_toolbar.jsx` (Lines 201–207) renders at `top-[14px] left-1/2 -translate-x-1/2 z-30` as a `rounded-full bg-black/90 shadow-pop backdrop-blur-md` floating pill.
  - Bottom Floating Zoom Cluster: `src/canvas/components/editor_toolbar.jsx` (Lines 695–713) and `src/canvas/components/image_editor.jsx` (Lines 3923–3960) render `EditorZoom` at `absolute bottom-3 left-1/2 -translate-x-1/2 z-30`.

### 1.2 Selection State Tracking & Node Kinds
- **Engine Selection Methods** (`src/canvas/editor/editor_engine_nodes.js:213–244`, `editor_engine_assembly.js:307–308`):
  - `engine.getSelected()`: Returns the primary active node (`Node | null`) via `getEffectiveNode(node)`.
  - `engine.getSelectedIds()`: Returns `string[]` of currently selected node IDs.
  - `engine.getSelectedNodes()`: Returns `Node[]` of all selected node objects.
  - `engine.getSelectedGroup()`: Returns group node if all group members are selected.
  - `engine.getPixelSelection()`: Returns raster contour selection `{ contours, mask }` if marquee/lasso selection is active.
  - `engine.getSelectionTransform()`: Returns active transform state if user is transforming bounding box.
- **Node Kinds** (`src/canvas/editor/scene_doc_factory.js:16–29`):
  - `NODE_KIND.IMAGE` (`"image"`): Bitmap image layer.
  - `NODE_KIND.RECT` (`"rect"`): Rectangle vector shape / frame bounds.
  - `NODE_KIND.ELLIPSE` (`"ellipse"`): Ellipse vector shape.
  - `NODE_KIND.PATH` (`"path"`): Bezier pen curve.
  - `NODE_KIND.TEXT` (`"text"`): Text layer with font family, size, content.
  - `NODE_KIND.BOOLEAN` (`"boolean"`): Boolean union/subtract/intersect/exclude compound path.
  - `NODE_KIND.GROUP` (`"group"`): Layer group container.
  - `NODE_KIND.ADJUSTMENT` (`"adjustment"`): Color adjustment layer.
  - `NODE_KIND.VIDEO` (`"video"`): Video media layer.
  - `NODE_KIND.CANVAS_INSTANCE` (`"canvasInstance"`): Reusable component instance.
  - **Artboard / Frame Representation**:
    - Workspace level (`src/store/design_store.js:8–21`): Pages in `nodes` array with `type: "imageEditor"` and `data.editorDoc` (`width`, `height`, `nodes`, `id`, `label`).
    - Spatial index (`src/canvas/components/image_editor.jsx:1180–1187`): Top-level artboards have `isFrame: true`.
    - Nodes inside documents also support `isFrame: true` or frame properties.
- **Selection Change Notification**:
  - `src/canvas/components/image_editor.jsx:281, 2686, 2867`: `EditorPage` receives `onChange={bump}`. When engine operations occur, `bump()` forces a React state re-render, keeping `selected` and `selectedIds` up to date.

### 1.3 Existing AI & Agent Components
- **Right-Side Agent Panel**: `src/canvas/components/canvas_agent_panel.jsx` (Lines 59–363).
  - Mounted in `src/App.jsx` (Lines 80–84):
    ```jsx
    {agentOpen && !welcomeOpen && (
      <aside className="flex w-[376px] shrink-0 flex-col py-3 pr-3">
        <CanvasAgentPanel onClose={() => setAgentOpen(false)} />
      </aside>
    )}
    ```
  - State `[agentOpen, setAgentOpen]` currently lives as local state in `src/App.jsx:15`.
  - Floating trigger button lives in `src/App.jsx:86–98` (`voo-ai-fab absolute bottom-4 right-4 z-[60]`).
  - Supports streaming chat, tool execution (`executeCanvasTool`), session history, and tool call visualization (`ToolCallCard`).
- **Existing AI Taskbar Buttons**: `src/canvas/components/editor_ai_taskbar_buttons.jsx`:
  - Defines `ICON_BTN` and `ICON_BTN_AI`:
    ```jsx
    export const ICON_BTN = "flex h-6 w-6 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";
    export const ICON_BTN_AI = `${ICON_BTN} bg-white/[0.06] text-[#E5B2FF] hover:bg-[#E5B2FF]/20 hover:text-[#eed0ff]`;
    ```
  - `EditorAiMenuSection`: Outpaint (`IconExpand`), Upscale 2X/4X (`IconHd`), Auto Enhance (`IconWand`), Portrait Retouch (`IconSticker`), Split Layers (`IconLayers`).
- **Existing Repaint Prompt Popover**: `src/canvas/components/editor_local_repaint_button.jsx`:
  - Renders a small popover form for Generative Fill prompts (`min-w-[260px] bg-neutral-900 border border-white/10 rounded-xl shadow-pop`).

### 1.4 Visual Design Tokens & Lint Rules
- **Tokens** (`design/tokens.cjs`):
  - `SURFACE`: `page` (`#000000`), `stage` (`#525252`), `panel` (`#171717`), `raised` (`#262626`), `hover` (`#404040` / `bg-white/[0.08]`), `card` (`#262626`).
  - `SHADOW`: `shadow-pop` (`0 8px 24px rgba(0, 0, 0, 0.5)` for capsule buttons / hints), `shadow-menu` (`0 14px 36px rgba(0, 0, 0, 0.55)`), `shadow-panel` (`0 24px 64px rgba(0, 0, 0, 0.6)` for drawers/modals).
  - `RADIUS`: `rounded-lg` (8px), `rounded-xl` (12px), `rounded-2xl` (16px), `rounded-3xl` (24px), `rounded-full` (capsules, pills, island bars). Arbitrary radii (e.g. `rounded-[14px]`) violate linter.
  - `BORDER_ALLOWED`: Must use translucent hairlines (`border-white/10`, `border-white/[0.08]`, `border-white/15`, `border-transparent`, `border-none`). Solid-tone borders (`border-neutral-700`) violate linter.
  - `ACCENTS`: Mint `#a7ffd4` (System & Flow, selection, focus ring), Purple `#E5B2FF` (AI & Editor), `#eed0ff` (AI text on purple wash).
  - `ICON_STROKE_WIDTH`: `1.5` canonical stroke width.
  - `EMOJI`: Prohibited anywhere in code or UI text.
- **Design Lint Check**: `scripts/check-design.mjs` runs `npm run lint:design` and enforces zero violations across all 798 files.

---

## 2. Logic Chain

1. **Selection Detection & Context Availability**:
   - `engine.getSelected()` and `engine.getSelectedIds()` provide synchronous access to the selected node and its attributes.
   - For any selected node, its metadata can be extracted cleanly:
     - `nodeId`: `selected.id`
     - `name`: `selected.name || selected.label || (selected.kind === 'rect' && selected.isFrame ? 'Frame' : selected.kind)`
     - `kind`: `selected.kind` (`image`, `rect`, `text`, `path`, `boolean`, `group`, etc.)
     - `dimensions`: `{ width: Math.round(selected.width), height: Math.round(selected.height), x: Math.round(selected.x), y: Math.round(selected.y) }`
     - `content`: `selected.text` for text nodes; image asset reference for image nodes.

2. **Placement & Ergonomics of the Selection Island**:
   - Currently, `EditorContextualTaskBar` is anchored relative to `docRect` or the artboard header (`style={{ top: "calc(100% + 8px)" }}`). When users zoom into large artboards (e.g. 1920x1080 or larger), this anchor point is pushed offscreen.
   - Pen App's UX paradigm positions the contextual selection island **floating at the bottom of the canvas viewport** (e.g., centered horizontally with `left-1/2 -translate-x-1/2`, floating at `bottom-16` or `bottom-14`, sitting above the `EditorZoom` bar at `bottom-3`).
   - By rendering at the viewport bottom level (or providing a viewport-docked mode for `EditorContextualTaskBar`), the bar remains visible and easily accessible regardless of zoom level or canvas pan offset.

3. **Hybrid Agent Architecture (Contextual Bar + Right Panel)**:
   - The user request explicitly demands a hybrid architecture:
     - The bottom floating bar provides immediate, low-friction entry: an embedded AI quick prompt input and 1-click contextual AI triggers.
     - The right-side `CanvasAgentPanel` provides the comprehensive execution environment: showing multi-turn dialogue, step-by-step plan execution cards, model selection, and progress logs.
   - When the user submits a prompt from the bottom selection bar or clicks an AI tool:
     1. The node context `{ nodeId, name, kind, dimensions, content }` is packaged.
     2. A dispatch action is sent (via Zustand store `useDesignStore` or custom DOM event `voo:agent-dispatch`).
     3. The right-side panel is automatically revealed (`setAgentOpen(true)`).
     4. The active prompt and attached reference pill (e.g., `@Frame 1`, `@Image`) are displayed as the active turn in `CanvasAgentPanel`.

4. **Contextual Action Button Configuration by Node Kind**:
   - **Image (`NODE_KIND.IMAGE`)**:
     - Embedded AI Prompt Input (`"Ask AI to edit image..."`)
     - `Remove BG` (Matting): Instant background removal using existing `removeBackground()`
     - `Expand / Outpaint`: Outpaint frame extension via existing `onOutpaintSubmit` / `EditorOutpaintOverlay`
     - `Style Transfer`: Prompts agent to apply artistic or visual style transfer
     - `Vectorize`: Traces image contours to SVG / vector paths
     - `Upscale`: 2X / 4X high-resolution upscaling
   - **Frame / Artboard (`NODE_KIND.RECT` with `isFrame` or page selection)**:
     - Embedded AI Prompt Input (`"Ask AI to generate in Frame..."`)
     - `Style Transfer`: Theme / color palette application across frame elements
     - `Edit Copy / Layout`: Layout rearrangement, auto-layout distribution, typography polish
   - **Text (`NODE_KIND.TEXT`)**:
     - Embedded AI Prompt Input (`"Ask AI to rewrite text..."`)
     - `Edit Copy`: Polish, shorten, translate, or rewrite copy
     - `Vectorize`: Convert text glyphs into editable vector paths
   - **Vector / Shape (`NODE_KIND.PATH`, `RECT`, `ELLIPSE`, `BOOLEAN`)**:
     - Embedded AI Prompt Input (`"Ask AI to modify shape..."`)
     - Boolean operations (Union, Subtract, Intersect, Exclude)
     - Alignment & Distribute tools (Distribute spacing, align edges)
     - Flip Horizontal / Vertical

5. **Pen App Visual Styling & Token Compliance**:
   - Container: `rounded-full` (compact) or `rounded-2xl` (when input expanded), `bg-[#18181b]/95 backdrop-blur-md`, `border border-white/10`, `shadow-pop`.
   - Prompt Input: Pill-shaped embedded field with `#E5B2FF` sparkles icon, subtle focus ring `focus-visible:ring-1 focus-visible:ring-[#E5B2FF]/50`, enter/send button with `bg-[#E5B2FF] text-black hover:bg-[#eed0ff]`.
   - Action Buttons: `ICON_BTN_AI` (`text-[#E5B2FF] bg-white/[0.06] hover:bg-[#E5B2FF]/20 hover:text-[#eed0ff] rounded-md`).
   - Clean iconography: Lucide icons with `size={13}` and `strokeWidth={1.5}`. Zero emojis.

---

## 3. Caveats

1. **Current Agent Panel State Location**: `agentOpen` is currently managed via `useState(false)` in `src/App.jsx:15` rather than inside `src/store/design_store.js`. To coordinate seamless opening from the canvas contextual taskbar, `agentOpen`, `setAgentOpen`, and `agentContext` should either be stored in `useDesignStore` or synchronized via `window.addEventListener("voo:agent-open")` / `"voo:agent-dispatch"`.
2. **Backend AI Endpoints vs UI Dispatch**: The UI survey focuses on frontend interaction, component structure, and context dispatch. Actual execution of advanced generative models (like image vectorization or style transfer) requires proper API provider configuration (e.g., 302.AI, OpenAI, Anthropic, or Qwen keys configured in `Settings > AI Providers`). The UI must gracefully handle unconfigured providers as already structured in `canvas_agent_panel.jsx`.
3. **Existing Pre-commit Lint**: Every file modified during implementation must pass `npm run lint:design` (enforcing zero arbitrary colors, zero arbitrary shadows, zero solid borders, zero emojis).

---

## 4. Conclusion & Recommended Implementation Architecture

### 4.1 Key Component Insertion Points

| Component / File | Current Role | Proposed Enhancement |
|---|---|---|
| `src/store/design_store.js` | Editor global store (pages, camera, files) | Add `agentOpen: boolean`, `setAgentOpen(open)`, `agentActiveContext: object \| null`, and `dispatchAgentPrompt({ prompt, context, tool })`. |
| `src/App.jsx` | Root layout hosting `ImageEditor` and `CanvasAgentPanel` | Subscribe `agentOpen` from `useDesignStore` (or listen to `voo:agent-dispatch`); pass dispatch handler. |
| `src/canvas/components/editor_contextual_taskbar.jsx` | Contextual action bar | Elevate styling to Pen App island (`rounded-full`/`rounded-2xl`, `#18181b` glassmorphism, `border-white/10 shadow-pop`), embed the Quick AI Prompt Input, and integrate contextual buttons (Expand, Style Transfer, Remove BG, Vectorize, Edit Copy/Layout). |
| `src/canvas/components/editor_contextual_ai_input.jsx` *(New or Sub-component)* | Quick AI Input Field | Compact text input with `<IconSparkles size={13} className="text-[#E5B2FF]" />`, contextual placeholder (e.g. `Ask AI to edit @${name}...`), Enter key / Send button that captures context and dispatches. |
| `src/canvas/components/canvas_agent_panel.jsx` | Right-side chat and agent turn executor | Add active model status pill in header, render attached context badge (e.g. `@Frame 1`), and display step-by-step plan execution cards (Thinking / Planning / Executing / Done). |
| `src/canvas/components/image_editor.jsx` | Main canvas workspace container | Expose viewport-docked bottom placement for the selection island at `bottom-16 left-1/2 -translate-x-1/2 z-30`, hovering above `EditorZoom` at `bottom-3`. |

### 4.2 Data Flow & Contract

```
[User Selects Node on Canvas]
         │
         ▼
[engine.getSelected() / getSelectedIds()]
         │
         ▼
[Bottom Floating Selection Island (EditorContextualTaskBar)]
  ├── Quick AI Prompt Input Field: "Ask AI to edit this..."
  └── Contextual Action Buttons: [Remove BG] [Expand] [Style Transfer] [Vectorize] [Edit Copy/Layout]
         │
         ▼ (User submits prompt or clicks AI action)
[Context Capture]
  {
    nodeId: "node-123",
    name: "Frame 1" | "Hero Image",
    kind: "frame" | "image" | "text" | "rect",
    dimensions: { width: 800, height: 600, x: 100, y: 150 },
    content: "...",
    intent: promptText || toolName
  }
         │
         ▼ (Store Action or Custom Event "voo:agent-dispatch")
[Open Right-Side Panel: setAgentOpen(true)]
         │
         ▼
[CanvasAgentPanel Receives Context]
  ├── Renders Context Badge: [@Frame 1]
  ├── Status: [Thinking... / Planning... / Executing... / Done]
  ├── Plan Cards: Step 1 (Analyze) -> Step 2 (Tool Call) -> Step 3 (Canvas Diff)
  └── Canvas Engine Mutation with Undo/Redo stack preserved
```

---

## 5. Verification Method

To independently verify the survey observations and findings:

1. **Design System & Token Conformance**:
   ```bash
   npm run lint:design
   ```
   *Expected*: Passes with 0 violations across all files.

2. **Verify Component Files & Exports**:
   - Inspect `src/canvas/components/editor_contextual_taskbar.jsx`:
     - Check lines 60–120 for props (`engine`, `selected`, `tool`, `removeBackground`, `onOutpaint`, etc.).
     - Check lines 169–172 for existing CSS class hierarchy.
   - Inspect `src/canvas/components/canvas_agent_panel.jsx`:
     - Check lines 59–84 for session history and close handlers.
     - Check lines 128–177 for turn execution and streaming.
   - Inspect `src/canvas/components/editor_toolbar.jsx`:
     - Check lines 201–207 for top floating toolbar styling.
     - Check lines 695–715 for bottom zoom cluster styling.

3. **Verify Existing Test Suite**:
   ```bash
   npx vitest run tests/unit/gap_property_controls.test.jsx tests/unit/align_section.test.jsx tests/unit/agent_session_history.test.js
   ```
   *Expected*: Unit tests pass with 100% green checkmarks.

4. **Invalidation Conditions**:
   - If `EditorContextualTaskBar` does not adapt based on `selected.kind`, the node-kind mapping is invalid.
   - If design linter reports violations on `#18181b` or translucent borders, verify against `design/tokens.cjs` whitelist.
