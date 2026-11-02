import PropTypes from "prop-types";
import EditorContextualTaskBar from "./editor_contextual_taskbar.jsx";
import { useContextualTaskbarRect } from "./editor_hooks/use_contextual_taskbar_rect.js";

/**
 * Wires EditorPage's selection and AI handlers into the contextual task bar.
 * Bounded free pages use a bottom row; root canvases dock the bar above the
 * zoom controls, and full mode supplies its viewport docRect. Each mode shares
 * this wiring and mounts one bar, keeping the action handlers in one place.
 */
export default function EditorContextualTaskBarSlot({
  focused,
  doc,
  docRect = null,
  floating = false,
  engine,
  selectedIds,
  tool,
  selected,
  onRepaintNode,
  onRepaintSelection,
  onOutpaintSubmit,
  onAutoMask,
  autoMaskBusy,
  onAddAdjustmentLayer,
  onApplyPreset,
  getBitmap,
  onUpscale,
  upscaleBusy,
  onAutoEnhance,
  onPortraitRetouch,
  portraitRetouchBusy,
  onSplitLayers,
  splitLayersBusy,
}) {
  const floatingRect = useContextualTaskbarRect(engine, floating && focused);
  if (!doc || !focused) return null;
  if (floating && !floatingRect) return null;

  // A pixel selection repaints the selected region; otherwise an image layer
  // repaints itself. Any other selection has no repaint target.
  const hasPixelSelection = Boolean(engine?.getPixelSelection?.()?.contours?.length);
  const onRepaint = hasPixelSelection
    ? onRepaintSelection
    : selected?.kind === "image"
      ? (prompt) => onRepaintNode?.(selected, prompt)
      : null;

  // Expand in the More menu asks EditorPage to open the grow-frame overlay for
  // the selected image through its window listener, the same path the
  // properties panel uses.
  const onOutpaint =
    onOutpaintSubmit && selected?.kind === "image"
      ? () =>
          window.dispatchEvent(
            new CustomEvent("editor:request-outpaint", {
              detail: { nodeId: selected.id },
            }),
          )
      : null;

  return (
    <EditorContextualTaskBar
      engine={engine}
      selectedIds={selectedIds}
      tool={tool}
      selected={selected}
      hasSelection={hasPixelSelection}
      removeBackground={onAutoMask}
      maskBusy={autoMaskBusy}
      onRepaint={onRepaint}
      onOutpaint={onOutpaint}
      onUpscale={onUpscale}
      upscaleBusy={upscaleBusy}
      onAutoEnhance={onAutoEnhance}
      onPortraitRetouch={onPortraitRetouch}
      portraitRetouchBusy={portraitRetouchBusy}
      onSplitLayers={onSplitLayers}
      splitLayersBusy={splitLayersBusy}
      onAddAdjustmentLayer={onAddAdjustmentLayer}
      onApplyPreset={onApplyPreset}
      getBitmap={getBitmap}
      docked={floating}
      docRect={floating ? floatingRect : docRect}
    />
  );
}

EditorContextualTaskBarSlot.propTypes = {
  focused: PropTypes.bool,
  doc: PropTypes.object,
  floating: PropTypes.bool,
  docRect: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  engine: PropTypes.object,
  selectedIds: PropTypes.arrayOf(PropTypes.string),
  tool: PropTypes.string,
  selected: PropTypes.object,
  onRepaintNode: PropTypes.func,
  onRepaintSelection: PropTypes.func,
  onOutpaintSubmit: PropTypes.func,
  onAutoMask: PropTypes.func,
  autoMaskBusy: PropTypes.bool,
  onAddAdjustmentLayer: PropTypes.func,
  onApplyPreset: PropTypes.func,
  getBitmap: PropTypes.func,
  onUpscale: PropTypes.func,
  upscaleBusy: PropTypes.bool,
  onAutoEnhance: PropTypes.func,
  onPortraitRetouch: PropTypes.func,
  portraitRetouchBusy: PropTypes.bool,
  onSplitLayers: PropTypes.func,
  splitLayersBusy: PropTypes.bool,
};
