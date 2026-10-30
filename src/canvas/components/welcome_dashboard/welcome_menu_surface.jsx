import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Keep file actions outside thumbnail clipping and inside the viewport on touch screens. */
export function WelcomeMenuSurface({ label, onClose, children }) {
  const menuRef = useRef(null);
  const closeRef = useRef(onClose);
  const [position, setPosition] = useState(null);
  const portalled = Boolean(position);
  closeRef.current = onClose;

  useEffect(() => {
    const trigger = menuRef.current?.parentElement?.querySelector("button");
    const place = () => {
      if (!trigger || !menuRef.current) return;
      const rect = trigger.getBoundingClientRect();
      const height = Math.min(menuRef.current.scrollHeight, window.innerHeight - 16);
      setPosition({
        left: Math.max(8, Math.min(rect.right - 144, window.innerWidth - 152)),
        top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8)),
        maxHeight: window.innerHeight - 16,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (position) menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [portalled]);

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      data-welcome-file-menu
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeRef.current?.();
          return;
        }
        // Portalled submenus own their arrow navigation even though React events bubble here.
        if (event.target.closest('[role="menu"]') !== event.currentTarget) return;
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const buttons = [...menuRef.current.querySelectorAll("button:not([disabled])")];
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault();
        buttons[next]?.focus();
      }}
      style={position ?? undefined}
      className={`${position ? "fixed" : "absolute right-0 top-7"} ui-scroll z-50 w-36 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 py-1 shadow-menu`}
    >
      {children}
    </div>
  );
  return position ? createPortal(menu, document.body) : menu;
}

WelcomeMenuSurface.propTypes = {
  label: PropTypes.string.isRequired,
  onClose: PropTypes.func,
  children: PropTypes.node.isRequired,
};
