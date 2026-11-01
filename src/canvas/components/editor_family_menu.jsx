import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import { toolFamilyIcon } from "./tool_family_icons.jsx";
import { useTouchToolTarget, withTouchToolTarget } from "./editor_touch_tool_target.jsx";
import { moveEditorMenuFocus } from "./editor_menu_navigation.js";

/**
 * Turns a tool family's items (see TOOL_FAMILIES) into dropdown entries. The
 * entries select through the family's own `applyItem`, the same path the
 * keyboard shortcuts and the pie menu use, so the dropdown never diverges from
 * them.
 *
 * @param {object} family  An entry of TOOL_FAMILIES.
 * @param {object} context `{ tool, onTool, marqueeMode, brushMode, ... }`.
 */
export function familyMenuItems(family, context) {
  return family.items.map((item) => ({
    key: item.id,
    labelKey: item.labelKey,
    Icon: toolFamilyIcon(item.icon),
    active: Boolean(family.isActiveItem(item, context)),
    onChoose: () => family.applyItem(item, context),
  }));
}

/**
 * Chevron + dropdown that sits on a top-toolbar tool button and lists every
 * choice of that tool's family. The main button is passed as `children` and
 * keeps its own behaviour; this component only adds the menu, so the
 * properties panel does not have to repeat the choices.
 *
 * Mirrors the Select menu: the list is portalled to <body> (the toolbar row
 * clips overflow), closes on an outside press or Escape, and opens with focus
 * on its first item.
 */
export default function EditorFamilyMenu({ menuId, items, children }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Fixed-position coordinates of the dropdown, captured when it opens.
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const chevronRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const pointerStartRef = useRef(null);
  const suppressToolClickRef = useRef(false);
  const lastPointerTypeRef = useRef(null);
  const menuLabel = t("editor.toolOptions");
  const touchTarget = useTouchToolTarget();
  const active = items.some((item) => item.active);

  const openMenu = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = Math.min(180, window.innerWidth - 16);
    const center = rect.left + rect.width / 2;
    setMenuPos({
      top: rect.bottom + 8,
      left: Math.max(
        menuWidth / 2 + 8,
        Math.min(window.innerWidth - menuWidth / 2 - 8, center),
      ),
    });
    setOpen(true);
  };

  const toggleMenu = () => {
    if (open) setOpen(false);
    else openMenu();
  };

  const onPointerDownCapture = (event) => {
    lastPointerTypeRef.current = event.pointerType;
    if (event.pointerType !== "touch") return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      suppressToolClickRef.current = true;
      openMenu();
    }, 450);
  };

  const onPointerMoveCapture = (event) => {
    if (!pointerStartRef.current || event.pointerType !== "touch") return;
    const dx = event.clientX - pointerStartRef.current.x;
    const dy = event.clientY - pointerStartRef.current.y;
    if (Math.hypot(dx, dy) > 8) {
      clearLongPress();
    }
  };

  const clearLongPress = () => {
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    pointerStartRef.current = null;
  };

  const onClickCapture = (event) => {
    if (menuRef.current?.contains(event.target)) {
      suppressToolClickRef.current = false;
      return;
    }
    if (suppressToolClickRef.current) {
      suppressToolClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (
      (touchTarget || lastPointerTypeRef.current === "touch") &&
      active &&
      !event.target.closest?.(".editor-toolbar-menu-trigger")
    ) {
      openMenu();
      event.preventDefault();
      event.stopPropagation();
    }
  };

  useEffect(
    () => () => window.clearTimeout(longPressTimerRef.current),
    [],
  );

  const chooseItem = (item) => {
    item.onChoose();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (moveEditorMenuFocus(event, menuRef.current)) return;
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      (touchTarget ? rootRef.current?.querySelector("[data-toolbar-touch-tool]") : chevronRef.current)?.focus();
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [open, touchTarget]);

  // Keyboard users opening the menu land on its first item.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="editor-toolbar-family relative flex h-11 w-11 shrink-0 items-center justify-center"
      data-testid={`editor-${menuId}-menu`}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={clearLongPress}
      onPointerCancelCapture={clearLongPress}
      onClickCapture={onClickCapture}
    >
      {touchTarget ? withTouchToolTarget(children, { active, open, menuId, menuLabel }) : children}
      <button
        ref={chevronRef}
        type="button"
        data-testid={`editor-${menuId}-menu-trigger`}
        className="editor-toolbar-menu-trigger absolute bottom-0 left-1/2 z-10 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-full text-neutral-400 transition-colors hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900"
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-hidden={touchTarget || undefined}
        tabIndex={touchTarget ? -1 : undefined}
        onClick={toggleMenu}
      >
        <IconChevronDown
          size={10}
          className={`pointer-events-none ${open ? "text-white" : ""}`}
        />
      </button>
      {open && menuPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              id={`editor-${menuId}-menu-list`}
              aria-label={menuLabel}
              data-testid={`editor-${menuId}-menu-list`}
              className="fixed z-[9999] flex min-w-[142px] -translate-x-1/2 flex-col gap-0.5 rounded-xl border border-white/10 bg-black/90 p-1 font-mono shadow-panel backdrop-blur-md"
              style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
            >
              {items.map((item) => {
                const { Icon } = item;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    aria-current={item.active ? "true" : undefined}
                    data-testid={`editor-${menuId}-menu-${item.key}`}
                    onClick={() => chooseItem(item)}
                    className={`editor-family-menu-item group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-all hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7ffd4] ${
                      item.active ? "bg-white/10 text-white" : "text-neutral-300"
                    }`}
                  >
                    <Icon
                      size={14}
                      className="shrink-0 text-neutral-400 group-hover:text-white"
                    />
                    <span className="truncate leading-none">{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

EditorFamilyMenu.propTypes = {
  menuId: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      labelKey: PropTypes.string.isRequired,
      Icon: PropTypes.elementType.isRequired,
      active: PropTypes.bool,
      onChoose: PropTypes.func.isRequired,
    }),
  ).isRequired,
  children: PropTypes.node.isRequired,
};
