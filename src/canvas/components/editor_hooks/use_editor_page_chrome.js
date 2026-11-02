import { useCallback, useEffect, useRef } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { effectivePage } from "../../editor/scene_model.js";
import { docToScreenRect } from "../../editor/scene_renderer.js";
import { visibleCanvasFrameLabels } from "../../editor/frame-canvas-labels.js";
import { EDITOR_PAGE_HEADER_INSET, EDITOR_PAGE_TOOLBAR_GAP } from "../editor_panel_layout.js";

/** The engine retains a 2D measurement canvas while Skia owns a separate canvas. */
export function useEditorPageRefs(free) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const skiaCanvasRef = useRef(null);
  const titleRef = useRef(null);
  const canvasFrameLabelRefs = useRef(new Map());
  const pageRingRef = useRef(null);
  const pageSizeRef = useRef(null);
  const addCanvasRef = useRef(null);
  const streamRectRef = useRef(null);
  if (free && !canvasRef.current && typeof document !== "undefined") {
    canvasRef.current = document.createElement("canvas");
  }
  return { rootRef, stageRef, canvasRef, skiaCanvasRef, titleRef, canvasFrameLabelRefs, pageRingRef, pageSizeRef, addCanvasRef, streamRectRef };
}

/** Pin resize origins and synchronise DOM chrome without a camera render delay. */
export function useEditorPageChrome({ props, refs, free, engine, renaming }) {
  const { nodeId, rect, sharedZoom, onVisibility } = props;
  const {
    rootRef, titleRef, canvasFrameLabelRefs, pageRingRef,
    pageSizeRef, addCanvasRef, streamRectRef,
  } = refs;
  const setEditorArtboardLayout = useDesignStore(
    (state) => state.setEditorArtboardLayout,
  );
  const moveEditorArtboard = useDesignStore(
    (state) => state.moveEditorArtboard,
  );
  // Holds the pending doc-space position to persist when the resize commits.
  const resizePositionRef = useRef(null);

  // In free mode (cameraMode=shared) the engine's viewport pan compensation is
  // skipped, so the artboard box position on screen is determined entirely by
  // the parent layout rect. When the user drags the top or left edge we must
  // also shift the artboard's rendered position so the opposite edge stays
  // fixed — exactly what Figma does. Strategy:
  //   1. At drag-start: capture doc-space position and immediately pin it via
  //      setEditorArtboardLayout so freeLayouts auto-centring doesn't fire.
  //   2. Per-move: update rootRef DOM directly (skips React re-render) and
  //      accumulate the position delta for top/left edges.
  //   3. On commit: persist via moveEditorArtboard to make it permanent.
  const handleResizeDragStart = useCallback(
    (_edges) => {
      if (!free || !rect || !sharedZoom) return undefined;
      const z = sharedZoom;
      let pinnedX = rect.x / z;
      let pinnedY = rect.y / z;
      let pinnedW = rect.width / z;
      let pinnedH = rect.height / z;
      // Pin immediately to prevent auto-centering during the drag.
      setEditorArtboardLayout(nodeId, {
        x: Math.round(pinnedX),
        y: Math.round(pinnedY),
        width: Math.round(pinnedW),
        height: Math.round(pinnedH),
      });
      resizePositionRef.current = { x: pinnedX, y: pinnedY };

      // grownW / grownH: how much the page grew in document units. Growing
      // from the top or left moves the page's origin by that amount; growing
      // from the centre (Alt) moves it by half.
      return (movedEdges, grownW, grownH, fromCentre) => {
        if (fromCentre) {
          pinnedX -= grownW / 2;
          pinnedY -= grownH / 2;
        } else {
          if (movedEdges.top) pinnedY -= grownH;
          if (movedEdges.left) pinnedX -= grownW;
        }
        resizePositionRef.current = { x: pinnedX, y: pinnedY };
        // Update DOM directly to avoid React re-render latency.
        const el = rootRef.current;
        if (el) {
          el.style.left = `${pinnedX * z}px`;
          el.style.top = `${pinnedY * z}px`;
        }
      };
    },
    [free, rect, sharedZoom, nodeId, rootRef, setEditorArtboardLayout],
  );

  // Which pages are worth keeping an engine for is decided by the parent, and
  // it decides from what the reader can actually see.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => onVisibility(nodeId, entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nodeId, onVisibility, rootRef]);

  // Fine-grained selective notification subscription in multi-artboard free mode.
  // Updates root div position directly for direct artboard mutations without re-rendering.
  useEffect(() => {
    if (!free) return undefined;
    const store = useDesignStore.getState();
    const unsubscribe = store.subscribeArtboardNotification?.(
      nodeId,
      ({ rect: updatedRect, localRect, isDirectTarget }) => {
        if (!isDirectTarget) return;
        const el = rootRef.current;
        const targetRect = localRect || updatedRect;
        if (!el || !targetRect) return;
        el.style.left = `${targetRect.x}px`;
        el.style.top = `${targetRect.y}px`;
        if (targetRect.width !== undefined)
          el.style.width = `${targetRect.width}px`;
        if (targetRect.height !== undefined)
          el.style.height = `${targetRect.height}px`;
      },
    );
    return unsubscribe;
  }, [free, nodeId, rootRef]);

  const handleResizeCommit = useCallback(() => {
    engine?.commit("editor.history.entry.resize");
    if (free && resizePositionRef.current) {
      setEditorArtboardLayout(nodeId, {
        x: Math.round(resizePositionRef.current.x),
        y: Math.round(resizePositionRef.current.y),
      });
      moveEditorArtboard(nodeId, resizePositionRef.current);
      resizePositionRef.current = null;
    }
  }, [engine, free, nodeId, moveEditorArtboard, setEditorArtboardLayout]);
  // Camera-synced page chrome: the page outline and title are DOM while the
  // artwork is canvas. React state lags a camera-only frame by one commit, so
  // during a middle-button pan the frame outline could sit a frame behind the
  // artwork. Re-position the DOM nodes from the same render callback the canvas
  // paints in, so both share the live viewport without a React re-render.
  useEffect(() => {
    if (!engine) return undefined;
    const sync = () => {
      const liveDoc = engine.getDocument?.();
      if (!liveDoc) return;
      const liveViewport = engine.getViewport();
      if (!free) {
        const rect = docToScreenRect(effectivePage(liveDoc), liveViewport);
        const ring = pageRingRef.current;
        if (ring) {
          ring.style.left = `${rect.x}px`;
          ring.style.top = `${rect.y}px`;
          ring.style.width = `${rect.width}px`;
          ring.style.height = `${rect.height}px`;
        }
        const stream = streamRectRef.current;
        if (stream) {
          stream.style.left = `${rect.x}px`;
          stream.style.top = `${rect.y}px`;
          stream.style.width = `${rect.width}px`;
          stream.style.height = `${rect.height}px`;
        }
        const title = titleRef.current;
        if (title) {
          title.style.left = `${rect.x}px`;
          title.style.top = `${rect.y - EDITOR_PAGE_HEADER_INSET}px`;
        }
        const size = pageSizeRef.current;
        if (size) {
          size.style.left = `${rect.x + rect.width / 2}px`;
          size.style.top = `${rect.y - EDITOR_PAGE_HEADER_INSET - EDITOR_PAGE_TOOLBAR_GAP}px`;
        }
        const add = addCanvasRef.current;
        if (add) {
          add.style.left = `${rect.x + rect.width + 24}px`;
          add.style.top = `${rect.y + rect.height / 2}px`;
        }
      }

      const visibleLabels = new Map(
        visibleCanvasFrameLabels(liveDoc).map((frame) => [frame.id, frame]),
      );
      for (const [frameId, label] of canvasFrameLabelRefs.current) {
        const frame = visibleLabels.get(frameId);
        if (!frame) {
          label.hidden = true;
          continue;
        }
        const frameRect = docToScreenRect(frame, liveViewport);
        label.hidden = false;
        label.style.left = `${frameRect.x}px`;
        label.style.top = `${frameRect.y - EDITOR_PAGE_HEADER_INSET}px`;
      }
    };
    sync();
    return engine.subscribeRender?.(sync) ?? undefined;
  }, [engine, free, renaming, pageRingRef, streamRectRef, titleRef, pageSizeRef, addCanvasRef, canvasFrameLabelRefs]);

  return { handleResizeDragStart, handleResizeCommit };
}
