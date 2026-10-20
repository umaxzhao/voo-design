import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import {
  IconBox3,
  IconChevronDown,
  IconCircle,
  IconSquare,
} from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import EditorTooltip from "./editor_tooltip.jsx";

const OBJECTS = [
  { type: "box", labelKey: "editor.three.box", Icon: IconBox3 },
  { type: "sphere", labelKey: "editor.three.sphere", Icon: IconCircle },
  { type: "plane", labelKey: "editor.three.plane", Icon: IconSquare },
];

/**
 * Toolbar entry that drops a 3D object into the current frame, as Spline's
 * Design mode does: it lands as an ordinary layer you then edit in place.
 */
export default function EditorObject3dMenu({ onAdd }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex items-center">
      <EditorTooltip title={t("editor.three.addObject3d")} side="top">
        <button
          type="button"
          data-testid="editor-add-object3d"
          aria-label={t("editor.three.addObject3d")}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={`relative rounded-full p-2.5 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
            open
              ? "bg-white text-black font-medium"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          }`}
        >
          <IconBox3 size={16} />
          <IconChevronDown
            size={7}
            className={`pointer-events-none absolute bottom-1 right-1 ${
              open ? "text-black/70" : "text-neutral-400"
            }`}
          />
        </button>
      </EditorTooltip>
      {open ? (
        <div
          role="menu"
          className="absolute left-1/2 top-full z-40 mt-2 flex min-w-[142px] -translate-x-1/2 flex-col gap-0.5 rounded-xl border border-white/10 bg-black/90 p-1 font-mono shadow-panel backdrop-blur-md"
        >
          {OBJECTS.map(({ type, labelKey, Icon }) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              data-testid={`editor-add-object3d-${type}`}
              onClick={() => {
                onAdd(type);
                setOpen(false);
              }}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-neutral-300 transition-all hover:bg-white/10 hover:text-white"
            >
              <Icon
                size={14}
                className="shrink-0 text-neutral-400 group-hover:text-white"
              />
              <span className="truncate leading-none">{t(labelKey)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

EditorObject3dMenu.propTypes = { onAdd: PropTypes.func.isRequired };
