import PropTypes from "prop-types";
import { docToScreenRect } from "../editor/chrome_coords.js";
import { useI18n } from "../use_i18n.js";
import CanvasInstanceContent from "./editor_canvas_instance_content.jsx";

/** Component instances on the page, each showing its source canvas. */
export default function EditorCanvasInstances({
  doc,
  viewport,
  selectedId,
  selectedInstanceChild = null,
  nodeIds = null,
  interactive = true,
  resolveCanvas,
  onSelect,
  onOpenSource,
}) {
  const { t } = useI18n();
  return (doc.nodes ?? [])
    .filter(
      (node) =>
        node.kind === "canvasInstance" &&
        node.visible !== false &&
        (!nodeIds || nodeIds.includes(node.id)),
    )
    .map((node) => {
      const sourceDoc = resolveCanvas(node.sourceCanvasId);
      const fullscreen = node.instance?.layoutMode === "fill";
      const rect = docToScreenRect(
        fullscreen
          ? { x: 0, y: 0, width: doc.width, height: doc.height }
          : node,
        viewport,
      );
      const childSelected =
        selectedInstanceChild?.instanceId === node.id &&
        selectedInstanceChild?.sourceCanvasId === node.sourceCanvasId;
      return (
        <div
          key={node.id}
          data-testid="editor-canvas-instance"
          data-instance-id={node.id}
          data-source-canvas-id={node.sourceCanvasId}
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : -1}
          aria-label={node.name || t("editor.instance.label")}
          className={`absolute z-10 overflow-hidden ${interactive ? "" : "pointer-events-none"}`}
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            transform: node.rotation
              ? `rotate(${node.rotation}deg)`
              : undefined,
          }}
          onPointerDown={
            interactive
              ? (event) => {
                  event.stopPropagation();
                  onSelect?.(node.id);
                }
              : undefined
          }
          onDoubleClick={
            interactive
              ? (event) => {
                  event.stopPropagation();
                  onOpenSource?.(node.sourceCanvasId);
                }
              : undefined
          }
          onKeyDown={
            interactive
              ? (event) => {
                  if (event.key === "Enter")
                    onOpenSource?.(node.sourceCanvasId);
                }
              : undefined
          }
        >
          {sourceDoc ? (
            <div className="pointer-events-none absolute inset-0">
              <CanvasInstanceContent
                sourceDoc={sourceDoc}
                selectedNodeId={childSelected ? selectedInstanceChild.nodeId : null}
                selectedNodeIds={
                  childSelected
                    ? Array.isArray(selectedInstanceChild.nodeIds) &&
                      selectedInstanceChild.nodeIds.length > 0
                      ? selectedInstanceChild.nodeIds
                      : selectedInstanceChild.nodeId
                        ? [selectedInstanceChild.nodeId]
                        : []
                    : []
                }
                instance={node.instance}
                width={rect.width}
                height={rect.height}
                resolveCanvas={resolveCanvas}
                visited={new Set([node.sourceCanvasId])}
                depth={0}
              />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-[10px] text-neutral-400">
              {t("editor.instance.missingSource")}
            </div>
          )}
        </div>
      );
    });
}

EditorCanvasInstances.propTypes = {
  doc: PropTypes.object.isRequired,
  viewport: PropTypes.object.isRequired,
  selectedId: PropTypes.string,
  selectedInstanceChild: PropTypes.object,
  nodeIds: PropTypes.arrayOf(PropTypes.string),
  interactive: PropTypes.bool,
  resolveCanvas: PropTypes.func.isRequired,
  onSelect: PropTypes.func,
  onOpenSource: PropTypes.func,
};
