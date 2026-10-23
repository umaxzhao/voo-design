import { hasBlendModes } from "../editor/scene_model_core.js";
import { exportFilename } from "../editor/export_filename.js";
import PropTypes from "prop-types";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../use_i18n.js";
import { CAPABILITY, isCapabilitySupported } from "../platform_capabilities.js";
import { useExportDialogKeyboard } from "./editor_hooks/use_export_dialog_keyboard.js";

const FORMATS = [
  ["png", "editor.exportPng"],
  ["jpeg", "editor.exportJpeg"],
  ["webp", "editor.exportWebp"],
  ["svg", "editor.exportSvg"],
  ["psd", "editor.exportPsd"],
  ["pdf", "editor.exportPdf"],
];

/** Mirrors exportEditorImage: raster scales; vector and web formats keep document size. */
export function designExportDimensions({ width, height, format, scale }) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return null;
  const factor = ["svg", "psd", "pdf"].includes(format)
    ? 1
    : scale;
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

export function EditorExportSummary({ dimensions, canChooseSaveLocation }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 text-[11px] text-neutral-400">
      <dl className="flex flex-wrap items-center justify-between gap-2">
        <dt>{t("editor.exportResolution")}</dt>
        <dd
          data-testid="design-export-dimensions"
          aria-live="polite"
          className="tabular-nums text-neutral-200"
        >
          {dimensions
            ? `${dimensions.width} × ${dimensions.height} px`
            : t("editor.pen.unavailable")}
        </dd>
      </dl>
      <p>
        {t(
          canChooseSaveLocation
            ? "editor.exportChooseLocation"
            : "editor.exportBrowserLocation",
        )}
      </p>
    </div>
  );
}

EditorExportSummary.propTypes = {
  dimensions: PropTypes.shape({
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
  }),
  canChooseSaveLocation: PropTypes.bool.isRequired,
};

export default function EditorExportDialog({
  format,
  quality,
  scale,
  exportName,
  doc,
  documentWidth,
  documentHeight,
  selectedCount = 0,
  slicesCount = 0,
  selectionBounds = null,
  exportRange = "frame",
  onExportRange = null,
  busy,
  exportProgress,
  onFormat,
  onQuality,
  onScale,
  onExport,
  onClose,
}) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const [transparent, setTransparent] = useState(() => !hasBlendModes(doc));
  const targetWidth =
    exportRange === "selection" && selectionBounds?.width
      ? selectionBounds.width
      : documentWidth;
  const targetHeight =
    exportRange === "selection" && selectionBounds?.height
      ? selectionBounds.height
      : documentHeight;
  const dimensions = designExportDimensions({
    width: targetWidth,
    height: targetHeight,
    format,
    scale,
  });
  const canChooseSaveLocation = isCapabilitySupported(
    CAPABILITY.NATIVE_MEDIA_SAVE_LOCATION,
  );
  useExportDialogKeyboard(dialogRef, onClose);
  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-start justify-end bg-black/40 p-4 pt-16"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="design-export-title"
        data-testid="design-export-dialog"
        className="ui-scroll flex max-h-[calc(100dvh-80px)] w-64 max-w-full flex-col gap-3 overflow-y-auto rounded-3xl bg-neutral-900 border border-white/10 p-4 font-mono shadow-menu"
      >
        <h2 id="design-export-title" className="text-xs text-neutral-200">
          {t("editor.exportTitle")}
        </h2>
        {onExportRange ? (
          <div
            className="flex gap-1 rounded-xl bg-white/[0.04] p-0.5 text-[11px]"
            role="radiogroup"
            aria-label={t("editor.exportRange")}
          >
            <button
              type="button"
              role="radio"
              aria-checked={exportRange === "frame"}
              disabled={busy}
              onClick={() => onExportRange("frame")}
              className={`flex-1 rounded-lg py-1.5 text-center transition-colors ${exportRange === "frame" ? "bg-white/[0.12] text-white" : "text-neutral-400 hover:text-white"}`}
            >
              {t("editor.exportRange.pageFrame")}
            </button>
            <button
                type="button"
                role="radio"
                aria-checked={exportRange === "selection"}
                disabled={busy || selectedCount === 0}
                onClick={() => onExportRange("selection")}
                className={`flex-1 rounded-lg py-1.5 text-center transition-colors ${exportRange === "selection" ? "bg-white/[0.12] text-white" : "text-neutral-400 hover:text-white"}`}
              >
                {t("editor.exportRange.selection")}
            </button>
            {slicesCount > 0 && (
              <button
                type="button"
                role="radio"
                aria-checked={exportRange === "slices"}
                disabled={busy}
                onClick={() => onExportRange("slices")}
                className={`flex-1 rounded-lg py-1.5 text-center transition-colors ${exportRange === "slices" ? "bg-white/[0.12] text-white" : "text-neutral-400 hover:text-white"}`}
              >
                {t("editor.exportRange.slices")}
              </button>
            )}
          </div>
        ) : null}
        <fieldset
          disabled={busy}
          className="flex min-w-0 flex-col gap-3 disabled:opacity-40"
        >
          <div className="flex flex-col gap-1">
            {FORMATS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={format === id}
                onClick={() => onFormat(id)}
                className={`flex min-h-8 items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${format === id ? "bg-white/[0.12] text-white" : "text-neutral-300 hover:bg-white/[0.06]"}`}
              >
                <span>{t(label)}</span>
                {format === id && (
                  <span aria-hidden="true" className="text-[#a7ffd4]">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          {(format === "jpeg" || format === "webp") && (
            <label className="flex items-center gap-2 text-[11px] text-neutral-400">
              <span>{t("editor.exportQuality")}</span>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.02}
                value={quality}
                onChange={(event) => onQuality(Number(event.target.value))}
                className="flat-range min-w-0 flex-1"
              />
              <span className="w-8 text-right tabular-nums">
                {Math.round(quality * 100)}%
              </span>
            </label>
          )}
          {!["svg", "psd"].includes(format) && (
            <div className="flex gap-2" role="group" aria-label={t("editor.exportScale")}>
              {[1, 2, 3].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scale === value}
                  onClick={() => onScale(value)}
                  className={`min-h-8 rounded-lg px-3 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${scale === value ? "bg-white/[0.12] text-white" : "text-neutral-400 hover:bg-white/[0.06]"}`}
                >
                  {value}×
                </button>
              ))}
            </div>
          )}
        </fieldset>
        {exportRange !== "slices" && (
          <p className="break-all text-[11px] text-neutral-300" aria-live="polite" data-testid="design-export-filename">
            {exportFilename(exportName, format, scale)}
          </p>
        )}
        <EditorExportSummary
          dimensions={dimensions}
          canChooseSaveLocation={canChooseSaveLocation}
        />
        {["png", "jpeg", "webp", "svg", "pdf"].includes(format) && (
          <label className="flex items-center gap-2 text-[11px] text-neutral-300">
            <input
              type="checkbox"
              disabled={busy || format === "jpeg"}
              aria-describedby={format === "jpeg" ? "export-jpeg-background" : undefined}
              checked={format !== "jpeg" && transparent}
              onChange={(event) => setTransparent(event.target.checked)}
            />
            {t("editor.exportTransparentBackground")}
          </label>
        )}
        {format === "jpeg" && (
          <p id="export-jpeg-background" className="text-[11px] text-neutral-400">{t("editor.exportJpegOpaqueBackground")}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-8 flex-1 rounded-lg px-3 text-[11px] text-neutral-300 hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          >
            {t("editor.cancel")}
          </button>
          <button
            type="button"
            disabled={busy || (!dimensions && exportRange !== "slices")}
            onClick={() => onExport({ transparent: format !== "jpeg" && transparent })}
            className="min-h-8 flex-1 rounded-lg bg-white px-3 text-[11px] font-semibold text-black hover:bg-neutral-200 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          >
            {exportRange === "slices"
              ? t("editor.exportSlicesAction", { count: slicesCount })
              : t("editor.export")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

EditorExportDialog.propTypes = {
  exportName: PropTypes.string,
  format: PropTypes.string.isRequired,
  quality: PropTypes.number.isRequired,
  scale: PropTypes.number.isRequired,
  doc: PropTypes.object,
  documentWidth: PropTypes.number,
  documentHeight: PropTypes.number,
  selectedCount: PropTypes.number,
  slicesCount: PropTypes.number,
  selectionBounds: PropTypes.shape({
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  exportRange: PropTypes.string,
  onExportRange: PropTypes.func,
  busy: PropTypes.bool,
  exportProgress: PropTypes.number,
  onFormat: PropTypes.func.isRequired,
  onQuality: PropTypes.func.isRequired,
  onScale: PropTypes.func.isRequired,
  onExport: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
