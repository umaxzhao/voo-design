import PropTypes from "prop-types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_WIDTH = 224;
const VIEWPORT_GAP = 8;
const ANCHOR_GAP = 4;

/** Escape the header's stacking context so the assistant cannot cover the menu. */
export default function TopBarMenuPopover({
  anchorRef,
  onClose,
  label,
  children,
}) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = Math.min(MENU_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
    const top = Math.min(
      anchor.bottom + ANCHOR_GAP,
      window.innerHeight - VIEWPORT_GAP,
    );
    setPosition({
      left: Math.max(
        VIEWPORT_GAP,
        Math.min(
          anchor.right - width,
          window.innerWidth - width - VIEWPORT_GAP,
        ),
      ),
      top,
      width,
      maxHeight: Math.max(0, window.innerHeight - top - VIEWPORT_GAP),
    });
  }, [anchorRef]);
  useLayoutEffect(() => {
    if (position)
      menuRef.current
        ?.querySelector('[role="menuitem"]:not(:disabled)')
        ?.focus({ preventScroll: true });
  }, [position]);

  useEffect(() => {
    const dismiss = (restoreFocus = false) => {
      onClose();
      if (restoreFocus) anchorRef.current?.focus({ preventScroll: true });
    };
    const outside = (event) => {
      if (
        !menuRef.current?.contains(event.target) &&
        !anchorRef.current?.contains(event.target)
      )
        dismiss();
    };
    const resize = () => dismiss();
    const scroll = (event) => {
      if (!menuRef.current?.contains(event.target)) dismiss();
    };
    const keydown = (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        dismiss(true);
        return;
      }
      if (!menuRef.current?.contains(event.target)) return;
      if (event.key === "Tab") {
        // Continue from the trigger's tab order, not the portal at body end.
        dismiss(true);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const items = [
        ...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)'),
      ];
      const current = items.indexOf(document.activeElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      data-testid="topbar-workflow-menu"
      className="ui-scroll fixed z-[100] overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-surface-raised p-1 shadow-menu"
      style={position ?? { visibility: "hidden" }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

TopBarMenuPopover.propTypes = {
  anchorRef: PropTypes.shape({ current: PropTypes.object }).isRequired,
  onClose: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};
