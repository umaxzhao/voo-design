import PropTypes from "prop-types";
import { docToScreenRect } from "../editor/chrome_coords.js";
import { getCanvasType } from "../editor/canvas-composition-model.js";
import { useI18n } from "../use_i18n.js";
import CanvasInstanceContent from "./editor_canvas_instance_content.jsx";

export default function EditorCanvasInstances({
  doc,
  viewport,
  selectedId,
  selectedInstanceChild = null,
  hostTime = null,
  nodeIds = null,
  interactive = true,
  threeInputTarget = null,
  onSelectThreeNode = null,
  resolveCanvas,
  onSelect,
  onOpenSource,
  adjustingInstanceId = null,
  onInstanceCameraChange = null,
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
      return (
        <div
          key={node.id}
          data-testid="editor-canvas-instance"
          data-instance-id={node.id}
          data-source-canvas-id={node.sourceCanvasId}
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : -1}
          aria-label={node.name || t("editor.instance.label")}
          className={`absolute z-10 overflow-hidden ${interactive ? "" : "pointer-events-none"} ${selectedId === node.id && adjustingInstanceId !== node.id ? "ring-1 ring-[#E5B2FF]" : ""} ${adjustingInstanceId === node.id ? "ring-2 ring-[#a7ffd4]" : ""}`}
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
          {sourceDoc &&
          (getCanvasType(sourceDoc) !== "3d" || threeInputTarget) ? (
            <div className="pointer-events-none absolute inset-0">
              <CanvasInstanceContent
                sourceDoc={sourceDoc}
                selectedNodeId={
                  selectedInstanceChild?.instanceId === node.id &&
                  selectedInstanceChild?.sourceCanvasId === node.sourceCanvasId
                    ? selectedInstanceChild.nodeId
                    : null
                }
                selectedNodeIds={
                  selectedInstanceChild?.instanceId === node.id &&
                  selectedInstanceChild?.sourceCanvasId === node.sourceCanvasId
                    ? Array.isArray(selectedInstanceChild.nodeIds) &&
                      selectedInstanceChild.nodeIds.length > 0
                      ? selectedInstanceChild.nodeIds
                      : selectedInstanceChild.nodeId
                        ? [selectedInstanceChild.nodeId]
                        : []
                    : []
                }
                hostTime={hostTime}
                threeInputTarget={threeInputTarget}
                adjustingView={adjustingInstanceId === node.id}
                onInstanceCameraChange={onInstanceCameraChange}
                threeInteractionEnabled={
                  selectedId === node.id ||
                  selectedInstanceChild?.instanceId === node.id
                }
                onSelectThreeNode={
                  onSelectThreeNode
                    ? (sourceNodeId, meta) =>
                        onSelectThreeNode(node, sourceNodeId, meta)
                    : null
                }
                instance={node.instance}
                width={rect.width}
                height={rect.height}
                resolveCanvas={resolveCanvas}
                visited={new Set([node.sourceCanvasId])}
                depth={0}
              />
            </div>
          ) : sourceDoc ? null : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-[10px] text-neutral-400">
              {t("editor.instance.missingSource")}
            </div>
          )}
          {adjustingInstanceId === node.id ? (
            <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-neutral-900/90 px-2 py-1 text-[10px] text-[#a7ffd4]">
              {t("editor.instance.adjustingView")}
            </div>
          ) : null}
        </div>
      );
    });
}

EditorCanvasInstances.propTypes = {
  doc: PropTypes.object.isRequired,
  viewport: PropTypes.object.isRequired,
  selectedId: PropTypes.string,
  selectedInstanceChild: PropTypes.shape({
    instanceId: PropTypes.string.isRequired,
    sourceCanvasId: PropTypes.string.isRequired,
    nodeId: PropTypes.string.isRequired,
  }),
  hostTime: PropTypes.number,
  nodeIds: PropTypes.arrayOf(PropTypes.string),
  interactive: PropTypes.bool,
  threeInputTarget: PropTypes.instanceOf(Element),
  onSelectThreeNode: PropTypes.func,
  resolveCanvas: PropTypes.func.isRequired,
  onSelect: PropTypes.func,
  onOpenSource: PropTypes.func,
  adjustingInstanceId: PropTypes.string,
  onInstanceCameraChange: PropTypes.func,
};
