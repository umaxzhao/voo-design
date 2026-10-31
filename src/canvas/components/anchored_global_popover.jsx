import { PopoverScopeContext } from "./popover_scope.js";
import PropTypes from "prop-types";
import { useContext, useLayoutEffect, useState } from "react";
import GlobalOverlayPortal from "./global_overlay_portal.jsx";

const VIEWPORT_GAP = 8;
const MIN_VISIBLE_HEIGHT = 200;

/** Keep anchored global surfaces outside page clipping and inside the viewport. */
export default function AnchoredGlobalPopover({ anchorRef, surfaceRef, label, children, className, width = 300 }) {
  const [position, setPosition] = useState(null);
  const scope = useContext(PopoverScopeContext);
  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const availableWidth = Math.max(0, window.innerWidth - VIEWPORT_GAP * 2);
      const actualWidth = Math.min(width, availableWidth);
      const top = Math.min(anchor.bottom + VIEWPORT_GAP,
        Math.max(VIEWPORT_GAP, window.innerHeight - VIEWPORT_GAP - MIN_VISIBLE_HEIGHT));
      setPosition({
        left: Math.max(VIEWPORT_GAP, Math.min(anchor.right - actualWidth,
          window.innerWidth - VIEWPORT_GAP - actualWidth)),
        top, width: actualWidth,
        maxHeight: Math.max(0, window.innerHeight - top - VIEWPORT_GAP),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, width]);
  return (
    <GlobalOverlayPortal>
      <div ref={surfaceRef} role="dialog" aria-label={label} data-popover-scope={scope ?? undefined}
        className={`fixed z-[100] overflow-y-auto ${className}`}
        style={position ?? { visibility: "hidden" }}
        onPointerDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </GlobalOverlayPortal>
  );
}

AnchoredGlobalPopover.propTypes = {
  anchorRef: PropTypes.shape({ current: PropTypes.object }).isRequired,
  surfaceRef: PropTypes.shape({ current: PropTypes.object }).isRequired,
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string.isRequired,
  width: PropTypes.number,
};
