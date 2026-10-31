import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { ChevronRight } from "lucide-react";

export const EditorContextMenuState = createContext(null);

/** One secondary level, portaled outside the root menu's scrolling boundary. */
export default function EditorContextSubmenu({
  id,
  label,
  itemClass,
  children,
}) {
  const [active, setActive] = useContext(EditorContextMenuState);
  const trigger = useRef(null);
  const menu = useRef(null);
  const focusOnOpen = useRef(false);
  const open = active === id;
  const show = (focus = false) => {
    focusOnOpen.current = focus;
    setActive(id);
    if (open && focus)
      menu.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
  };
  const close = () => {
    setActive(null);
    trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const element = menu.current;
    const anchor = trigger.current;
    if (!element || !anchor) return undefined;
    const margin = 8;
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    element.style.maxWidth = `${width - margin * 2}px`;
    element.style.maxHeight = `${height - margin * 2}px`;
    const rect = anchor.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    // Open against the adjoining edge; flip left before clamping on small screens.
    const preferred =
      rect.right + bounds.width + margin <= width
        ? rect.right + 4
        : rect.left - bounds.width - 4;
    element.style.left = `${Math.max(margin, Math.min(preferred, width - bounds.width - margin))}px`;
    element.style.top = `${Math.max(margin, Math.min(rect.top - 4, height - bounds.height - margin))}px`;
    if (focusOnOpen.current)
      element.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    const reposition = (event) => {
      if (!element.contains(event.target)) setActive(null);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, setActive]);

  const navigate = (event) => {
    if (["ArrowLeft", "Escape"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      setActive(null);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const items = [
      ...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)'),
    ];
    const index = items.indexOf(document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
            items.length;
    items[next]?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `editor-context-${id}` : undefined}
        data-testid={`editor-menu-${id}-submenu`}
        className={itemClass}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") show();
        }}
        onClick={() => show(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            show(true);
          }
        }}
      >
        <span>{label}</span>
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-neutral-400"
          aria-hidden="true"
        />
      </button>
      {open
        ? createPortal(
            <div
              ref={menu}
              id={`editor-context-${id}`}
              role="menu"
              aria-label={label}
              data-editor-context-surface={id}
              data-testid={`editor-menu-${id}-options`}
              className="fixed z-[110] min-w-52 overflow-y-auto overscroll-contain rounded-2xl bg-neutral-900 p-1 shadow-menu ring-1 ring-white/10"
              onKeyDown={navigate}
              onContextMenu={(event) => event.preventDefault()}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
EditorContextSubmenu.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  itemClass: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};
