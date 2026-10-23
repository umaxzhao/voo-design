/** Swatch and HexField controls for picking and editing colours. */

import PropTypes from "prop-types";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FigmaColorPicker from "../../color_picker/FigmaColorPicker.jsx";

/** `<input type="color">` only accepts full 6-digit hex, not names or rgba(). */
export const HEX_COLOUR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** The hatched "no paint" swatch face, the same idea as Figma's None. */
export const NONE_PATTERN =
  "repeating-conic-gradient(#3a3a3a 0% 25%, #232323 0% 50%) 0 0 / 8px 8px";

/** Normalise a hex field's text: add the #, expand the 3-digit shorthand. */
export function parseHex(text) {
  let hex = String(text).trim().toLowerCase();
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return HEX_COLOUR.test(hex) ? hex : null;
}

/**
 * Figma's paint swatch: click it to open the colour picker popover.
 *
 * The popover portals to <body>: the properties aside clips absolutely
 * positioned children (`overflow-y-auto`) and its centre-ing translate makes
 * `position: fixed` resolve against the panel instead of the viewport, so an
 * in-tree popup can never escape the panel's box.
 */
export function Swatch({
  value = null,
  onPick,
  ariaLabel,
  previewImage = null,
  isImage = false,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const popRef = useRef(null);
  const valid =
    HEX_COLOUR.test(value ?? "") ||
    (typeof value === "string" && value.includes("-gradient"));

  // Anchored beside the properties panel, on the side with room, vertically
  // centred on the swatch row (Figma style).
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const button = buttonRef.current;
      const pop = popRef.current;
      if (!button || !pop) return;
      const rect = button.getBoundingClientRect();
      const box = pop.getBoundingClientRect();
      const panel = button.closest("aside")?.getBoundingClientRect();
      const gap = 12;
      let left;
      if (panel && panel.left >= box.width + gap + 8) {
        // The panel sits on the right of the screen: room is on its left.
        left = panel.left - box.width - gap;
      } else if (panel) {
        // The panel sits on the left of the screen: room is on its right.
        left = panel.right + gap;
      } else {
        // No panel context — fall back to whichever side of the swatch fits.
        left =
          rect.left >= box.width + gap
            ? rect.left - box.width - gap
            : rect.right + gap;
      }
      left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
      const top = Math.min(
        Math.max(8, rect.top + rect.height / 2 - box.height / 2),
        Math.max(8, window.innerHeight - box.height - 8),
      );
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Outside clicks close — both the button and the portalled popover count
  // as inside.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      if (popRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <div className="relative block shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="relative block h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/10 outline-none transition-colors hover:border-white/30 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        style={{
          background:
            isImage && previewImage
              ? `url(${previewImage}) center / cover no-repeat`
              : valid
                ? value
                : NONE_PATTERN,
        }}
      />

      {open
        ? createPortal(
            <div
              ref={popRef}
              className="fixed z-[100]"
              // Parked off-screen for the first layout pass, then measured.
              style={pos ?? { left: -9999, top: 0 }}
            >
              <FigmaColorPicker
                color={value || "#FFFFFF"}
                imageUrl={previewImage}
                initialType={isImage ? "image" : undefined}
                onChange={(nextColor) => onPick(nextColor)}
                onClose={() => setOpen(false)}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

Swatch.propTypes = {
  value: PropTypes.string,
  onPick: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  previewImage: PropTypes.string,
  isImage: PropTypes.bool,
};

/**
 * Editable hex text, Figma-style: commits on blur or Enter, accepts `abc`,
 * `#abc` and `aabbcc` as well as the full `#aabbcc`. Invalid text snaps back
 * to the current colour (the keyed defaultValue re-renders it).
 */
export function HexField({ value = null, onCommit, ariaLabel }) {
  const valid = HEX_COLOUR.test(value ?? "");
  return (
    <input
      key={valid ? value : "none"}
      type="text"
      defaultValue={valid ? value : ""}
      placeholder="—"
      spellCheck={false}
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onBlur={(event) => {
        const hex = parseHex(event.target.value);
        if (hex && hex !== value) onCommit(hex);
      }}
      className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-[11px] font-mono tabular-nums text-neutral-100 outline-none uppercase cursor-text placeholder:text-neutral-400"
    />
  );
}

HexField.propTypes = {
  value: PropTypes.string,
  onCommit: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string.isRequired,
};
