import { useState } from "react";
import PropTypes from "prop-types";
import { describeNode } from "../editor/scene_model.js";
import {
  IconChevronDown,
  IconChevronRight,
  IconEyeOff,
  IconFolder,
  IconLock,
  ICON_STROKE_WIDTH,
} from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import { buildInactiveCanvasRows } from "./editor_canvas_tree_model.js";

/**
 * Renders nested layer rows for an inactive canvas in the unified hierarchy.
 * Displays front-to-back layer order, group nesting, collapsible disclosure,
 * and handles clicking to both focus the canvas and select the specific layer.
 *
 * Implements sibling interactive controls (disclosure button + select button)
 * inside a non-interactive row container to prevent invalid nested interactive roles.
 */
export default function EditorCanvasInactiveLayers({
  canvasId,
  nodes = [],
  selectedIds = [],
  selectedGroupId = null,
  onSelectCanvasLayer,
  labels = {},
  query = "",
  collapsedGroupIds,
  onToggleGroupCollapse,
  t: propT,
}) {
  const { t: hookT } = useI18n();
  const t = propT || hookT;

  const [localCollapsed, setLocalCollapsed] = useState(() => new Set());
  const activeCollapsed =
    collapsedGroupIds !== undefined
      ? collapsedGroupIds instanceof Set
        ? collapsedGroupIds
        : new Set(collapsedGroupIds || [])
      : localCollapsed;

  const toggleCollapse = (groupId) => {
    if (onToggleGroupCollapse) {
      onToggleGroupCollapse(groupId, canvasId);
    } else {
      setLocalCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        return next;
      });
    }
  };

  const rows = buildInactiveCanvasRows(nodes, labels, query, {
    collapsedGroupIds: activeCollapsed,
  });
  if (rows.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-0.5"
      data-testid={`inactive-layers-${canvasId}`}
    >
      {rows.map(({ node, index, depth, isGroup, hasChildren, isCollapsed }) => {
        const label = describeNode(node, index, labels);
        const canExpand = isGroup || hasChildren;
        const selected = isGroup
          ? selectedGroupId === node.id
          : selectedIds.includes(node.id);
        const selectedGroup = isGroup && selected;
        const rowColor = selectedGroup
          ? "bg-[#E5B2FF]/10 text-[#eed0ff]"
          : selected
            ? "bg-neutral-800 text-white"
            : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200";

        return (
          <div
            key={node.id}
            data-testid={`inactive-layer-row-${canvasId}-${node.id}`}
            data-canvas-id={canvasId}
            data-layer-id={node.id}
            data-inactive-layer="true"
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            className={`group/layer flex min-h-6 w-full items-center justify-between rounded-lg pr-2 text-left text-[10px] transition-colors ${rowColor}`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {canExpand ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={
                    isCollapsed
                      ? t("editor.layer.expandGroup")
                      : t("editor.layer.collapseGroup")
                  }
                  title={
                    isCollapsed
                      ? t("editor.layer.expandGroup")
                      : t("editor.layer.collapseGroup")
                  }
                  aria-expanded={!isCollapsed}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCollapse(node.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.stopPropagation();
                    }
                  }}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
                >
                  {isCollapsed ? (
                    <IconChevronRight
                      size={11}
                      strokeWidth={ICON_STROKE_WIDTH}
                    />
                  ) : (
                    <IconChevronDown
                      size={11}
                      strokeWidth={ICON_STROKE_WIDTH}
                    />
                  )}
                </button>
              ) : (
                <span className="w-4 shrink-0" aria-hidden="true" />
              )}

              <button
                type="button"
                tabIndex={-1}
                id={`layer-row-${canvasId}-${node.id}`}
                data-canvas-id={canvasId}
                data-layer-id={node.id}
                data-inactive-layer="true"
                role="option"
                aria-selected={selected}
                aria-label={label}
                title={label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelectCanvasLayer?.(canvasId, node.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
              >
                {isGroup ? (
                  <IconFolder
                    size={12}
                    strokeWidth={ICON_STROKE_WIDTH}
                    className={`shrink-0 ${selectedGroup ? "text-[#eed0ff]" : "text-neutral-500"}`}
                  />
                ) : null}
                <span className="truncate">{label}</span>
              </button>
            </div>

            <div className="ml-2 flex shrink-0 items-center gap-1 text-neutral-500">
              {node.visible === false ? (
                <IconEyeOff size={11} strokeWidth={ICON_STROKE_WIDTH} />
              ) : null}
              {node.locked ? (
                <IconLock size={11} strokeWidth={ICON_STROKE_WIDTH} />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

EditorCanvasInactiveLayers.propTypes = {
  canvasId: PropTypes.string.isRequired,
  nodes: PropTypes.array,
  selectedIds: PropTypes.arrayOf(PropTypes.string),
  selectedGroupId: PropTypes.string,
  onSelectCanvasLayer: PropTypes.func,
  labels: PropTypes.object,
  query: PropTypes.string,
  collapsedGroupIds: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  onToggleGroupCollapse: PropTypes.func,
  t: PropTypes.func,
};
