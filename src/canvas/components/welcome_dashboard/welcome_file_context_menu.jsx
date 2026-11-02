import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WelcomeMenuSurface } from "./welcome_menu_surface.jsx";
import {
  Star,
  Trash2,
  RotateCcw,
  Copy,
  Pencil,
  FolderOpen,
  ChevronRight,
} from "lucide-react";

/** Delay before the move-to submenu closes, so the pointer can cross the gap to it. */
const SUBMENU_CLOSE_DELAY_MS = 150;
/** Horizontal gap between the "移到" row and the submenu panel, in px. */
const SUBMENU_GAP_PX = 4;
/** Panel width in px; must match the w-36 class on the panel (9rem at the default root size). */
const SUBMENU_WIDTH_PX = 144;
/** Row classes shared by the move-to entry and its submenu options; neutral palette only. */
const ROW_CLASS =
  "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-400";

/**
 * Move destinations for a file: every folder except the one it is already in,
 * plus "move back to root" when the file sits inside a folder.
 */
export function getMoveTargets(item, folders) {
  const folderTargets = folders.filter((folder) => folder.name !== item.folder);
  const showRoot = Boolean(item.folder);
  return {
    folderTargets,
    showRoot,
    visible: folderTargets.length > 0 || showRoot,
  };
}

/**
 * Viewport position for the submenu: right of the trigger row, flipped to the
 * left when it would overflow the viewport. Fixed coordinates, because the
 * panel is portalled out of the clipping card.
 */
function computeSubmenuAnchor(trigger) {
  if (!trigger) return null;
  const rect = trigger.getBoundingClientRect();
  const rightSide = rect.right + SUBMENU_GAP_PX;
  const fitsRight = rightSide + SUBMENU_WIDTH_PX <= window.innerWidth;
  const left = fitsRight
    ? rightSide
    : rect.left - SUBMENU_GAP_PX - SUBMENU_WIDTH_PX;
  return { top: Math.max(8, Math.min(rect.top, window.innerHeight - 96)), left: Math.max(8, left) };
}

/**
 * Submenu panel listing the move destinations. Presentational only: the
 * parent decides what to list and how to handle a choice.
 */
export function WelcomeMoveToPanel({
  t,
  folderTargets,
  showRoot,
  anchor,
  panelRef,
  onChoose,
}) {
  return (
    <div
      ref={panelRef}
      role="menu"
      data-welcome-file-menu
      aria-label={t("welcome.folders.moveTo")}
      // Stops the dashboard's outside-mousedown dismiss from closing the whole
      // menu before the click on an option lands (the panel is outside menuRef).
      onMouseDown={(e) => e.stopPropagation()}
      style={{ top: anchor.top, left: anchor.left, maxHeight: `calc(100dvh - ${anchor.top + 8}px)` }}
      className="ui-scroll fixed z-[60] w-36 overflow-y-auto rounded-2xl bg-neutral-900 border border-white/10 shadow-menu py-1"
    >
      {folderTargets.map((folder) => (
        <button
          key={folder.id}
          type="button"
          role="menuitem"
          onClick={(e) => onChoose(e, folder.name)}
          className={ROW_CLASS}
        >
          <FolderOpen size={12} className="text-neutral-400" />
          <span>{folder.name}</span>
        </button>
      ))}
      {showRoot ? (
        <>
          {folderTargets.length > 0 ? (
            <div className="h-px bg-white/10 my-1" />
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={(e) => onChoose(e, null)}
            className={ROW_CLASS}
          >
            <FolderOpen size={12} className="text-neutral-400" />
            <span>{t("welcome.folders.moveToRoot")}</span>
          </button>
        </>
      ) : null}
    </div>
  );
}

/**
 * The single "移到" entry. Opens the submenu on mouse hover, and on click for
 * touch and keyboard (toggle). Closes after a choice, on Escape, or 150 ms
 * after the pointer leaves the row and the panel.
 */
export function WelcomeMoveToItem({ t, item, folders, handleMoveToFolder }) {
  // null while closed; otherwise the fixed viewport anchor of the panel.
  const [anchor, setAnchor] = useState(null);
  const isOpen = anchor !== null;
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const closeTimerRef = useRef(null);
  // True while a mouse pointer is over the entry; a click then keeps the panel open.
  const hoverRef = useRef(false);
  // True while the last pointer to enter was touch; touch emulates mouseenter, which must not open.
  const touchRef = useRef(false);
  // Set by a keyboard-generated click so the first option takes focus.
  const focusFirstRef = useRef(false);

  const { folderTargets, showRoot, visible } = getMoveTargets(item, folders);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  // While open, keep the fixed panel aligned with the row on resize and scroll.
  useEffect(() => {
    if (!isOpen) return undefined;
    const reposition = () => setAnchor(computeSubmenuAnchor(triggerRef.current));
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen]);

  // A keyboard-opened submenu moves focus into the panel, since it is not next in Tab order.
  useEffect(() => {
    if (!isOpen || !focusFirstRef.current) return;
    focusFirstRef.current = false;
    panelRef.current?.querySelector("button")?.focus();
  }, [isOpen]);

  if (!visible) return null;

  const openPanel = () => {
    clearTimeout(closeTimerRef.current);
    setAnchor(computeSubmenuAnchor(triggerRef.current));
  };
  const closePanel = () => {
    clearTimeout(closeTimerRef.current);
    setAnchor(null);
  };
  const scheduleClose = () => {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(
      () => setAnchor(null),
      SUBMENU_CLOSE_DELAY_MS,
    );
  };

  const handlePointerEnter = (e) => {
    touchRef.current = e.pointerType === "touch";
  };
  const handleMouseEnter = () => {
    if (touchRef.current) return;
    hoverRef.current = true;
    openPanel();
  };
  const handleMouseLeave = () => {
    hoverRef.current = false;
    scheduleClose();
  };

  const handleTriggerClick = (e) => {
    // Hover already opened the panel for a mouse user; a click keeps it open.
    if (hoverRef.current) {
      openPanel();
      return;
    }
    if (isOpen) {
      closePanel();
      return;
    }
    // e.detail is 0 for keyboard-generated clicks.
    focusFirstRef.current = e.detail === 0;
    openPanel();
  };

  const handleKeyDown = (e) => {
    if (e.key !== "Escape" || !isOpen) return;
    e.stopPropagation();
    closePanel();
    triggerRef.current?.focus();
  };

  const handleChoose = (e, folderName) => {
    hoverRef.current = false;
    closePanel();
    handleMoveToFolder(e, item.id, folderName);
  };

  return (
    <div
      className="relative w-full"
      onPointerEnter={handlePointerEnter}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleTriggerClick}
        className={ROW_CLASS}
      >
        <FolderOpen size={12} className="text-neutral-400" />
        <span>{t("welcome.folders.moveTo")}</span>
        <ChevronRight size={12} className="ml-auto text-neutral-400" />
      </button>
      {isOpen
        ? createPortal(
            <WelcomeMoveToPanel
              t={t}
              folderTargets={folderTargets}
              showRoot={showRoot}
              anchor={anchor}
              panelRef={panelRef}
              onChoose={handleChoose}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

/** Context action dropdown menu for a file card or row in the welcome dashboard. */
export function WelcomeFileContextMenu({
  t,
  item,
  isTrash,
  folders,
  handleRestore,
  handleDeletePermanently,
  handleOpenRecent,
  handleOpenLocal,
  handleToggleStar,
  handleMoveToFolder,
  handleStartRename,
  handleDuplicate,
  handleMoveToTrash,
  onClose,
}) {
  return (
    <WelcomeMenuSurface label={t("welcome.actions.more")} onClose={onClose}>
      {isTrash ? (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleRestore(e, item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <RotateCcw size={12} className="text-neutral-400" />
            <span>{t("welcome.actions.restore")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleDeletePermanently(e, item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Trash2 size={12} />
            <span>{t("welcome.actions.deletePermanently")}</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleOpenRecent(item)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <FolderOpen size={12} className="text-neutral-400" />
            <span>{t("welcome.actions.openFile")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleOpenLocal}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <FolderOpen size={12} className="text-neutral-400" />
            <span>{t("welcome.actions.openLocal")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleToggleStar(e, item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Star size={12} className={item.starred ? "text-neutral-100 fill-neutral-100" : "text-neutral-400"} />
            <span>{item.starred ? t("welcome.actions.unstar") : t("welcome.actions.star")}</span>
          </button>
          <WelcomeMoveToItem
            t={t}
            item={item}
            folders={folders}
            handleMoveToFolder={handleMoveToFolder}
          />
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleStartRename(e, item)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Pencil size={12} className="text-neutral-400" />
            <span>{t("welcome.actions.rename")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleDuplicate(e, item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Copy size={12} className="text-neutral-400" />
            <span>{t("welcome.actions.duplicate")}</span>
          </button>
          <div className="h-px bg-white/10 my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleMoveToTrash(e, item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Trash2 size={12} />
            <span>{t("welcome.actions.moveToTrash")}</span>
          </button>
        </>
      )}
    </WelcomeMenuSurface>
  );
}
