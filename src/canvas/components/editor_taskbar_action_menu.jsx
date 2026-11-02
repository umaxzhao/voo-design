import { Children, cloneElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import EditorTooltip from "./editor_tooltip.jsx";

/** Portal keeps grouped actions outside the quickbar's horizontal scroll clip. */
export default function EditorTaskbarActionMenu({ id, label, icon, children }) {
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const close = () => setPosition(null);

  useEffect(() => {
    if (!position) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) close();
    };
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        triggerRef.current?.focus();
      } else if (event.key === "Tab") {
        close();
        triggerRef.current?.focus();
      } else if (menuRef.current?.contains(event.target) && ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = [...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
        const current = items.indexOf(document.activeElement);
        const offset = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + offset + items.length) % items.length;
        items[next]?.focus();
      }
    };
    const scroll = (event) => {
      if (!menuRef.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [position]);

  const toggle = () => {
    if (position) return close();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const above = rect.top > window.innerHeight - rect.bottom;
    setPosition({
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - 88, window.innerWidth - 184)),
      ...(above ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      maxHeight: Math.max(48, (above ? rect.top : window.innerHeight - rect.bottom) - 16),
    });
  };

  return <>
    <EditorTooltip title={label}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        data-testid={`editor-taskbar-${id}-menu`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4] ${position ? "bg-white/15" : ""}`}
        onClick={toggle}
      >{icon}</button>
    </EditorTooltip>
    {position ? createPortal(
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        data-testid={`editor-taskbar-${id}-options`}
        className="fixed z-[100] grid w-44 max-w-[calc(100vw-16px)] grid-cols-4 justify-items-center gap-1 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-2 shadow-pop"
        style={position}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          if (event.target.closest("button")) {
            close();
            triggerRef.current?.focus();
          }
        }}
      >{Children.map(children, (child) => child ? cloneElement(child, { role: "menuitem" }) : null)}</div>,
      document.body,
    ) : null}
  </>;
}

EditorTaskbarActionMenu.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired,
};
