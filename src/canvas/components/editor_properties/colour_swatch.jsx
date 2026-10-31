/** Swatch and HexField controls for picking and editing colours. */

import PropTypes from "prop-types";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FigmaColorPicker from "../../color_picker/FigmaColorPicker.jsx";
import { fillTypeOf } from "../../color_picker/texture-fill.js";
import { PopoverScopeContext, isOwnedPopoverTarget } from "../popover_scope.js";
import { HEX_COLOUR } from "./paint_hex_field.jsx";
export { HEX_COLOUR, HexField, parseHex } from "./paint_hex_field.jsx";
export const NONE_PATTERN = "repeating-conic-gradient(#3a3a3a 0% 25%, #232323 0% 50%) 0 0 / 8px 8px";

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
  opacity = null,
  onOpacityChange = null,
  onOpacityCommit = undefined,
  blendMode = null,
  onBlendModeChange = null,
  allowMedia = false,
  onPaintChange = null,
  imageScaleMode = "fill",
  imagePaint = null
}) {
  const [open, setOpen] = useState(false);
  const owner = useId();
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const popRef = useRef(null);
  const focused = useRef(false);
  const valid = HEX_COLOUR.test(value ?? "") || typeof value === "string" && value.includes("-gradient");

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
        left = rect.left >= box.width + gap ? rect.left - box.width - gap : rect.right + gap;
      }
      left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
      const top = Math.min(Math.max(8, rect.top + rect.height / 2 - box.height / 2), Math.max(8, window.innerHeight - box.height - 8));
      setPos({
        left,
        top
      });
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (popRef.current) observer?.observe(popRef.current);
    if (!focused.current) {
      popRef.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus({
        preventScroll: true
      });
      focused.current = true;
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer?.disconnect();
      focused.current = false;
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, owner]);

  // Outside clicks close — both the button and the portalled popover count
  // as inside.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const onDown = event => {
      if (buttonRef.current?.contains(event.target)) return;
      if (popRef.current?.contains(event.target)) return;
      if (isOwnedPopoverTarget(event.target, owner)) return;
      setOpen(false);
    };
    const onKey = event => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, owner]);
  return <div className="relative block shrink-0">
      <button ref={buttonRef} type="button" aria-label={ariaLabel} title={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)} onKeyDown={event => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
      }
    }} className="relative block h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/10 outline-none transition-colors hover:border-white/30 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40" style={{
      background: isImage && previewImage ? `url(${previewImage}) center / cover no-repeat` : valid ? value : NONE_PATTERN
    }} />

      {open ? createPortal(<div ref={popRef} className="fixed z-[100]"
    // Parked off-screen for the first layout pass, then measured.
    style={pos ?? {
      left: -9999,
      top: 0
    }}>
              <PopoverScopeContext.Provider value={owner}><FigmaColorPicker dialogLabel={ariaLabel} color={value || (isImage ? "transparent" : "#FFFFFF")} imageUrl={previewImage} allowMedia={allowMedia} onPaintChange={onPaintChange} imageScaleMode={imageScaleMode} imagePaint={imagePaint} initialType={fillTypeOf(value) === "texture" ? "texture" : isImage ? "image" : undefined} onChange={nextColor => onPick(nextColor)} onClose={() => {
          setOpen(false);
          buttonRef.current?.focus();
        }} opacity={opacity} onOpacityChange={onOpacityChange} onOpacityCommit={onOpacityCommit} blendMode={blendMode} onBlendModeChange={onBlendModeChange} /></PopoverScopeContext.Provider>
            </div>, document.body) : null}
    </div>;
}
Swatch.propTypes = {
  value: PropTypes.string,
  onPick: PropTypes.func.isRequired,
  allowMedia: PropTypes.bool,
  onPaintChange: PropTypes.func,
  imageScaleMode: PropTypes.string,
  imagePaint: PropTypes.object,
  ariaLabel: PropTypes.string.isRequired,
  previewImage: PropTypes.string,
  isImage: PropTypes.bool,
  /** Opacity in percent, bound to the row that owns this swatch. */
  opacity: PropTypes.number,
  onOpacityChange: PropTypes.func,
  onOpacityCommit: PropTypes.func,
  /** Blend mode shown inside the picker ("source-over" is Normal). */
  blendMode: PropTypes.string,
  onBlendModeChange: PropTypes.func
};
