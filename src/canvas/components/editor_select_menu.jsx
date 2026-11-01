import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconChevronDown,
  IconCursor,
  IconDistort,
  IconPerspective,
  IconVectorSquare,
} from "../icons.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { TOOL_SHORTCUTS } from "../editor/editor_shortcuts.js";
import { useI18n } from "../use_i18n.js";
import EditorTooltip from "./editor_tooltip.jsx";
import { touchToolAttributes, useTouchToolTarget } from "./editor_touch_tool_target.jsx";
import { moveEditorMenuFocus } from "./editor_menu_navigation.js";
import { useHoverMenu } from "./use_hover_menu.js";

const toolButtonClass = (active) =>
  `flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
    active
      ? "bg-white text-black font-medium"
      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
  }`;

// Puppet / deform pin icon (repo-inline SVG so the toolbar does not pull
// lucide-react into the entry chunk, keeping toolbar icons local and compact).
export function PuppetIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" x2="12" y1="17" y2="21" />
      <path d="M5 9L9 5l17 17-4 4-10-10" />
      <path d="M9 5l2-2a2 2 0 0 1 2.83 0L19 8a2 2 0 0 1 0 2.83l-2 2" />
    </svg>
  );
}

PuppetIcon.propTypes = {
  size: PropTypes.number,
};

/**
 * The select family in display order. The top toolbar's Select menu is the
 * only place these choices are listed; the properties panel does not repeat
 * them.
 */
export const SELECT_MENU_ITEMS = Object.freeze([
  { key: "select", tool: TOOL.SELECT, labelKey: "editor.tool.select", Icon: IconCursor },
  { key: "distort", tool: TOOL.DISTORT, labelKey: "editor.tool.distort", Icon: IconDistort },
  { key: "perspective", tool: TOOL.PERSPECTIVE, labelKey: "editor.tool.perspective", Icon: IconPerspective },
  { key: "puppet", tool: TOOL.PUPPET_WARP, labelKey: "editor.tool.puppetWarp", Icon: PuppetIcon },
]);

/**
 * Top-toolbar Select entry. The main button keeps its behaviour (selects the
 * Select tool) and shows the icon of the active select-family mode. A small
 * chevron opens a dropdown that lists the four modes.
 */
export default function EditorSelectMenu({ tool, onTool }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Fixed-position coordinates of the dropdown, captured when it opens. The
  // dropdown is portalled to <body> because the toolbar row clips overflow and
  // its backdrop blur would otherwise trap a fixed child.
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const chevronRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const suppressToolClickRef = useRef(false);
  const lastPointerTypeRef = useRef(null);

  const isSelectFamily =
    tool === TOOL.SELECT ||
    tool === TOOL.SELECT_REGION ||
    tool === TOOL.PERSPECTIVE ||
    tool === TOOL.DISTORT ||
    tool === TOOL.PUPPET_WARP;
  const ActiveIcon =
    tool === TOOL.PERSPECTIVE
      ? IconPerspective
      : tool === TOOL.DISTORT
        ? IconDistort
        : tool === TOOL.PUPPET_WARP
          ? PuppetIcon
          : tool === TOOL.SELECT_REGION
            ? IconVectorSquare
            : IconCursor;

  const selectLabel = t("editor.tool.select");
  const menuLabel = t("editor.toolOptions");
  const touchTarget = useTouchToolTarget();

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

  const hover = useHoverMenu({ open, openMenu, close: () => setOpen(false) });

  const toggleMenu = () => {
    if (hover.pin()) return;
    if (open) setOpen(false);
    else openMenu();
  };

  const onPointerDownCapture = (event) => {
    lastPointerTypeRef.current = event.pointerType;
    if (event.pointerType !== "touch") return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      suppressToolClickRef.current = true;
      openMenu();
    }, 450);
  };

  const clearLongPress = () => {
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
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
      isSelectFamily &&
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
    onTool(item.tool);
    setOpen(false);
  };

  // While the menu is open, a pointer press outside both the trigger and the
  // portalled list closes it, and Escape closes it and returns focus to the
  // chevron.
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
    if (!open || hover.hoverOpenedRef.current) return;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="editor-toolbar-family relative flex h-11 w-11 shrink-0 items-center justify-center"
      data-testid="editor-select-menu"
      onPointerDownCapture={onPointerDownCapture}
      onPointerUpCapture={clearLongPress}
      onPointerCancelCapture={clearLongPress}
      onClickCapture={onClickCapture}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
    >
      <EditorTooltip
        title={touchTarget && isSelectFamily ? `${selectLabel} · ${menuLabel}` : selectLabel}
        shortcut={TOOL_SHORTCUTS[TOOL.SELECT] || ""}
        side="top"
      >
        <button
          type="button"
          data-testid="editor-select-tool"
          onClick={() => onTool(TOOL.SELECT)}
          aria-label={selectLabel}
          aria-pressed={isSelectFamily}
          className={`relative ${toolButtonClass(isSelectFamily)}`}
          {...(touchTarget ? touchToolAttributes({ active: isSelectFamily, open, menuId: "select", label: selectLabel, menuLabel }) : {})}
        >
          <ActiveIcon size={16} />
        </button>
      </EditorTooltip>
      <button
        ref={chevronRef}
        type="button"
        data-testid="editor-select-menu-trigger"
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
              id="editor-select-menu-list"
              aria-label={menuLabel}
              data-testid="editor-select-menu-list"
              className="fixed z-[9999] flex min-w-[142px] -translate-x-1/2 flex-col gap-0.5 rounded-xl border border-white/10 bg-black/90 p-1 font-mono shadow-panel backdrop-blur-md"
              style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
            >
              {SELECT_MENU_ITEMS.map((item) => {
                const { Icon } = item;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    data-testid={`editor-select-menu-${item.key}`}
                    onClick={() => chooseItem(item)}
                    className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-neutral-300 transition-all hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7ffd4]"
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

EditorSelectMenu.propTypes = {
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
};
