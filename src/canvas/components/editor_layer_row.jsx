import { isBooleanNode, isGroupNode } from "../editor/scene_model.js";
import { isRowSelected } from "../editor/layer_selection.js";
import { IconChevronRight, IconChevronDown, IconEye, IconEyeOff, IconClipMask } from "../icons.jsx";
import EditorLayerThumbnail from "./editor_layer_thumbnail.jsx";
import EditorLayerName from "./editor_layer_name.jsx";
import EditorLayerLocks from "./editor_layer_locks.jsx";
import EditorLayerSublists from "./editor_layer_sublists.jsx";
import { layerPanelModelType } from "./editor_layers_contract.js";
import { layerRowType } from "./editor_layers_contract.js";
export default function EditorLayerRow({
  model,
  row
}) {
  const {
    rowSelectedOf,
    resolveCanvas,
    collapsedIds,
    draggedChip,
    hoveredRowId,
    setHoveredRowId,
    setContextMenu,
    transferKind,
    setDraggedChip,
    overId,
    dragId,
    slot,
    beginRowDrag,
    childrenMap,
    dragUnits,
    objects,
    selectedIds,
    activeIndex,
    isBackgroundSelected,
    toggleGroupCollapse,
    activeCanvasId,
    t,
    onToggle
  } = model;
  const {
    node: object,
    index,
    depth,
    position
  } = row;
  const rowSelected = rowSelectedOf(object);
  const isBoolean = isBooleanNode(object);
  const grouped = isGroupNode(object) || isBoolean;
  const instanceSourceDoc = object.kind === "canvasInstance" ? resolveCanvas?.(object.sourceCanvasId) : null;
  const instanceExpandable = Boolean(instanceSourceDoc?.nodes?.length);
  const expandable = grouped || instanceExpandable;
  const collapsed = expandable && collapsedIds.has(object.id);
  // Top-level rows and group members both drag; a clip-only member
  // (indented under its base but not parented) stays put.
  const draggable = !object.locked && (depth === 0 || Boolean(object.parentId));
  const isDropTarget = Boolean(draggedChip && draggedChip.sourceNodeId !== object.id && !isGroupNode(object) && !isBoolean && hoveredRowId === object.id);
  return <>
    <div
      role="option"
      id={`layer-row-${object.id}`}
      aria-selected={rowSelected}
      {...draggable ? {
        "data-layer-row": true,
        "data-layer-row-id": object.id,
        "data-layer-row-position": position,
        "data-layer-parent-id": object.parentId ?? ""
      } : null}
      // Hover is consumed only by isDropTarget,
      // which also requires an active drag, so
      // tracking it while idle re-rendered every
      // row for no visible effect. Gate on the
      // drag so drop targeting still follows the
      // pointer once a chip is in flight.
      onMouseEnter={() => {
        if (draggedChip) setHoveredRowId(object.id);
      }}
      onMouseLeave={() => {
        if (draggedChip) setHoveredRowId(curr => curr === object.id ? null : curr);
      }}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({
          x: Math.min(event.clientX, window.innerWidth - 176),
          y: Math.min(event.clientY, window.innerHeight - 132),
          index,
          object
        });
      }}
      onDragOver={e => {
        if (draggedChip && draggedChip.sourceNodeId !== object.id && !isGroupNode(object) && !isBoolean) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={e => {
        if (draggedChip && draggedChip.sourceNodeId !== object.id && !isGroupNode(object) && !isBoolean) {
          e.preventDefault();
          e.stopPropagation();
          transferKind(draggedChip.sourceNodeId, object.id, draggedChip.kind, draggedChip.isEffect);
          setDraggedChip(null);
        }
      }}
      className={`relative rounded-xl transition-colors ${isDropTarget ? "bg-emerald-500/10 ring-1 ring-emerald-400/50" : ""}`}
    >
      {!overId && dragId && slot === position && position >= 0 ? <div
        className="pointer-events-none absolute -top-[3px] left-1 right-1 z-20 h-[2px] rounded-full bg-[#a7ffd4]"
      /> : null}
      <div
        onPointerDown={draggable ? event => beginRowDrag(event, {
          node: object,
          position,
          isChild: depth > 0,
          parentId: object.parentId ?? null,
          siblingNodes: depth > 0 ? childrenMap.get(object.parentId) ?? [] : dragUnits,
          range: depth > 0 ? {
            min: 0,
            max: dragUnits.length
          } : undefined
        }) : undefined}
        className={`group/layer relative flex min-h-8 select-none items-center gap-1.5 rounded-lg py-1 transition-colors ${dragId === object.id ? "opacity-40 " : ""}${
        // The drag-over ring wins over the selection shadow, matching the inline boxShadow below.
        overId === object.id ? `bg-neutral-800 ${rowSelectedOf(object) ? "text-neutral-100 " : ""}ring-1 ring-inset ring-[#a7ffd4]` : rowSelectedOf(object) ? `bg-neutral-800 text-neutral-100 ${isRowSelected(objects, object, {
          selectedIds,
          activeIndex,
          isBackgroundSelected
        }) ? "shadow-[inset_0_0_0_1px_#a7ffd4]" : ""}` : "bg-transparent text-neutral-300 hover:bg-white/[0.08]"} ${draggable ? (dragId ? "touch-none " : "touch-pan-y ") + "cursor-default" : ""}`}
        style={{
          boxShadow: rowSelected && overId !== object.id ? "inset 0 0 0 1px #a7ffd4" : undefined,
          paddingLeft: 8 + depth * 16,
          paddingRight: 8
        }}
      >
        {depth > 0 && <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 border-l border-white/10"
          style={{
            left: 8 + (depth - 1) * 16
          }}
        />}
        {expandable ? <button
          type="button"
          tabIndex={-1}
          data-no-drag
          onMouseDown={event => event.preventDefault()}
          onClick={() => toggleGroupCollapse(object.id, activeCanvasId)}
          aria-label={collapsed ? t("editor.layer.expandGroup") : t("editor.layer.collapseGroup")}
          aria-expanded={!collapsed}
          className="-mx-1.5 -my-1 flex h-7 w-7 shrink-0 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-100"
        >
          {collapsed ? <IconChevronRight
            size={12}
          /> : <IconChevronDown
            size={12}
          />}
        </button> : <span
          className="w-4 shrink-0"
          aria-hidden="true"
        />}
        <button
          type="button"
          data-no-drag
          onClick={() => onToggle(index)}
          aria-label={t(object.visible ? "editor.hide" : "editor.show")}
          title={t(object.visible ? "editor.hide" : "editor.show")}
          className="-mx-1.5 -my-1 flex h-7 w-7 shrink-0 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-100 disabled:cursor-default disabled:opacity-35"
        >
          {object.visible ? <IconEye
            size={13}
          /> : <IconEyeOff
            size={13}
          />}
        </button>
        <EditorLayerThumbnail
          model={model}
          row={row}
        />
        <EditorLayerName
          model={model}
          row={row}
        />
        {/* Lock buttons cluster: For group nodes, only show the master lock;
         For ordinary layers, master lock is visible on layer hover, and the 3 granular locks
         (transparency, pixels, position) fly out in an absolute floating toolbar without shifting the row layout. */}
        <EditorLayerLocks
          model={model}
          row={row}
        />
        {object.clipTo ? <span
          className="shrink-0 text-neutral-500"
          title={t("editor.layer.clipped")}
          aria-label={t("editor.layer.clipped")}
        >
          <IconClipMask
            size={11}
          />
        </span> : null}
      </div>
      {!overId && dragId && slot === dragUnits.length && position === dragUnits.length - 1 ? <div
        className="pointer-events-none absolute -bottom-[3px] left-1 right-1 z-20 h-[2px] rounded-full bg-[#a7ffd4]"
      /> : null}
    </div>
    <EditorLayerSublists
      model={model}
      row={row}
    />
  </>;
}
if (import.meta.env.DEV) {
EditorLayerRow.propTypes = {
  model: layerPanelModelType.isRequired,
  row: layerRowType.isRequired
};
}
