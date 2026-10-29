import { isGroupNode, isBooleanNode } from "../editor/scene_model.js";
import { IconTransparency, IconPaint, IconMove, IconLock, IconUnlock } from "../icons.jsx";
import { layerPanelModelType } from "./editor_layers_contract.js";
import { layerRowType } from "./editor_layers_contract.js";
export default function EditorLayerLocks({
  model,
  row
}) {
  const {
    onToggleLockTransparency,
    t,
    onToggleLockImagePixels,
    onToggleLockPosition,
    onToggleLock
  } = model;
  const {
    node: object,
    index
  } = row;
  const grouped = isGroupNode(object) || isBooleanNode(object);
  return <div
    className="group/locks relative flex items-center shrink-0 -my-1 py-1 px-0.5 rounded-lg transition-colors hover:bg-neutral-800/80"
    data-no-drag
    onPointerDown={e => e.stopPropagation()}
  >
    {!grouped ? <div
      className="absolute right-full mr-1 top-1/2 -translate-y-1/2 hidden group-hover/locks:flex items-center gap-0.5 rounded-lg bg-neutral-800 p-0.5 shadow-pop border border-white/10 z-30"
    >
      {/* Photoshop-style "lock transparent pixels": painting may
       only mix colour into existing content. */}
      <button
        type="button"
        data-no-drag
        onClick={() => onToggleLockTransparency(index)}
        aria-label={t(object.lockTransparency ? "editor.lockTransparency" : "editor.unlockTransparency")}
        title={t(object.lockTransparency ? "editor.lockTransparency" : "editor.unlockTransparency")}
        className={`shrink-0 p-1 rounded-md transition-colors ${object.lockTransparency ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-700/50"}`}
      >
        <IconTransparency
          size={12}
        />
      </button>
      {/* Photoshop-style "lock image pixels": the bitmap is frozen */}
      <button
        type="button"
        data-no-drag
        onClick={() => onToggleLockImagePixels(index)}
        aria-label={t(object.lockImagePixels ? "editor.lockImagePixels" : "editor.unlockImagePixels")}
        title={t(object.lockImagePixels ? "editor.lockImagePixels" : "editor.unlockImagePixels")}
        className={`shrink-0 p-1 rounded-md transition-colors ${object.lockImagePixels ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-700/50"}`}
      >
        <IconPaint
          size={12}
        />
      </button>
      {/* Photoshop-style "lock position": the layer's box is frozen */}
      <button
        type="button"
        data-no-drag
        onClick={() => onToggleLockPosition(index)}
        aria-label={t(object.lockPosition ? "editor.lockPosition" : "editor.unlockPosition")}
        title={t(object.lockPosition ? "editor.lockPosition" : "editor.unlockPosition")}
        className={`shrink-0 p-1 rounded-md transition-colors ${object.lockPosition ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-700/50"}`}
      >
        <IconMove
          size={12}
        />
      </button>
    </div> : null}
    <button
      type="button"
      data-no-drag
      onClick={() => onToggleLock?.(index)}
      aria-label={t(object.locked ? "editor.unlock" : "editor.lock")}
      title={t(object.locked ? "editor.unlock" : "editor.lock")}
      className="-mx-1.5 -my-1 flex h-7 w-7 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-100"
    >
      {object.locked || object.lockTransparency || object.lockImagePixels || object.lockPosition ? <IconLock
        size={12}
        className="text-neutral-300"
      /> : <IconUnlock
        size={12}
        className="opacity-0 group-hover/layer:opacity-100 group-hover/locks:opacity-100"
      />}
    </button>
  </div>;
}
if (import.meta.env.DEV) {
EditorLayerLocks.propTypes = {
  model: layerPanelModelType.isRequired,
  row: layerRowType.isRequired
};
}
