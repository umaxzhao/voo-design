/** Compact Figma-style paint-type switcher for Fill/Stroke rows. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { IconBucket, IconGradient, IconImage } from "../../icons.jsx";

const GRADIENT_TYPES = ["linear", "radial", "angular", "diamond"];

export default function PaintTypeMenu({ value, onChange, label, allowImage = true }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const options = [
    { id: "solid", label: t("editor.colorPicker.solid"), Icon: IconBucket },
    ...GRADIENT_TYPES.map((type) => ({
      id: type,
      label: t(`editor.props.gradient.${type}`),
      Icon: IconGradient,
    })),
    ...(allowImage
      ? [{ id: "image", label: t("editor.props.imageLabel"), Icon: IconImage }]
      : []),
  ];
  const CurrentIcon =
    value === "image" ? IconImage : value === "solid" ? IconBucket : IconGradient;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (rect) {
              setPos({
                left: Math.max(8, Math.min(rect.left, window.innerWidth - 168)),
                top: rect.bottom + 6,
              });
            }
          }
          setOpen((next) => !next);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-800 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      >
        <CurrentIcon size={13} strokeWidth={1.5} />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[150] w-40 rounded-xl border border-white/10 bg-[#181818] p-1 shadow-panel"
              style={{ left: pos.left, top: pos.top }}
            >
              {options.map(({ id, label: optionLabel, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === id}
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] font-mono transition-colors ${
                    value === id
                      ? "bg-white/[0.1] text-white"
                      : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <Icon size={13} strokeWidth={1.5} className="shrink-0" />
                  <span className="truncate">{optionLabel}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

PaintTypeMenu.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  allowImage: PropTypes.bool,
};
