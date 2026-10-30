/** Compact Figma-style paint-type switcher for Fill/Stroke rows. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { IconBucket, IconGradient, IconImage } from "../../icons.jsx";
import { moveEditorMenuFocus } from "../editor_menu_navigation.js";

const GRADIENT_TYPES = ["linear", "radial", "angular", "diamond"];
const useViewportLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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

  useViewportLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const anchor = buttonRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const below = anchor.bottom + 6;
    const top = below + menu.height <= window.innerHeight - 8
      ? below
      : anchor.top - menu.height - 6;
    setPos({
      left: Math.max(8, Math.min(anchor.left, window.innerWidth - menu.width - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - menu.height - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector('[aria-checked="true"]')?.focus();
  }, [open, pos]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      // Close this surface before the canvas shortcut clears its selection.
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="relative shrink-0 -translate-x-1">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        onClick={() => setOpen((next) => !next)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      >
        <CurrentIcon size={13} strokeWidth={1.5} />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[150] max-h-[calc(100dvh-16px)] w-40 overflow-y-auto rounded-xl border border-white/10 bg-[#181818] p-1 shadow-panel"
              style={{ left: pos?.left ?? 8, top: pos?.top ?? 8, visibility: pos ? "visible" : "hidden" }}
              onKeyDown={(event) => moveEditorMenuFocus(event, menuRef.current)}
            >
              {options.map(({ id, label: optionLabel, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === id}
                  tabIndex={value === id ? 0 : -1}
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                    buttonRef.current?.focus();
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
