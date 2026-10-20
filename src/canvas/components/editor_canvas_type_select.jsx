import { EDITOR_BETA_ENABLED } from "../editor-beta-features.js";
import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../use_i18n.js";
import { CANVAS_TYPE } from "../editor/scene_doc_factory.js";
import { IconCheck, IconChevronDown } from "../icons.jsx";

const OPTIONS = [
  [CANVAS_TYPE.DESIGN, "editor.canvasType.design"],
  [CANVAS_TYPE.MOTION, "editor.canvasType.motion"],
  [CANVAS_TYPE.THREE_D, "editor.canvasType.threeD"],
];

/**
 * One tint per frame type, always a /10 wash with the tone in the text:
 * mint for design (system & flow), purple for motion, blue for 3D.
 */
export const CANVAS_TYPE_TONES = Object.freeze({
  [CANVAS_TYPE.DESIGN]: {
    wash: "bg-[#a7ffd4]/10",
    // The focused frame's header bar: half the tone over the stage grey, with
    // dark text on it.
    bar: "bg-[#a7ffd4]/50",
    text: "text-[#a7ffd4]",
    solid: "bg-[#a7ffd4] text-black",
    label: "editor.canvasType.design",
  },
  [CANVAS_TYPE.MOTION]: {
    wash: "bg-[#E5B2FF]/10",
    bar: "bg-[#E5B2FF]/50",
    text: "text-[#eed0ff]",
    solid: "bg-[#E5B2FF] text-black",
    label: "editor.canvasType.motion",
  },
  [CANVAS_TYPE.THREE_D]: {
    wash: "bg-[#b2ccff]/10",
    bar: "bg-[#b2ccff]/50",
    text: "text-[#b2ccff]",
    solid: "bg-[#b2ccff] text-black",
    label: "editor.canvasType.threeD",
  },
});

/**
 * The canvas-type switch: a dropdown at the right of a frame's header, tinted
 * with the current type's colour. The menu is in-app rather than a native
 * <select>, whose system popup ignores the editor's surfaces.
 */
export default function EditorCanvasTypeSelect({
  value,
  onChange,
  onBar = false,
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const tone = CANVAS_TYPE_TONES[value];

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (
        event.type === "pointerdown" &&
        (rootRef.current?.contains(event.target) ||
          menuRef.current?.contains(event.target))
      )
        return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [open]);

  if (!EDITOR_BETA_ENABLED) return null;

  const currentLabel = t(OPTIONS.find(([type]) => type === value)[1]);
  return (
    <div
      ref={rootRef}
      data-testid="editor-canvas-type"
      data-canvas-type={value}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className="relative shrink-0"
    >
      <button
        type="button"
        data-testid="editor-canvas-type-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("editor.canvasType.label")}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAnchor({ right: window.innerWidth - box.right, top: box.bottom });
          setOpen((current) => !current);
        }}
        className={`flex items-center gap-1 rounded-lg px-1.5 py-1 font-mono text-[11px] leading-none transition-colors ${
          onBar
            ? "text-black/80 hover:bg-black/10"
            : `hover:bg-white/10 ${tone.text}`
        }`}
      >
        {currentLabel}
        <IconChevronDown size={10} strokeWidth={1.5} />
      </button>
      {open && anchor
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ right: anchor.right, top: anchor.top + 4 }}
              className="fixed z-50 flex min-w-24 flex-col gap-0.5 rounded-xl border border-white/10 bg-neutral-900 p-1 shadow-pop"
            >
              {OPTIONS.map(([type, label]) => {
                const active = value === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    data-testid={`editor-canvas-type-${type}`}
                    onClick={() => {
                      setOpen(false);
                      if (!active) onChange(type);
                    }}
                    className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left font-mono text-[10px] leading-none transition-colors hover:bg-white/10 ${CANVAS_TYPE_TONES[type].text}`}
                  >
                    {t(label)}
                    {active ? <IconCheck size={10} strokeWidth={1.5} /> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

EditorCanvasTypeSelect.propTypes = {
  value: PropTypes.oneOf(Object.values(CANVAS_TYPE)).isRequired,
  onChange: PropTypes.func.isRequired,
  /** Sits on a tinted header bar: dark text instead of the tone colour. */
  onBar: PropTypes.bool,
};
