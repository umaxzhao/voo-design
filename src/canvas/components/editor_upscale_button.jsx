import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { IconHd } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import EditorTooltip from "./editor_tooltip.jsx";
import { ICON_BTN_AI } from "./editor_ai_taskbar_buttons.jsx";

const UPSCALE_OPTIONS = [
  {
    id: "realesrgan-compact-2x",
    scale: 2,
    badge: "2X",
    labelKey: "editor.upscale.2x",
    hintKey: "editor.upscale.2xHint",
    isRecommended: true,
  },
  {
    id: "realesrgan-compact-4x",
    scale: 4,
    badge: "4X",
    labelKey: "editor.upscale.4x",
    hintKey: "editor.upscale.4xHint",
  },
  {
    id: "realesrgan-anime-4x",
    scale: 4,
    badge: "4X",
    labelKey: "editor.upscale.anime",
    hintKey: "editor.upscale.animeHint",
  },
];

export default function EditorUpscaleButton({
  onUpscale,
  busy = false,
  className = "",
}) {
  const { t } = useI18n();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const handleSelect = (opt) => {
    setOpen(false);
    if (!onUpscale || busy) return;
    onUpscale({ scale: opt.scale, modelId: opt.id });
  };

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <EditorTooltip
        title={busy ? t("editor.upscale.running") || "Upscaling..." : t("editor.upscale.button") || "HD Upscale"}
        disabled={open}
      >
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          disabled={busy}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t("editor.upscale.button") || "HD Upscale"}
          className={`${ICON_BTN_AI} disabled:opacity-40 ${
            open ? "bg-[#E5B2FF]/25 text-neutral-300 ring-1 ring-[#E5B2FF]" : ""
          }`}
        >
          <IconHd size={12} className={`text-neutral-300 ${busy ? "animate-pulse" : ""}`} />
        </button>
      </EditorTooltip>

      {open && (
        <div
          role="dialog"
          aria-label={t("editor.upscale.button") || "HD Upscale"}
          className="node-editor-enter absolute bottom-full left-0 mb-2.5 w-64 rounded-xl bg-neutral-900 border border-white/10 p-1.5 shadow-menu z-50 select-none font-sans text-xs"
        >
          <div className="px-2 pb-1 pt-1 text-[9px] uppercase tracking-wider text-neutral-400 font-mono">
            {t("editor.upscale.button") || "HD Upscale"}
          </div>

          <div className="flex flex-col gap-1">
            {UPSCALE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt)}
                className="group flex flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08]"
              >
                <div className="flex w-full items-center justify-between gap-1.5">
                  <span className="font-medium text-neutral-200 group-hover:text-white">
                    {t(opt.labelKey)}
                  </span>
                  <div className="flex items-center gap-1">
                    {opt.isRecommended ? (
                      <span className="rounded-md bg-emerald-500/15 px-1 py-0.5 text-[9px] font-mono font-medium text-emerald-400">
                        {t("settings.upscale.recommended") || "Recommended"}
                      </span>
                    ) : null}
                    <span className="rounded-md bg-white/10 px-1 py-0.5 font-mono text-[9px] font-semibold text-neutral-300">
                      {opt.badge}
                    </span>
                  </div>
                </div>
                <span className="mt-0.5 text-[10px] leading-tight text-neutral-400 group-hover:text-neutral-300">
                  {t(opt.hintKey)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

EditorUpscaleButton.propTypes = {
  onUpscale: PropTypes.func,
  busy: PropTypes.bool,
  className: PropTypes.string,
};
