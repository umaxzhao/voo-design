import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useContextMenuBounds } from "./use_context_menu_bounds.js";
import { useI18n } from "../use_i18n.js";
import { generateCode } from "../codegen/index.js";
import { copyEditorHtml } from "../editor/editor_html_clipboard.js";
import { lazy, Suspense } from "react";
const EditorCodeExportDialog = lazy(
  () => import("./editor_code_export_dialog.jsx"),
);
function tOr(t, key, fallback, params = null) {
  const value = t(key, params ?? undefined);
  return value === key ? fallback : value;
}
import { EditorContextMenuState } from "./editor_context_submenu.jsx";
import EditorContextObjectItems from "./editor_context_object_items.jsx";
import EditorContextPathItems from "./editor_context_path_items.jsx";
import { isMacPlatform } from "../use_window_controls.js";

function formatShortcut(shortcut, isMac) {
  if (isMac) return shortcut;
  return shortcut
    .replace(/⇧⌘|⌘⇧/, "Ctrl+Shift+")
    .replace(/⌥⌘|⌘⌥/, "Ctrl+Alt+")
    .replace(/⌘/, "Ctrl+")
    .replace(/⇧/, "Shift+")
    .replace(/⌥/, "Alt+");
}

/**
 * Right-click menu over the editor canvas. Operates on the current selection:
 * duplicate / delete / group / ungroup / layer order, and select-all for the
 * empty canvas. Fixed at the cursor, closes on any click outside or Escape.
 *
 * Accessibility: focuses the first item on open, supports Up/Down/Home/End
 * arrow navigation and Escape to close (ARIA role="menu" + role="menuitem").
 */
export default function EditorContextMenu({
  x,
  y,
  engine,
  targetNodeId = null,
  selectedCount,
  onClose,
  onDuplicateCanvas = null,
  onDeleteCanvas = null,
  onEditSvg = null,
  onCreateComponent = null,
  onDetachInstance = null,
  onImportMedia = null,
  onOpenShortcuts = null,
}) {
  const { t } = useI18n();
  const isMac = isMacPlatform();
  const is3D =
    engine?.getCanvasType?.() === "3d" ||
    engine?.getDocument?.()?.canvasType === "3d";
  const ref = useContextMenuBounds(x, y);
  const submenuState = useState(null);
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const activeTargetNodeId =
    targetNodeId ?? engine?.sourceWorkflowNodeId ?? null;

  // Focus the first menuitem when the menu mounts.
  useEffect(() => {
    const firstItem = ref.current?.querySelector(
      "[role='menuitem']:not([disabled])",
    );
    firstItem?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      // The code dialog is a portal sibling: clicking inside it must not
      // dismiss the menu that owns it.
      if (codeDialogOpen) return;
      if (event.target.closest?.("[data-editor-context-surface]")) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === "Tab") {
        onClose();
        return;
      }
      if (event.target.closest?.("[role=menu]") !== ref.current) return;
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        event.preventDefault();
        const items = Array.from(
          ref.current?.querySelectorAll("[role='menuitem']:not([disabled])") ??
            [],
        );
        if (items.length === 0) return;
        const active = document.activeElement;
        const currentIndex = items.indexOf(active);
        let nextIndex;
        if (event.key === "ArrowDown") {
          nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        } else if (event.key === "ArrowUp") {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else {
          nextIndex = items.length - 1;
        }
        items[nextIndex]?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, codeDialogOpen]);

  const run = (fn) => {
    fn?.();
    onClose();
  };

  /** Copies Tailwind HTML for the current selection (falling back to the page). */
  const copyCode = async () => {
    try {
      const doc = engine.getDocument?.() ?? null;
      const selectedIds = engine.getSelectedIds?.() ?? [];
      const scope = selectedIds.length > 0 ? "selection" : "page";
      const { resolveCodegenAssets } = await import(
        "./editor_code_export_dialog.jsx"
      );
      const { imageSources, imageSizes } = await resolveCodegenAssets(doc, {
        selectedIds,
        scope,
      });
      const result = generateCode({
        doc,
        selectedIds,
        format: "html",
        scope,
        imageSources,
        imageSizes,
      });
      if (!navigator.clipboard?.writeText)
        throw new Error("codegen-no-clipboard");
      await navigator.clipboard.writeText(result.code);
    } catch {
      window.alert(tOr(t, "editor.codegen.copyFailed", "Could not copy code."));
    }
  };

  const itemClass =
    "flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:bg-white/10 focus:text-white";
  const disabledClass = `${itemClass} opacity-40 cursor-default hover:bg-transparent hover:text-neutral-300 focus:bg-transparent focus:text-neutral-300`;

  const canGroup = engine.canGroupSelection?.() ?? false;
  const canUngroup = engine.canUngroupSelection?.() ?? false;
  const selectedNode = engine.getSelected?.() ?? null;
  const menuModel = {
    engine,
    selectedCount,
    selectedNode,
    run,
    t,
    itemClass,
    disabledClass,
    isMac,
    formatShortcut,
    canGroup,
    canUngroup,
    onCreateComponent,
    is3D,
    onDetachInstance,
    onEditSvg,
    copyCode,
    copyEditorHtml,
    targetNodeId,
    activeTargetNodeId,
    openCodeDialog: () => {
      submenuState[1](null);
      setCodeDialogOpen(true);
    },
  };

  return createPortal(
    <EditorContextMenuState.Provider value={submenuState}>
      <div
        ref={ref}
        onPointerOver={(event) => {
          const row = event.target.closest?.("[role=menuitem]");
          if (
            row?.closest("[role=menu]") === ref.current &&
            !row.hasAttribute("aria-haspopup")
          )
            submenuState[1](null);
        }}
        onFocusCapture={(event) => {
          if (
            event.target.closest?.("[role=menu]") === ref.current &&
            !event.target.hasAttribute("aria-haspopup")
          )
            submenuState[1](null);
        }}
        className={`fixed z-[100] min-w-52 overflow-y-auto overscroll-contain rounded-2xl bg-neutral-900 p-1 shadow-menu ring-1 ring-white/10 ${codeDialogOpen ? "hidden" : ""}`}
        style={{ left: x, top: y }}
        data-editor-context-surface="root"
        role="menu"
        aria-label={t("editor.menu.canvasMenu")}
        aria-hidden={codeDialogOpen || undefined}
      >
        <EditorContextObjectItems model={menuModel} />
        <EditorContextPathItems model={menuModel} />
        {selectedCount === 0 && (onDuplicateCanvas || onDeleteCanvas) ? (
          <>
            {onDuplicateCanvas ? (
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => run(() => onDuplicateCanvas())}
              >
                <span>{t("editor.pages.duplicateCanvas")}</span>
                <span className="text-[9px] text-neutral-500">
                  {formatShortcut("⌘D", isMac)}
                </span>
              </button>
            ) : null}
            {onDeleteCanvas ? (
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => run(() => onDeleteCanvas())}
              >
                <span>{t("editor.pages.deleteCanvas")}</span>
                <span className="text-[9px] text-neutral-500">⌫</span>
              </button>
            ) : null}
            <div className="mx-1 my-0.5 h-px bg-white/10" />
          </>
        ) : null}

        {onImportMedia ? (
          <>
            <div className="mx-1 my-0.5 h-px bg-white/10" />
            <button
              type="button"
              role="menuitem"
              data-testid="editor-menu-import-media"
              className={itemClass}
              onClick={() =>
                run(() => onImportMedia(engine.toDocPoint?.(x, y) ?? null))
              }
            >
              <span>{t("editor.menu.importMedia")}</span>
            </button>
          </>
        ) : null}

        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => run(() => engine.selectAll())}
        >
          <span>{t("editor.menu.selectAll")}</span>
          <span className="text-[9px] text-neutral-500">
            {formatShortcut("⌘A", isMac)}
          </span>
        </button>

        <div className="mx-1 my-0.5 h-px bg-white/10" />

        {selectedCount === 0 && (
          <button
            type="button"
            role="menuitem"
            data-testid="editor-menu-export-code"
            className={itemClass}
            onClick={() => setCodeDialogOpen(true)}
          >
            <span>
              {tOr(
                t,
                "editor.codegen.exportAction",
                "Export design to code...",
              )}
            </span>
          </button>
        )}

        {onOpenShortcuts ? (
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(onOpenShortcuts)}
          >
            <span>{t("editor.shortcuts.title")}</span>
            <span className="text-[9px] text-neutral-500">
              {formatShortcut("⌘/", isMac)}
            </span>
          </button>
        ) : null}

        {codeDialogOpen ? (
          <Suspense fallback={null}>
            <EditorCodeExportDialog
              doc={engine.getDocument?.() ?? null}
              selectedIds={engine.getSelectedIds?.() ?? []}
              selectedCount={selectedCount}
              onClose={() => {
                setCodeDialogOpen(false);
                onClose();
              }}
            />
          </Suspense>
        ) : null}
      </div>
    </EditorContextMenuState.Provider>,
    document.body,
  );
}

EditorContextMenu.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  engine: PropTypes.object.isRequired,
  targetNodeId: PropTypes.string,
  selectedCount: PropTypes.number.isRequired,
  onClose: PropTypes.func.isRequired,
  onOpenShortcuts: PropTypes.func,
  onDuplicateCanvas: PropTypes.func,
  onDeleteCanvas: PropTypes.func,
  onEditSvg: PropTypes.func,
  onCreateComponent: PropTypes.func,
  onDetachInstance: PropTypes.func,
  /** Opens the editor's file picker for clip or sound import. */
  onImportMedia: PropTypes.func,
};
