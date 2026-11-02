import PropTypes from "prop-types";
import { executeEditorCommand } from "../editor/command_table.js";
import { canConvertToPath } from "../editor/scene_model.js";
import { pathMenuActions } from "../editor/path_menu_actions.js";
import EditorPathMenuItems from "./editor_path_menu_items.jsx";
import EditorContextSubmenu from "./editor_context_submenu.jsx";

export default function EditorContextPathItems({ model }) {
  const {
    engine,
    selectedCount,
    targetNodeId,
    activeTargetNodeId,
    run,
    t,
    itemClass,
    formatShortcut,
    isMac,
    onEditSvg,
  } = model;
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

  const applicable =
    hasPixelSelection ||
    isPenPath ||
    canConvertPath ||
    (selectedCount === 1 &&
      (selectedNode?.strokeWidth > 0 || selectedNode?.stroke)) ||
    selectedCount >= 2 ||
    canTypeOnPath ||
    canAttachTextToPath ||
    canDetachTextFromPath ||
    pathMenuActions(selectedNodes).length > 0 ||
    (selectedCount === 1 && onEditSvg);
  if (!applicable) return null;
  return (
    <EditorContextSubmenu
      id="path"
      label={t("editor.menu.paths")}
      itemClass={itemClass}
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
            <span className="text-[9px] text-neutral-500">
              {formatShortcut("⌘J", isMac)}
            </span>
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
            onClick={() =>
              run(() => engine.convertSelectedToPath?.(targetNodeId ?? null))
            }
          >
            <span>{t("editor.menu.convertToPath")}</span>
            <span className="text-[9px] text-neutral-500">
              {formatShortcut("⇧⌘O", isMac)}
            </span>
          </button>
          <div className="mx-1 my-0.5 h-px bg-white/10" />
        </>
      ) : null}
      {selectedCount === 1 &&
        (selectedNode?.strokeWidth > 0 || selectedNode?.stroke) && (
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
            <span className="text-[9px] text-neutral-500">
              {formatShortcut("⌥⌘U", isMac)}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.destructiveBoolean?.("subtract"))}
          >
            <span>{t("editor.menu.boolean.subtract")}</span>
            <span className="text-[9px] text-neutral-500">
              {formatShortcut("⌥⌘S", isMac)}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.destructiveBoolean?.("intersect"))}
          >
            <span>{t("editor.menu.boolean.intersect")}</span>
            <span className="text-[9px] text-neutral-500">
              {formatShortcut("⌥⌘I", isMac)}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => engine.destructiveBoolean?.("exclude"))}
          >
            <span>{t("editor.menu.boolean.exclude")}</span>
            <span className="text-[9px] text-neutral-500">
              {formatShortcut("⌥⌘X", isMac)}
            </span>
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
    </EditorContextSubmenu>
  );
}
EditorContextPathItems.propTypes = { model: PropTypes.object.isRequired };
