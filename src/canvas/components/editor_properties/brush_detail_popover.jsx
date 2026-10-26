/** Floating brush-detail card that opens beside the properties panel. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";

export default function BrushDetailPopover({ open, onClose, children }) {
  const cardRef = useRef(null);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const panel = document.querySelector('[data-testid="editor-properties-panel"]');
      const card = cardRef.current;
      if (!panel || !card) return;
      const panelRect = panel.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const gap = 12;
      let left = panelRect.left - cardRect.width - gap;
      if (left < 8) left = panelRect.right + gap;
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - cardRect.width - 8)),
        top: Math.max(8, Math.min(panelRect.top + 44, window.innerHeight - cardRect.height - 8)),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (cardRef.current?.contains(event.target)) return;
      onClose?.();
    };
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      ref={cardRef}
      data-testid="brush-detail-popover"
      className="fixed z-[120] w-[264px] rounded-2xl border border-white/10 bg-black/95 p-3 shadow-panel backdrop-blur-md"
      style={position ?? { left: -9999, top: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}

BrushDetailPopover.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node,
};
