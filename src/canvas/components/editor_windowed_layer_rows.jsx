import { useLayoutEffect, useMemo, useReducer, useRef } from "react";
import PropTypes from "prop-types";
import EditorLayerRow from "./editor_layer_row.jsx";
import { layerPanelModelType, layerRowType } from "./editor_layers_contract.js";
const WINDOW_THRESHOLD = 200;
const ESTIMATED_ROW_HEIGHT = 34;
const OVERSCAN = 8;
function viewportReducer(state, action) {
  if (action.type === "measure") return {
    ...state,
    revision: state.revision + 1
  };
  if (state.top === action.top && state.height === action.height) return state;
  return {
    ...state,
    top: action.top,
    height: action.height
  };
}
function indexAt(offsets, position) {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (offsets[middle] <= position) low = middle;else high = middle - 1;
  }
  return Math.min(low, offsets.length - 2);
}

/** Window DOM rows without trimming the full tree used by selection and drag math. */
export default function EditorWindowedLayerRows({
  model,
  rows
}) {
  const enabled = rows.length > WINDOW_THRESHOLD;
  const root = useRef(null);
  const heights = useRef(new WeakMap());
  const measuredNodes = useRef(new WeakMap());
  const previousFocus = useRef(null);
  const observer = useRef(null);
  const elements = useRef(new Map());
  const [viewport, dispatch] = useReducer(viewportReducer, {
    top: 0,
    height: 600,
    revision: 0
  });
  const offsets = useMemo(() => {
    const result = [0];
    for (const row of rows) result.push(result.at(-1) + (heights.current.get(row.node) ?? ESTIMATED_ROW_HEIGHT));
    return result;
  }, [rows, viewport.revision]);
  useLayoutEffect(() => {
    if (!enabled || !root.current || !model.listRef.current) return undefined;
    const list = model.listRef.current;
    let frame = null;
    const update = () => {
      frame = null;
      if (!root.current) return;
      dispatch({
        type: "viewport",
        top: Math.max(0, list.getBoundingClientRect().top - root.current.getBoundingClientRect().top),
        height: list.clientHeight
      });
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(list);
    list.addEventListener("scroll", schedule, {
      passive: true
    });
    update();
    return () => {
      resize.disconnect();
      list.removeEventListener("scroll", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [enabled, model.listRef]);
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const resize = new ResizeObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
        const node = measuredNodes.current.get(entry.target);
        if (node && height > 0 && Math.abs((heights.current.get(node) ?? ESTIMATED_ROW_HEIGHT) - height) > 0.5) {
          heights.current.set(node, height);
          changed = true;
        }
      }
      if (changed) dispatch({
        type: "measure"
      });
    });
    observer.current = resize;
    for (const element of elements.current.values()) resize.observe(element);
    return () => {
      resize.disconnect();
      observer.current = null;
    };
  }, [enabled]);
  const focusedId = model.listActiveDescendantDomId?.startsWith("layer-row-") ? model.listActiveDescendantDomId.slice("layer-row-".length) : null;
  const focusedIndex = focusedId ? rows.findIndex(row => row.node.id === focusedId) : -1;
  useLayoutEffect(() => {
    if (!enabled) {
      previousFocus.current = null;
      return;
    }
    const focus = `${model.listActiveDescendantDomId}:${focusedIndex}`;
    if (previousFocus.current === focus) return;
    previousFocus.current = focus;
    if (focusedIndex < 0 || !root.current) return;
    const list = model.listRef.current;
    if (!list) return;
    const top = Math.max(0, list.getBoundingClientRect().top - root.current.getBoundingClientRect().top);
    const start = offsets[focusedIndex];
    const end = offsets[focusedIndex + 1];
    if (start < top || end > top + list.clientHeight) {
      // Mount the destination before aria-activedescendant and scrollIntoView read it.
      list.scrollTop += start < top ? start - top : end - top - list.clientHeight;
      dispatch({
        type: "viewport",
        top: Math.max(0, list.getBoundingClientRect().top - root.current.getBoundingClientRect().top),
        height: list.clientHeight
      });
    }
  }, [enabled, focusedIndex, model.listActiveDescendantDomId, model.listRef, offsets]);
  if (!enabled) return rows.map(row => <EditorLayerRow key={row.node.id} model={model} row={row} />);
  const start = Math.max(0, indexAt(offsets, viewport.top) - OVERSCAN);
  const end = Math.min(rows.length, indexAt(offsets, viewport.top + viewport.height) + OVERSCAN + 1);
  return <div ref={root} className="flex shrink-0 flex-col" data-windowed-layers>
    <div aria-hidden="true" className="shrink-0" style={{
      height: offsets[start]
    }} />
    {rows.slice(start, end).map(row => <div key={row.node.id} data-layer-window-id={row.node.id} className="shrink-0 pb-0.5" ref={element => {
      const previous = elements.current.get(row.node.id);
      if (previous) observer.current?.unobserve(previous);
      if (element) {
        elements.current.set(row.node.id, element);
        measuredNodes.current.set(element, row.node);
        observer.current?.observe(element);
      } else elements.current.delete(row.node.id);
    }}><EditorLayerRow model={model} row={row} /></div>)}
    <div aria-hidden="true" className="shrink-0" style={{
      height: offsets.at(-1) - offsets[end]
    }} />
  </div>;
}
if (import.meta.env.DEV) {
  EditorWindowedLayerRows.propTypes = {
    model: layerPanelModelType.isRequired,
    rows: PropTypes.arrayOf(layerRowType).isRequired
  };
}
