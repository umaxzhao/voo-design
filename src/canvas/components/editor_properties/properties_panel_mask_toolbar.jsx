/** Mask editing toolbar for EditorProperties: brush mode, size, feather, invert, clear, and remove. */

import PropTypes from "prop-types";
import {
  MASK_BRUSH_MAX,
  MASK_BRUSH_MIN,
} from "../../editor/editor_constants.js";
import { maskErrorCopy } from "../../error_text.js";

export default function PropertiesPanelMaskToolbar({
  maskEditing,
  maskActions,
  hasMask,
  maskBusy,
  feather,
  setFeather,
  t,
}) {
  if (!maskEditing || !maskActions) return null;

  return (
    <div className="flex flex-col gap-1.5 mb-2 rounded-xl bg-[#1a1a1a] p-2">
      <div className="grid grid-cols-2 gap-1">
        {["erase", "restore"].map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => maskActions.onMode?.(mode)}
            aria-pressed={maskEditing.mode === mode}
            className={`rounded-xl px-2 py-1.5 text-[10px] font-mono transition-all ${
              maskEditing.mode === mode
                ? "bg-[#333333] text-white font-medium"
                : "bg-[#222222] text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t(`editor.mask.${mode}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={MASK_BRUSH_MIN}
          max={MASK_BRUSH_MAX}
          value={maskEditing.size}
          aria-label={t("editor.mask.brushSize")}
          onChange={(e) => maskActions.onSize?.(Number(e.target.value))}
          className="flat-range min-w-0 flex-1"
        />
        <span className="w-6 shrink-0 text-right text-[10px] font-mono tabular-nums text-neutral-400">
          {maskEditing.size}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={40}
          value={feather}
          aria-label={t("editor.mask.feather")}
          onChange={(e) => setFeather(Number(e.target.value))}
          className="flat-range min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => maskActions.onFeather?.(feather)}
          disabled={maskBusy || feather <= 0}
          className="shrink-0 rounded-lg bg-[#222222] px-2 py-1 text-[10px] font-mono text-neutral-300 hover:text-neutral-100 disabled:opacity-40"
        >
          {t("editor.mask.feather")}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => maskActions.onInvert?.()}
          disabled={maskBusy}
          className="rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#2a2a2a] hover:text-neutral-100 disabled:opacity-40"
        >
          {t("editor.mask.invert")}
        </button>
        {hasMask ? (
          <button
            type="button"
            onClick={() => maskActions.onClear?.()}
            disabled={maskBusy}
            className="rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono text-neutral-400 hover:bg-[#2a2a2a] hover:text-neutral-200 disabled:opacity-40"
          >
            {t("editor.mask.clear")}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => maskActions.onRemove?.()}
        disabled={maskBusy}
        className="flex items-center justify-center rounded-xl bg-[#E5B2FF] text-black font-medium py-1.5 text-[10px] font-mono hover:bg-[#eed0ff] transition-colors disabled:opacity-40"
      >
        <span>
          {maskBusy
            ? "..."
            : hasMask
              ? t("editor.mask.redo")
              : t("editor.mask.remove")}
        </span>
      </button>
      {maskActions.error ? (
        <p className="text-[10px] leading-relaxed text-[#E5B2FF]">
          {maskErrorCopy(maskActions.error)}
        </p>
      ) : null}
    </div>
  );
}

PropertiesPanelMaskToolbar.propTypes = {
  maskEditing: PropTypes.object,
  maskActions: PropTypes.object,
  hasMask: PropTypes.bool,
  maskBusy: PropTypes.bool,
  feather: PropTypes.number.isRequired,
  setFeather: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
