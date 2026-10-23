# Handoff Report: M1 Contextual Agent Island Bar (Pen App Style)

## 1. Observation

1. **Contextual Taskbar Location & Structure**
   - File: `/Users/tt/teamwork_projects/voo_design/src/canvas/components/editor_contextual_taskbar.jsx`
   - Lines 193–204: Active visibility check:
     ```javascript
     const isSelectionToolActive = tool === TOOL.MARQUEE || tool === TOOL.LASSO;
     if (
       !hasSelection &&
       !isTransforming &&
       selectedCount === 0 &&
       !selected &&
       !isPenActive &&
       !isSelectionToolActive
     ) {
       return null;
     }
     ```
   - Lines 214–217: Main container styling currently uses:
     ```javascript
     className={`pointer-events-auto z-20 flex items-center gap-1 rounded-2xl bg-neutral-900/95 border border-white/10 px-1.5 py-1 shadow-panel backdrop-blur-md transition-colors whitespace-nowrap font-mono text-[11px] text-neutral-200 select-none ${
       dynamicStyle ? "absolute -translate-x-1/2" : "relative"
     }`}
     ```
   - Lines 1025–1116: Prototype AI input section appended when `!isTransforming && (selected || selectedCount > 0)`.
     - Sparkle trigger: `button[data-testid="editor-taskbar-ai-sparkle"]`
     - Text input: `input[data-testid="editor-taskbar-ai-input"]`
     - Submit button: `button[data-testid="editor-taskbar-ai-submit"]`
     - Quick actions currently implemented:
       - Image: `button[data-testid="editor-taskbar-ai-vectorize"]` (Vectorize)
       - Text: `button[data-testid="editor-taskbar-ai-rewrite"]` (Polish)
       - Frame/Group: `button[data-testid="editor-taskbar-ai-autolayout"]` (Auto Layout)
     - Missing quick actions from R1 spec: Expand / Outpaint, Style Transfer, Remove Background.

2. **Positioning & Mount Points**
   - In `src/canvas/components/editor_page.jsx`:
     - Line 950 (single artboard): Centered beneath artboard:
       `<div data-testid="editor-page-toolbar" className="absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-1" style={{ top: "calc(100% + 8px)" }}>`
     - Line 1160 (free canvas multi-artboard): Centered beneath active artboard rect via `docRect`:
       `left: docRect.x + docRect.width / 2`, `top: docRect.y + docRect.height + EDITOR_PAGE_TOOLBAR_GAP`.

3. **Design Tokens & Linter Rules**
   - Command: `npm run lint:design` executes `node scripts/check-design.mjs`.
   - Result: `design: clean — 798 file(s) match Design.md.`
   - Core visual constraints from `design/tokens.cjs`:
     - Gradients (`bg-gradient-to-...`) are strictly prohibited as skeuomorphic.
     - Dark surface: `bg-neutral-900/95` (calibrated `#171717` dark surface) or `bg-black/90`. Tinted hexes like `#18181b` must use Tailwind's neutral ramp `bg-neutral-900/95` or `bg-black/90`.
     - Overlay shadows: Only `shadow-pop`, `shadow-menu`, `shadow-panel`.
     - Borders: Sanctioned translucent hairlines `border-white/10` or `border-white/5`.
     - Radii: `rounded-2xl` or `rounded-full`.
     - Accents: Mint `#a7ffd4` (focus rings, system flow, sparkle trigger), Purple `#E5B2FF` (AI actions, submit button, highlight).
     - Text & Placeholder contrast: text must not be darker than `neutral-400`; placeholder must not be darker than `placeholder:text-neutral-400`.
     - Icon stroke: `strokeWidth={1.5}` (Lucide standard in VOO Design).

4. **Event & Store Integration**
   - In `src/App.jsx` lines 18–23:
     ```javascript
     const handleOpenAgent = () => setAgentOpen(true);
     window.addEventListener("voo:open-agent-panel", handleOpenAgent);
     window.addEventListener("voo:agent-prompt", handleOpenAgent);
     ```
   - In `src/store/design_store.js`:
     `dispatchAgentIntent` and `agentPanelOpen` state are not yet declared.

5. **Existing Unit Test Coverage**
   - File: `tests/unit/pen_hybrid_agent.test.jsx`
   - Tests 1–3 verify:
     - `data-testid="editor-contextual-taskbar"`
     - `data-testid="editor-taskbar-ai-sparkle"`
     - `data-testid="editor-taskbar-ai-input"`
     - `data-testid="editor-taskbar-ai-autolayout"` with "Auto Layout"
     - `data-testid="editor-taskbar-ai-vectorize"` with "Vectorize"
     - `data-testid="editor-taskbar-ai-rewrite"` with "Polish"

---

## 2. Logic Chain

1. **Step 1: Selection Detection & Taskbar Visibility**
   - Based on Observation 1 and 2, when any canvas object (Frame, Image, Text, Shape) is selected, `selected` is non-null or `selectedCount > 0`.
   - The taskbar is mounted and positioned either fixed beneath the single artboard or floating relative to `docRect`.
   - For Pen App styling, the taskbar functions as an integrated bottom floating island bar with unified styling (`rounded-2xl`, `bg-neutral-900/95`, `border border-white/10`, `shadow-panel`, `backdrop-blur-md`).

2. **Step 2: Embedded AI Quick Prompt Input**
   - Based on Requirement R1 and Observation 1, the AI input box sits inside the taskbar island.
   - It contains:
     - Sparkle button (`data-testid="editor-taskbar-ai-sparkle"`) that opens the agent panel directly when clicked.
     - Text input (`data-testid="editor-taskbar-ai-input"`) with kind-adaptive placeholders:
       - `text`: `"Ask AI to rewrite, style..."`
       - `image`: `"Ask AI to edit, restyle, expand..."`
       - `frame` / `group`: `"Ask AI to organize layout, style..."`
       - `shape` / `path`: `"Ask AI to style, vectorize..."`
       - default: `"Ask AI to edit selection..."`
     - Enter key handler (`onSubmit` form event or `onKeyDown` `Enter` key check).
     - Submit button (`data-testid="editor-taskbar-ai-submit"`) with `<IconArrowUp size={12} strokeWidth={2} />` styled with `bg-[#E5B2FF] text-black hover:bg-[#eed0ff]`.

3. **Step 3: Quick AI Action Triggers**
   - Based on Requirement R1.4 and Observation 1, the island bar must offer 5 quick action trigger tools:
     1. **Expand / Outpaint**:
        - Trigger button `data-testid="editor-taskbar-ai-expand"`, icon `<IconExpand size={11} />`, label `"Expand"`.
        - Target: Image or Frame.
        - Dispatches intent: `action: 'expand'`, `prompt: 'Expand and outpaint canvas content seamlessly'`.
     2. **Style Transfer**:
        - Trigger button `data-testid="editor-taskbar-ai-style"`, icon `<IconPalette size={11} />`, label `"Style"`.
        - Target: Any selected node.
        - Dispatches intent: `action: 'style_transfer'`, `prompt: 'Apply modern design style and aesthetic enhancement'`.
     3. **Remove Background**:
        - Trigger button `data-testid="editor-taskbar-ai-remove-bg"`, icon `<IconMask size={11} />`, label `"Remove BG"`.
        - Target: Image.
        - Dispatches intent: `action: 'remove_bg'`, `prompt: 'Remove background with high-precision matting'`.
     4. **Vectorize**:
        - Trigger button `data-testid="editor-taskbar-ai-vectorize"`, icon `<IconVectorSquare size={11} />`, label `"Vectorize"`.
        - Target: Image or Shape.
        - Dispatches intent: `action: 'vectorize'`, `prompt: 'Vectorize this image into clean editable SVG paths'`.
     5. **Edit Copy / Layout**:
        - For Text: Trigger button `data-testid="editor-taskbar-ai-rewrite"`, icon `<IconText size={11} />`, label `"Polish"`.
          - Dispatches intent: `action: 'edit_copy'`, `prompt: 'Rewrite and polish this text copy with a professional tone'`.
        - For Frame / Group: Trigger button `data-testid="editor-taskbar-ai-autolayout"`, icon `<IconLayoutGrid size={11} />`, label `"Auto Layout"`.
          - Dispatches intent: `action: 'layout'`, `prompt: 'Analyze and apply optimal auto-layout structure to this frame'`.

4. **Step 4: Dispatch Contract & Side Panel Coordination**
   - Based on Observation 4 and SCOPE.md, the dispatch handler in `editor_contextual_taskbar.jsx`:
     ```javascript
     const handleAiDispatch = useCallback((customPrompt, action = "custom") => {
       const promptText = (typeof customPrompt === "string" ? customPrompt : aiPrompt).trim();
       const node = selectedNode;
       const context = node ? {
         nodeId: node.id,
         name: node.name || (node.kind ? node.kind.charAt(0).toUpperCase() + node.kind.slice(1) : "Layer"),
         kind: node.kind,
         width: Math.round(node.width || node.w || 0),
         height: Math.round(node.height || node.h || 0),
         text: node.text || node.content || null,
         imageUrl: node.url || node.src || null,
       } : null;

       // 1. Dispatch into Zustand store
       if (typeof useDesignStore?.getState?.().dispatchAgentIntent === "function") {
         useDesignStore.getState().dispatchAgentIntent({
           prompt: promptText,
           action,
           node: context,
         });
       }

       // 2. Dispatch CustomEvents for App and CanvasAgentPanel listeners
       if (typeof window !== "undefined") {
         window.dispatchEvent(
           new CustomEvent("voo:open-agent-panel", {
             detail: { context, prompt: promptText, action },
           })
         );
         if (promptText) {
           window.dispatchEvent(
             new CustomEvent("voo:agent-prompt", {
               detail: {
                 prompt: promptText,
                 action,
                 context,
               },
             })
           );
         }
       }
       setAiPrompt("");
     }, [aiPrompt, selectedNode]);
     ```

5. **Step 5: Exact Prop Types and Component Signature**
   - Props for `EditorContextualTaskBar`:
     Add optional `onDispatchAgentIntent` prop to `propTypes`:
     ```javascript
     EditorContextualTaskBar.propTypes = {
       engine: PropTypes.object,
       tool: PropTypes.string,
       selected: PropTypes.object,
       hasSelection: PropTypes.bool,
       removeBackground: PropTypes.func,
       maskBusy: PropTypes.bool,
       onRepaint: PropTypes.func,
       repaintBusy: PropTypes.bool,
       onOutpaint: PropTypes.func,
       onUpscale: PropTypes.func,
       upscaleBusy: PropTypes.bool,
       onAutoEnhance: PropTypes.func,
       onPortraitRetouch: PropTypes.func,
       portraitRetouchBusy: PropTypes.bool,
       onSplitLayers: PropTypes.func,
       splitLayersBusy: PropTypes.bool,
       onAddAdjustmentLayer: PropTypes.func,
       onApplyPreset: PropTypes.func,
       getBitmap: PropTypes.func,
       docRect: PropTypes.object,
       stageRef: PropTypes.object,
       onEditSvg: PropTypes.func,
       onCreateComponent: PropTypes.func,
       onDetachInstance: PropTypes.func,
       onDispatchAgentIntent: PropTypes.func,
     };
     ```

---

## 3. Caveats

1. **`bg-[#18181b]` vs Design System Gate**:
   `Design.md` and `scripts/check-design.mjs` strictly enforce zero color spread on neutral hexes (`NEUTRAL_SPREAD = 0`). `#18181b` has RGB (24, 24, 27) with a spread of 3, which is rejected by `check-design.mjs` as a tinted gray. The implementer must strictly use `bg-neutral-900/95` (calibrated `#171717` dark surface) or `bg-black/90` with `border border-white/10` to satisfy both Pen App aesthetics and the automated design gate.
2. **`bg-gradient-to-...` Ban**:
   The design gate bans CSS gradients in `className`. All button and icon backgrounds must use alpha washes (e.g. `bg-white/[0.08]` or `bg-[#E5B2FF]/15`) rather than gradients.
3. **Vitest Node Environment**:
   `tests/unit/pen_hybrid_agent.test.jsx` runs in Node. Any call to `window.addEventListener` or `window.dispatchEvent` in tests must be guarded by `typeof window !== "undefined"` or set up via `globalThis.window = ...`.

---

## 4. Conclusion

The implementation plan for Requirement R1 (Contextual Agent Island Bar on Selection - Pen App Style) is completely mapped out:
1. **Container Styling**:
   `className="pointer-events-auto z-20 flex items-center gap-1 rounded-2xl bg-neutral-900/95 border border-white/10 px-1.5 py-1 shadow-panel backdrop-blur-md transition-colors whitespace-nowrap font-mono text-[11px] text-neutral-200 select-none"`
2. **Embedded AI Input Box**:
   Sparkle button (`data-testid="editor-taskbar-ai-sparkle"`), dynamic placeholder input (`data-testid="editor-taskbar-ai-input"`), Enter key handler, and submit button (`data-testid="editor-taskbar-ai-submit"`).
3. **Quick Action Triggers**:
   Full set of 5 contextual buttons:
   - Expand (`data-testid="editor-taskbar-ai-expand"`)
   - Style Transfer (`data-testid="editor-taskbar-ai-style"`)
   - Remove BG (`data-testid="editor-taskbar-ai-remove-bg"`)
   - Vectorize (`data-testid="editor-taskbar-ai-vectorize"`)
   - Polish / Auto Layout (`data-testid="editor-taskbar-ai-rewrite"` / `data-testid="editor-taskbar-ai-autolayout"`)
4. **Interface Contract**:
   Dispatches both `useDesignStore.getState().dispatchAgentIntent({ prompt, action, node })` and DOM CustomEvents `voo:open-agent-panel` and `voo:agent-prompt`.

---

## 5. Verification Method

To independently verify the implementation:
1. **Unit Tests**:
   Execute `npx vitest run tests/unit/pen_hybrid_agent.test.jsx` — all island bar render assertions must pass.
2. **Design Gate Compliance**:
   Execute `npm run lint:design` — must output `design: clean — 0 violation(s)` with code 0.
3. **Full Test Suite**:
   Execute `npm test` — must pass 100% of unit tests.
4. **Production Build**:
   Execute `npm run build` — must build without syntax or bundling errors.
