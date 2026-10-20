import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import {
  MAX_CANVAS_SIZE,
  MIN_CANVAS_SIZE,
  filterPresetGroups,
  presetKey,
  ratioText,
} from "../editor/canvas_presets.js";

export default function EditorCanvasPresets({
  engine = null,
  doc = null,
  placement = "auto",
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  const [scaleMode, setScaleMode] = useState("none");
  const [placeBelow, setPlaceBelow] = useState(true);
  const ref = useRef(null);

  const handleScaleModeChange = (mode) => {
    setScaleMode(mode);
  };

  const w = doc?.width ?? 0;
  const h = doc?.height ?? 0;

  // Auto-detect popover direction
  useEffect(() => {
    if (!open || !ref.current) return;
    if (placement === "bottom") {
      setPlaceBelow(true);
    } else if (placement === "top") {
      setPlaceBelow(false);
    } else {
      const rect = ref.current.getBoundingClientRect();
      // If within 380px of top of viewport, open downwards
      setPlaceBelow(rect.top < 380);
    }
  }, [open, placement]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  // A stale filter is confusing when the popover is reopened.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const apply = (width, height) => {
    engine?.setDocumentSize(width, height, { scaleMode });
    // The engine already re-fits, but the doc_ops contract asks the caller
    // for a follow-up zoomToFit; it is idempotent, so call it explicitly.
    engine?.zoomToFit?.();
    setOpen(false);
  };

  const applyCustom = () => {
    const rawW = parseInt(customW, 10);
    const rawH = parseInt(customH, 10);
    if (Number.isFinite(rawW) && Number.isFinite(rawH) && rawW > 0 && rawH > 0) {
      const width = Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, rawW));
      const height = Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, rawH));
      apply(width, height);
      setCustomW("");
      setCustomH("");
    }
  };

  const labelOf = (item) =>
    item.labelKey ? t(item.labelKey) : ratioText(item.w, item.h);

  if (!doc) return null;

  const groups = filterPresetGroups(query, t);

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={t("editor.canvas.size")}
        aria-expanded={open}
        title={t("editor.canvas.size")}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono tabular-nums transition-all ${
          open
            ? "bg-[#282828] text-white"
            : "bg-[#181818]/90 text-neutral-400 hover:text-white hover:bg-[#262626]"
        }`}
      >
        <span>
          {w}×{h}
        </span>
      </button>

      {open ? (
        <div
          className={`absolute ${
            placeBelow ? "top-full mt-2" : "bottom-full mb-2"
          } left-1/2 -translate-x-1/2 z-50 w-64 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111]/95 shadow-menu backdrop-blur-xl text-neutral-200`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-white/[0.06] px-3 py-2">
            <input
              type="text"
              value={query}
              aria-label={t("editor.canvas.search")}
              placeholder={t("editor.canvas.search")}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              className="nodrag w-full rounded-lg bg-white/[0.07] px-2 py-1 text-[11px] font-mono text-neutral-200 placeholder:text-neutral-400 outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>

          <div className="border-b border-white/[0.06] px-3 py-1.5">
            <p className="pb-1 text-[9px] font-mono uppercase tracking-widest text-neutral-500 select-none">
              {t("editor.canvas.scaleContent")}
            </p>
            <div className="flex gap-1">
              {[
                { id: "none", labelKey: "editor.canvas.scaleNone" },
                { id: "width", labelKey: "editor.canvas.scaleWidth" },
                { id: "height", labelKey: "editor.canvas.scaleHeight" },
              ].map((opt) => {
                const active = scaleMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleScaleModeChange(opt.id)}
                    aria-pressed={active}
                    className={`flex-1 rounded-lg py-1 text-[10px] font-mono transition-colors text-center ${
                      active
                        ? "bg-white/[0.12] text-white font-medium"
                        : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.05]"
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {groups.map((group) => (
              <div key={group.titleKey}>
                <p className="px-3 pt-2 pb-0.5 text-[9px] font-mono uppercase tracking-widest text-neutral-500 select-none">
                  {t(group.titleKey)}
                </p>
                {group.items.map((item) => {
                  const active = item.w === w && item.h === h;
                  return (
                    <button
                      key={presetKey(item)}
                      type="button"
                      onClick={() => apply(item.w, item.h)}
                      aria-pressed={active}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-mono transition-colors ${
                        active
                          ? "bg-white/[0.07] text-white"
                          : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
                      }`}
                    >
                      <span className="truncate">
                        {labelOf(item)} · {item.w}×{item.h}
                      </span>
                      {active ? (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#b2ffd6]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 ? (
              <p className="px-3 py-3 text-center text-[10px] font-mono text-neutral-500 select-none">
                {t("editor.canvas.empty")}
              </p>
            ) : null}
          </div>

          <div className="border-t border-white/[0.06]">
            <p className="px-3 pt-2 pb-0.5 text-[9px] font-mono uppercase tracking-widest text-neutral-500 select-none">
              {t("editor.canvas.custom")}
            </p>
            <div className="flex items-center gap-1 px-3 pb-2 pt-1">
              <input
                type="number"
                min={MIN_CANVAS_SIZE}
                max={MAX_CANVAS_SIZE}
                value={customW}
                aria-label={t("editor.canvas.width")}
                placeholder={t("editor.canvas.width")}
                onChange={(event) => setCustomW(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") applyCustom();
                }}
                className="nodrag w-0 flex-1 rounded-lg bg-white/[0.07] px-2 py-1 text-[11px] font-mono text-neutral-200 placeholder:text-neutral-400 outline-none focus:ring-1 focus:ring-white/20"
              />
              <span className="text-[10px] text-neutral-500">×</span>
              <input
                type="number"
                min={MIN_CANVAS_SIZE}
                max={MAX_CANVAS_SIZE}
                value={customH}
                aria-label={t("editor.canvas.height")}
                placeholder={t("editor.canvas.height")}
                onChange={(event) => setCustomH(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") applyCustom();
                }}
                className="nodrag w-0 flex-1 rounded-lg bg-white/[0.07] px-2 py-1 text-[11px] font-mono text-neutral-200 placeholder:text-neutral-400 outline-none focus:ring-1 focus:ring-white/20"
              />
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customW || !customH}
                className="rounded-lg bg-white/[0.09] px-2 py-1 text-[11px] font-mono text-neutral-300 transition-colors hover:bg-white/[0.14] hover:text-white disabled:opacity-30"
              >
                {t("editor.canvas.apply")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

EditorCanvasPresets.propTypes = {
  engine: PropTypes.object,
  doc: PropTypes.shape({
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  placement: PropTypes.oneOf(["auto", "top", "bottom"]),
};
