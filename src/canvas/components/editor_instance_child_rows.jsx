import PropTypes from "prop-types";
import {
  IconBox3,
  IconFolder,
  IconImage,
  IconLayers,
  IconSquare,
  IconVideo,
  ICON_STROKE_WIDTH,
} from "../icons.jsx";
import { describeNode } from "../editor/scene_model_serialization.js";
import { sourceLayerRows } from "./editor-instance-layer-model.js";

function SourceNodeIcon({ kind }) {
  const Icon =
    kind === "mesh3d" || kind === "model3d"
      ? IconBox3
      : kind === "group"
        ? IconFolder
        : kind === "canvasInstance"
          ? IconLayers
          : kind === "image"
            ? IconImage
            : kind === "video"
              ? IconVideo
              : IconSquare;
  return <Icon size={13} strokeWidth={ICON_STROKE_WIDTH} />;
}

SourceNodeIcon.propTypes = { kind: PropTypes.string.isRequired };

export default function EditorInstanceChildRows({
  instanceNode,
  sourceDoc,
  selectedInstanceChild,
  onSelectInstanceChild,
  labels,
  query,
  depth,
}) {
  const rows = sourceLayerRows(
    sourceDoc,
    (node, index) => describeNode(node, index, labels),
    query,
  );
  const isCurrentInstance =
    selectedInstanceChild?.instanceId === instanceNode.id &&
    selectedInstanceChild?.sourceCanvasId === instanceNode.sourceCanvasId;
  const selectedNodeIds = isCurrentInstance
    ? Array.isArray(selectedInstanceChild.nodeIds) &&
      selectedInstanceChild.nodeIds.length > 0
      ? selectedInstanceChild.nodeIds
      : selectedInstanceChild.nodeId
        ? [selectedInstanceChild.nodeId]
        : []
    : [];
  return rows.map(({ node, depth: sourceDepth, index }) => {
    const selected = selectedNodeIds.includes(node.id);
    const label = describeNode(node, index, labels);
    return (
      <div
        key={`${instanceNode.id}:${node.id}`}
        role="option"
        aria-selected={selected}
        data-testid="editor-instance-child-row"
        data-instance-id={instanceNode.id}
        data-source-node-id={node.id}
      >
        <button
          type="button"
          data-no-drag
          aria-label={label}
          aria-pressed={selected}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            const isModifier = event.shiftKey || event.metaKey || event.ctrlKey;
            let nextIds;
            if (isModifier && isCurrentInstance) {
              if (selectedNodeIds.includes(node.id)) {
                nextIds = selectedNodeIds.filter((id) => id !== node.id);
              } else {
                nextIds = [...selectedNodeIds, node.id];
              }
            } else {
              nextIds = [node.id];
            }
            if (nextIds.length === 0) {
              onSelectInstanceChild?.(null);
            } else {
              onSelectInstanceChild?.({
                instanceId: instanceNode.id,
                sourceCanvasId: instanceNode.sourceCanvasId,
                nodeId: nextIds[0],
                nodeIds: nextIds,
              });
            }
          }}
          className={`flex h-7 w-full items-center gap-2 rounded-xl pr-2 text-left text-[11px] font-mono transition-colors ${
            selected
              ? "bg-[#2a2a2a] text-white ring-1 ring-inset ring-[#E5B2FF]/60"
              : "text-neutral-400 hover:bg-[#222222] hover:text-neutral-200"
          }`}
          style={{ paddingLeft: 8 + (depth + 1 + sourceDepth) * 14 }}
        >
          <span className="shrink-0 text-neutral-400">
            <SourceNodeIcon kind={node.kind} />
          </span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
      </div>
    );
  });
}

EditorInstanceChildRows.propTypes = {
  instanceNode: PropTypes.object.isRequired,
  sourceDoc: PropTypes.object.isRequired,
  selectedInstanceChild: PropTypes.shape({
    instanceId: PropTypes.string.isRequired,
    sourceCanvasId: PropTypes.string.isRequired,
    nodeId: PropTypes.string,
    nodeIds: PropTypes.arrayOf(PropTypes.string),
  }),
  onSelectInstanceChild: PropTypes.func,
  labels: PropTypes.object.isRequired,
  query: PropTypes.string.isRequired,
  depth: PropTypes.number.isRequired,
};
