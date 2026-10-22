import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../use_i18n.js";
import { executeEditorCommand } from "../editor/command_table.js";
import { generateCode } from "../codegen/index.js";
import { copyEditorHtml } from "../editor/editor_html_clipboard.js";
import EditorCodeExportDialog, {
  resolveCodegenAssets,
  tOr,
} from "./editor_code_export_dialog.jsx";
import { canConvertToPath } from "../editor/scene_model.js";
import EditorPathMenuItems from "./editor_path_menu_items.jsx";
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
}) {
  const { t } = useI18n();
  const isMac = isMacPlatform();
  const is3D =
    engine?.getCanvasType?.() === "3d" ||
    engine?.getDocument?.()?.canvasType === "3d";
  const ref = useRef(null);
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
      if (ref.current?.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event) => {
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
      if (!navigator.clipboard?.writeText) throw new Error("codegen-no-clipboard");
      await navigator.clipboard.writeText(result.code);
    } catch {
      window.alert(
        tOr(t, "editor.codegen.copyFailed", "Could not copy code."),
      );
    }
  };

  const itemClass =
    "flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-left text-[11px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:bg-white/10 focus:text-white";
  const disabledClass = `${itemClass} opacity-40 cursor-default hover:bg-transparent hover:text-neutral-300 focus:bg-transparent focus:text-neutral-300`;

  const canGroup = engine.canGroupSelection?.() ?? false;
  const canUngroup = engine.canUngroupSelection?.() ?? false;
  /** Pixel-selection actions only make sense while a selection exists. */
  const hasPixelSelection = Boolean(
    engine.getPixelSelection?.()?.contours?.length,
  );
  /** A pen path can be promoted to a selection or a filled shape. */
  const selectedNode = engine.getSelected?.() ?? null;
  const isPenPath =
    selectedCount === 1 &&
    selectedNode?.kind === "path" &&
    selectedNode.pen === true;
  const canConvertPath =
    selectedCount >= 1 &&
    ((selectedNode && canConvertToPath(selectedNode)) ||
      (engine.getSelectedNodes?.()?.some?.(canConvertToPath) ?? false));
  const selectedNodes =
    engine.getSelectedNodes?.() ?? (selectedNode ? [selectedNode] : []);
  const canTypeOnPath = selectedCount === 1 && selectedNode?.kind === "path";
  const canAttachTextToPath =
    selectedCount === 2 &&
    selectedNodes.some((n) => n.kind === "text") &&
    selectedNodes.some((n) => n.kind === "path");
  const canDetachTextFromPath =
    selectedCount === 1 &&
    selectedNode?.kind === "text" &&
    Boolean(selectedNode?.textPath);

  return (
    <div
      ref={ref}
      className={`fixed z-50 rounded-2xl bg-neutral-900 p-1 shadow-menu ring-1 ring-white/10 font-mono ${codeDialogOpen ? "hidden" : ""}`}
      style={{ left: x, top: y }}
      role="menu"
      aria-label={t("editor.menu.canvasMenu")}
      aria-hidden={codeDialogOpen || undefined}
    >
      {hasPixelSelection ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() =>
              run(() => {
                void executeEditorCommand("layer_via_copy", engine, {
                  targetNodeId: activeTargetNodeId,
                }).catch((err) => {
                  if (err?.code !== "NO_SELECTION") {
                    console.error("layer_via_copy failed", err);
                  }
                });
              })
            }
          >
            <span>{t("editor.menu.layerFromSelection")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⌘J", isMac)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() =>
              run(() => {
                void executeEditorCommand("stroke_selection", engine, {
                  width: 4,
                  targetNodeId: activeTargetNodeId,
                }).catch((err) => {
                  if (err?.code !== "NO_SELECTION") {
                    console.error("stroke_selection failed", err);
                  }
                });
              })
            }
          >
            <span>{t("editor.menu.strokeSelection")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() =>
              run(() => {
                void executeEditorCommand("refine_selection", engine, {
                  operation: "feather",
                  amount: 8,
                  targetNodeId: activeTargetNodeId,
                }).catch((err) => {
                  if (err?.code !== "NO_SELECTION") {
                    console.error("refine_selection failed", err);
                  }
                });
              })
            }
          >
            <span>{t("editor.menu.featherSelection")}</span>
          </button>
          <div className="mx-1 my-0.5 h-px bg-white/10" />
        </>
      ) : null}
      {isPenPath ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.pathToSelection())}
          >
            <span>{t("editor.menu.pathToSelection")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.pathToShape())}
          >
            <span>{t("editor.menu.pathToShape")}</span>
          </button>
          <div className="mx-1 my-0.5 h-px bg-white/10" />
        </>
      ) : null}
      {canConvertPath ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.convertSelectedToPath?.(targetNodeId ?? null))}
          >
            <span>{t("editor.menu.convertToPath")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⇧⌘O", isMac)}</span>
          </button>
          <div className="mx-1 my-0.5 h-px bg-white/10" />
        </>
      ) : null}
      {selectedCount === 1 && (selectedNode?.strokeWidth > 0 || selectedNode?.stroke) && (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.expandSelectedStroke?.())}
          >
            <span>{t("editor.menu.path.expandStroke")}</span>
          </button>
          <div className="mx-1 my-0.5 h-px bg-white/10" />
        </>
      )}
      {selectedCount >= 2 && (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.destructiveBoolean?.("union"))}
          >
            <span>{t("editor.menu.boolean.union")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⌥⌘U", isMac)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.destructiveBoolean?.("subtract"))}
          >
            <span>{t("editor.menu.boolean.subtract")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⌥⌘S", isMac)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.destructiveBoolean?.("intersect"))}
          >
            <span>{t("editor.menu.boolean.intersect")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⌥⌘I", isMac)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.destructiveBoolean?.("exclude"))}
          >
            <span>{t("editor.menu.boolean.exclude")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⌥⌘X", isMac)}</span>
          </button>
          <div className="mx-1 my-0.5 h-px bg-white/10" />
        </>
      )}
      <EditorPathMenuItems
        engine={engine}
        nodes={engine.getSelectedNodes?.() ?? []}
        run={run}
        itemClass={itemClass}
      />
      {canTypeOnPath && (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.typeOnSelectedPath?.())}
          >
            <span>{t("editor.menu.path.typeOnPath")}</span>
          </button>
          <div className="mx-1 my-0.5 h-px bg-white/10" />
        </>
      )}
      {canAttachTextToPath && (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.attachTextToPath?.())}
          >
            <span>{t("editor.menu.path.attachText")}</span>
          </button>
          <div className="mx-1 my-0.5 h-px bg-white/10" />
        </>
      )}
      {canDetachTextFromPath && (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.detachTextFromPath?.())}
          >
            <span>{t("editor.menu.path.detachText")}</span>
          </button>
          <div className="mx-1 my-0.5 h-px bg-white/10" />
        </>
      )}
      {selectedCount >= 1 ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.cutSelected())}
          >
            <span>{t("editor.menu.cut")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⌘X", isMac)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.duplicateSelected())}
          >
            <span>{t("editor.menu.duplicate")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⌘D", isMac)}</span>
          </button>
          {onCreateComponent && !is3D ? (
            <button
              type="button"
              role="menuitem"
              data-testid="editor-menu-create-component"
              className={itemClass}
              onClick={() => run(onCreateComponent)}
            >
              <span>{t("editor.component.create")}</span>
              <span className="text-[9px] text-neutral-500">{formatShortcut("⌘⌥K", isMac)}</span>
            </button>
          ) : null}
          {selectedCount === 1 &&
          selectedNode?.kind === "canvasInstance" &&
          onDetachInstance ? (
            <button
              type="button"
              role="menuitem"
              data-testid="editor-menu-detach-instance"
              className={itemClass}
              onClick={() => run(() => onDetachInstance(selectedNode.id))}
            >
              <span>{t("editor.component.detach")}</span>
              <span className="text-[9px] text-neutral-500">{formatShortcut("⌘⌥B", isMac)}</span>
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.copySelectedSvg?.())}
          >
            <span>{t("editor.menu.copySvg")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() =>
              run(
                () =>
                  void copyEditorHtml(engine, true).catch(() =>
                    window.alert(t("editor.menu.copyHtmlFailed")),
                  ),
              )
            }
          >
            <span>{t("editor.menu.copyHtmlCss")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="editor-menu-copy-code"
            className={itemClass}
            onClick={() => run(() => void copyCode())}
          >
            <span>{tOr(t, "editor.codegen.copyAction", "Copy code")}</span>
          </button>
          {selectedCount === 1 && onEditSvg ? (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => run(() => onEditSvg(selectedNode))}
            >
              <span>{t("editor.menu.editSvg")}</span>
            </button>
          ) : null}
          {selectedNode?.maskId || engine.getMaskEdit?.()?.nodeId ? (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() =>
                run(() =>
                  engine.clearMask(
                    engine.getMaskEdit?.()?.nodeId || selectedNode?.id,
                  ),
                )
              }
            >
              <span>{t("editor.mask.delete")}</span>
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.deleteSelected())}
          >
            <span>{t("editor.menu.delete")}</span>
          </button>

          <div className="mx-1 my-0.5 h-px bg-white/10" />

          <button
            type="button"
            role="menuitem"
            className={canGroup ? itemClass : disabledClass}
            disabled={!canGroup}
            onClick={() => run(() => engine.groupSelection())}
          >
            <span>{t("editor.menu.group")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⌘G", isMac)}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={canUngroup ? itemClass : disabledClass}
            disabled={!canUngroup}
            onClick={() => run(() => engine.ungroupSelection())}
          >
            <span>{t("editor.menu.ungroup")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⇧⌘G", isMac)}</span>
          </button>

          <div className="mx-1 my-0.5 h-px bg-white/10" />

          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() =>
              run(() =>
                engine
                  .getSelectedIds()
                  .forEach((id) => engine.reorderNode(id, 1)),
              )
            }
          >
            <span>{t("editor.menu.bringForward")}</span>
            <span className="text-[9px] text-neutral-500">]</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() =>
              run(() =>
                engine
                  .getSelectedIds()
                  .forEach((id) => engine.reorderNode(id, -1)),
              )
            }
          >
            <span>{t("editor.menu.sendBackward")}</span>
            <span className="text-[9px] text-neutral-500">[</span>
          </button>

          <div className="mx-1 my-0.5 h-px bg-white/10" />

          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() =>
              run(() => engine.moveToFront(engine.getSelectedIds()))
            }
          >
            <span>{t("editor.menu.bringToFront")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⌘]", isMac)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() =>
              run(() => engine.moveToBack(engine.getSelectedIds()))
            }
          >
            <span>{t("editor.menu.sendToBack")}</span>
            <span className="text-[9px] text-neutral-500">{formatShortcut("⌘[", isMac)}</span>
          </button>

          <div className="mx-1 my-0.5 h-px bg-white/10" />
        </>
      ) : null}

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
              <span className="text-[9px] text-neutral-500">{formatShortcut("⌘D", isMac)}</span>
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
            onClick={() => run(() => onImportMedia())}
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
        <span className="text-[9px] text-neutral-500">{formatShortcut("⌘A", isMac)}</span>
      </button>

      <div className="mx-1 my-0.5 h-px bg-white/10" />

      <button
        type="button"
        role="menuitem"
        data-testid="editor-menu-export-code"
        className={itemClass}
        onClick={() => setCodeDialogOpen(true)}
      >
        <span>
          {tOr(t, "editor.codegen.exportAction", "Export design to code...")}
        </span>
      </button>

      {codeDialogOpen ? (
        <EditorCodeExportDialog
          doc={engine.getDocument?.() ?? null}
          selectedIds={engine.getSelectedIds?.() ?? []}
          selectedCount={selectedCount}
          onClose={() => {
            setCodeDialogOpen(false);
            onClose();
          }}
        />
      ) : null}
    </div>
  );
}

EditorContextMenu.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  engine: PropTypes.object.isRequired,
  targetNodeId: PropTypes.string,
  selectedCount: PropTypes.number.isRequired,
  onClose: PropTypes.func.isRequired,
  onDuplicateCanvas: PropTypes.func,
  onDeleteCanvas: PropTypes.func,
  onEditSvg: PropTypes.func,
  onCreateComponent: PropTypes.func,
  onDetachInstance: PropTypes.func,
  /** Opens the editor's file picker for clip or sound import. */
  onImportMedia: PropTypes.func,
};
