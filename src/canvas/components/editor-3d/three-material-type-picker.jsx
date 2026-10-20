import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MATERIAL_LAYER_TYPES } from "../../editor/three-scene-materials.js";

const REFERENCE_TYPES = [
  "aiTexture",
  "image",
  "video",
  "color",
  "depth",
  "normal",
  "gradient",
  "noise",
  "fresnel",
  "cavity",
  "dust",
  "rainbow",
  "toon",
  "outline",
  "glass",
  "reflection",
  "matcap",
  "displace",
  "pattern",
  "vertexColor",
];

function getPickerPosition(anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 32);
  const maxHeight = Math.min(480, window.innerHeight - 32);
  const left = Math.max(
    16,
    Math.min(rect.right - width, window.innerWidth - width - 16),
  );
  const below = rect.bottom + 8;
  const top =
    below + maxHeight <= window.innerHeight - 16
      ? below
      : Math.max(16, rect.top - maxHeight - 8);
  return { left, top, width, maxHeight };
}

/** The reference catalog is visible, but only renderer-backed types can be chosen. */
export function ThreeMaterialTypePicker({ anchorRef, onChoose, onClose, t }) {
  const firstOption = useRef(null);
  const dialog = useRef(null);
  const onCloseRef = useRef(onClose);
  const [, refreshPosition] = useState(0);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    firstOption.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const buttons = dialog.current?.querySelectorAll(
        "button:not([disabled])",
      );
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const reposition = () => refreshPosition((count) => count + 1);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      previousFocus?.focus?.();
    };
  }, []);

  const available = REFERENCE_TYPES.filter((type) =>
    MATERIAL_LAYER_TYPES.includes(type),
  );
  const unavailable = REFERENCE_TYPES.filter(
    (type) => !MATERIAL_LAYER_TYPES.includes(type),
  );
  const position = getPickerPosition(anchorRef.current);
  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t("editor.three.chooseLayerType")}
        data-testid="editor-three-material-type-picker"
        style={position}
        className="ui-scroll absolute overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-3 shadow-menu"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-[15px] font-medium text-neutral-100">
            {t("editor.three.chooseLayerType")}
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[11px] text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100"
            onClick={onClose}
          >
            {t("editor.three.closePicker")}
          </button>
        </div>
        <h3 className="mb-2 text-[10px] font-medium text-neutral-400">
          {t("editor.three.availableTypes")}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {available.map((type, index) => (
            <button
              key={type}
              ref={index === 0 ? firstOption : null}
              type="button"
              data-testid={`editor-three-material-type-${type}`}
              className="min-h-9 rounded-lg bg-neutral-800 px-3 text-left text-[11px] text-neutral-100 hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
              onClick={() => onChoose(type)}
            >
              {t(`editor.three.layerType.${type}`)}
            </button>
          ))}
        </div>
        <h3 className="mb-2 mt-5 text-[10px] font-medium text-neutral-400">
          {t("editor.three.comingTypes")}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {unavailable.map((type) => (
            <span
              key={type}
              className="rounded-lg bg-white/[0.04] px-3 py-2 text-[11px] text-neutral-500"
            >
              {t(`editor.three.layerType.${type}`)}
            </span>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}

ThreeMaterialTypePicker.propTypes = {
  anchorRef: PropTypes.object.isRequired,
  onChoose: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
