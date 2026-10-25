import PropTypes from "prop-types";
import EditorContextualTaskBar from "./editor_contextual_taskbar.jsx";

/**
 * Wires EditorPage's selection and AI handlers into the contextual task bar.
 * EditorPage mounts the bar in two places: the page tool row in free mode
 * (no docRect) and under the selection on a fixed canvas (docRect set). Both
 * mounts share this wiring so the handlers stay in one place.
 */
export default function EditorContextualTaskBarSlot({
  focused,
  doc,
  docRect = null,
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
  if (!doc || !focused) return null;

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
      docRect={docRect}
    />
  );
}

EditorContextualTaskBarSlot.propTypes = {
  focused: PropTypes.bool,
  doc: PropTypes.object,
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
