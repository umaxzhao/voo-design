import { useCallback, useEffect, useRef } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { TOOL } from "../../editor/editor_constants.js";
import { dragArtboardPosition } from "../../editor/editor_artboard_positions.js";
import { sendCollabCursor } from "../../collab/use_collab.js";
import { shouldDragArtboardBody } from "../artboard-body-gesture.js";
import {
  resolveFreeDrawingStart,
  calculateFreeDrawingBox,
} from "../../editor/shape_snapping.js";

/** Shared-stage pan/selection and artboard title/body pointer ownership. */
const DRAWING_TOOLS = new Set([
  TOOL.FRAME, TOOL.RECT, TOOL.ELLIPSE, TOOL.LINE, TOOL.ARROW,
  TOOL.POLYGON, TOOL.STAR, TOOL.PEN, TOOL.CURVATURE_PEN, TOOL.FREE_PEN, TOOL.TEXT,
]);

export function isDrawingTool(tool) {
  return DRAWING_TOOLS.has(tool);
}

export function useEditorCanvasGestures({
  multi, visible, freeStageRef, spaceRef, panGestureRef, enginesRef,
  layoutById, cameraZoom, tool, focusedId, focusEditorPage,
  handleFocusCanvas, setCanvasBackgroundSelected, nodeIds: propNodeIds,
}) {
  const storeNodeIds = useDesignStore((state) => state.editingNodeIds);
  const nodeIds = propNodeIds ?? storeNodeIds ?? [];
  const drawingGestureRef = useRef(null);
  const welcomeOpen = useDesignStore((state) => state.welcomeOpen);
  const panEditorCamera = useDesignStore((state) => state.panEditorCamera);
  const setEditorArtboardLayout = useDesignStore((state) => state.setEditorArtboardLayout);
  const moveEditorArtboard = useDesignStore((state) => state.moveEditorArtboard);
  const artboardDragRef = useRef(null);
  // Space arms the hand tool over the free canvas.
  useEffect(() => {
    if (!multi || !visible || welcomeOpen) return undefined;
    const isTyping = (t) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    const setHand = (active) => {
      spaceRef.current = active;
      if (freeStageRef.current) freeStageRef.current.style.cursor = active ? "grab" : "default";
    };
    const onKeyDown = (e) => {
      if (e.code !== "Space" || e.target.closest?.("[data-presentation-overlay]") || isTyping(e.target)) return;
      e.preventDefault();
      setHand(true);
    };
    const onKeyUp = (e) => { if (e.code === "Space") setHand(false); };
    const onBlur = () => setHand(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      setHand(false);
    };
  }, [multi, visible, welcomeOpen, freeStageRef, spaceRef]);

  // Free-stage pointer gestures: Space / middle-button drag pans, and clicking
  // the empty canvas deselects the focused page. Left-button drag on the empty
  // canvas (not over any artboard) also pans the free view — a view-only camera
  // offset that never writes back to workflow node positions.
  const onFreePointerDown = useCallback((event) => {
    const isPanTrigger = event.button === 1 || spaceRef.current || tool === TOOL.HAND;
    const isLeftClick = event.button === 0;

    if (!isPanTrigger && !isLeftClick) return;

    // Never pan when interacting with UI panels, menus, dialogs, form controls
    if (
      event.target.closest?.(
        '[role="dialog"], [role="menu"], [data-testid="editor-top-bar"], [data-testid="editor-toolbar"], [data-testid="editor-layers-panel"], [data-testid="editor-properties-panel"], [data-testid="agent-panel"], button, input, textarea, select',
      )
    ) {
      return;
    }

    // For plain left clicks without Space, let artboards handle their own selection/drawing/tools
    if (!isPanTrigger && event.target.closest?.("[data-editor-artboard]")) {
      return;
    }

    if (typeof document !== "undefined" && document.activeElement?.hasAttribute?.("data-canvas-text-overlay")) {
      document.activeElement.blur();
    }

    const targetId = focusedId || (nodeIds.length > 0 ? nodeIds[0] : null);
    const targetEngine = targetId ? enginesRef.current?.get(targetId)?.engine : null;
    if (!isPanTrigger && targetEngine?.hasHandleUnder?.({ clientX: event.clientX, clientY: event.clientY })) {
      return;
    }

    // Drawing tools on the free canvas (outside artboards) draw on the primary/focused engine
    if (!isPanTrigger && isDrawingTool(tool)) {
      if (targetId && !focusedId) focusEditorPage(targetId);
      if (targetEngine) {
        event.preventDefault();
        try { freeStageRef.current?.setPointerCapture?.(event.pointerId); } catch {}
        const { point, rawPoint } = resolveFreeDrawingStart({ targetEngine, event });
        const node = tool === TOOL.FRAME ? targetEngine.addFrameAt(point, { intoFrame: true })
          : tool === TOOL.RECT ? targetEngine.addRectAt(point, { intoFrame: true })
          : tool === TOOL.ELLIPSE ? targetEngine.addEllipseAt(point, { intoFrame: true })
          : tool === TOOL.TEXT ? targetEngine.addTextAt(point, "", { intoFrame: true }) : null;
        if (node) {
          targetEngine.select(node.id);
          drawingGestureRef.current = {
            kind: tool, id: node.id, start: point, rawStart: rawPoint,
            engine: targetEngine, pointerId: event.pointerId,
          };
        }
      }
      return;
    }

    // Middle-button drag, space+drag, or drag on empty canvas: start panning camera
    event.preventDefault();
    if (isPanTrigger) event.stopPropagation();

    try { freeStageRef.current?.setPointerCapture?.(event.pointerId); } catch {}
    const stage = freeStageRef.current;
    if (stage) stage.style.cursor = "grabbing";

    panGestureRef.current = {
      pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY,
      startX: event.clientX, startY: event.clientY, moved: false,
      button: event.button, panTrigger: isPanTrigger,
    };
  }, [enginesRef, focusedId, focusEditorPage, freeStageRef, nodeIds, panGestureRef, spaceRef, tool]);
  const lastCollabCursorSentRef = useRef(0);
  const handleCollabCursorMove = useCallback((event) => {
    const now = performance.now();
    if (now - lastCollabCursorSentRef.current < 50) return;
    lastCollabCursorSentRef.current = now;
    const stage = freeStageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const cam = useDesignStore.getState().editorCamera || { panX: 0, panY: 0, zoom: 1 };
    const z = cam.zoom || 1;
    const x = (event.clientX - rect.left - (cam.panX || 0)) / z;
    const y = (event.clientY - rect.top - (cam.panY || 0)) / z;
    sendCollabCursor({ x, y });
  }, [freeStageRef]);
  const onFreePointerMove = useCallback(
    (event) => {
      handleCollabCursorMove(event);
      const drawing = drawingGestureRef.current;
      if (drawing && drawing.pointerId === event.pointerId) {
        const box = calculateFreeDrawingBox({ engine: drawing.engine, event, drawing });
        drawing.engine.updateNode(drawing.id, box, { commit: false });
        return;
      }

      const gesture = panGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.lastX;
      const dy = event.clientY - gesture.lastY;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;

      if (!gesture.moved) {
        const totalDist = Math.hypot(
          event.clientX - (gesture.startX ?? gesture.lastX),
          event.clientY - (gesture.startY ?? gesture.lastY),
        );
        // Middle button or space drag pans immediately (threshold 1px)
        const threshold = gesture.panTrigger || gesture.button === 1 || spaceRef.current ? 1 : 4;
        if (totalDist < threshold) return;
        gesture.moved = true;
      }

      panEditorCamera(dx, dy);
    },
    [handleCollabCursorMove, panEditorCamera, panGestureRef, spaceRef],
  );
  const onFreePointerUp = useCallback(
    (event) => {
      const drawing = drawingGestureRef.current;
      if (drawing && drawing.pointerId === event.pointerId) {
        drawingGestureRef.current = null;
        try { freeStageRef.current?.releasePointerCapture?.(event.pointerId); } catch {}
        const stage = freeStageRef.current;
        if (stage) stage.style.cursor = spaceRef.current ? "grab" : "default";
        const node = drawing.engine.getDocument()?.nodes?.find?.((n) => n.id === drawing.id);
        const tooSmall = !node || node.width < 4 || node.height < 4;
        if (tooSmall) {
          drawing.engine.removeNode(drawing.id);
          drawing.engine.select(null);
        } else {
          drawing.engine.select(drawing.id);
          drawing.engine.commit?.("editor.pointer.draw");
        }
        return;
      }

      const gesture = panGestureRef.current;
      if (gesture?.pointerId !== event.pointerId) return;
      panGestureRef.current = null;

      try { freeStageRef.current?.releasePointerCapture?.(event.pointerId); } catch {}
      const stage = freeStageRef.current;
      if (stage) stage.style.cursor = spaceRef.current ? "grab" : "default";

      // A bare left-click on empty canvas (never dragged) deselects the focused
      // page and its selection when there are multiple pages.
      // When there is only one page, clicking empty canvas must not deselect/unfocus
      // the active page, or ensure focusedId falls back to the current artboard.
      if (!gesture.moved && gesture.button === 0 && !gesture.panTrigger && !spaceRef.current) {
        setCanvasBackgroundSelected(true);
        enginesRef.current.get(focusedId)?.engine?.select?.(null);
        if (multi && nodeIds.length > 1) {
          focusEditorPage(null);
        } else if (nodeIds.length > 0 && !focusedId) {
          focusEditorPage(nodeIds[0]);
        }
      }
    },
    [enginesRef, focusedId, focusEditorPage, freeStageRef, multi, nodeIds, panGestureRef, setCanvasBackgroundSelected, spaceRef],
  );

  // Space-drag on a title keeps the camera pan gesture available.
  const onTitlePanDown = useCallback((event) => {
    if (
      event.button !== 0 ||
      event.target.closest?.(
        "button, input, textarea, [role=dialog], [role=menu]",
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    try {
      // Capture on the title label itself so the drag's move/up retarget here,
      // independent of the (non-capturing) free-stage handlers.
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; move/up still work.
    }
    panGestureRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      button: event.button,
    };
  }, [panGestureRef]);

  const onTitlePointerDown = useCallback(
    (nodeId, event) => {
      if (spaceRef.current) {
        onTitlePanDown(event);
        return;
      }
      if (
        event.button !== 0 ||
        event.target.closest?.(
          "button, input, textarea, [role=dialog], [role=menu]",
        )
      )
        return;
      const layout = layoutById.get(nodeId);
      if (!layout) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget?.setPointerCapture?.(event.pointerId);
      } catch {
        // Synthetic pointers can complete through the move/up handlers.
      }
      artboardDragRef.current = {
        pointerId: event.pointerId,
        nodeId,
        start: { x: layout.x, y: layout.y },
        clientX: event.clientX,
        clientY: event.clientY,
        next: { x: layout.x, y: layout.y },
        moved: false,
      };
    },
    [layoutById, onTitlePanDown, spaceRef],
  );

  const onTitlePointerMove = useCallback(
    (event) => {
      const gesture = artboardDragRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        onFreePointerMove(event);
        return;
      }
      const dx = event.clientX - gesture.clientX;
      const dy = event.clientY - gesture.clientY;
      if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
      const next = dragArtboardPosition(
        gesture.start,
        { x: dx, y: dy },
        cameraZoom,
      );
      if (!next) return;
      gesture.moved = true;
      gesture.next = next;
      const board = event.currentTarget.closest("[data-editor-artboard]");
      if (board) {
        board.style.left = `${next.x * cameraZoom}px`;
        board.style.top = `${next.y * cameraZoom}px`;
      }
      const layout = layoutById.get(gesture.nodeId);
      if (layout)
        setEditorArtboardLayout(gesture.nodeId, { ...layout, ...next });
    },
    [cameraZoom, layoutById, onFreePointerMove, setEditorArtboardLayout],
  );

  const onTitlePointerUp = useCallback(
    (event) => {
      const gesture = artboardDragRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        onFreePointerUp(event);
        return;
      }
      artboardDragRef.current = null;
      try {
        event.currentTarget?.releasePointerCapture?.(event.pointerId);
      } catch {
        // The browser may release capture before pointercancel arrives.
      }
      const cancelled = event.type === "pointercancel";
      if (!gesture.moved) {
        // A plain click on a frame title selects that frame, as Figma does.
        if (!cancelled) handleFocusCanvas(gesture.nodeId);
        return;
      }
      if (cancelled) {
        const board = event.currentTarget.closest("[data-editor-artboard]");
        if (board) {
          board.style.left = `${gesture.start.x * cameraZoom}px`;
          board.style.top = `${gesture.start.y * cameraZoom}px`;
        }
        const layout = layoutById.get(gesture.nodeId);
        if (layout) setEditorArtboardLayout(gesture.nodeId, { ...layout, ...gesture.start });
        return;
      }
      moveEditorArtboard(gesture.nodeId, gesture.next);
    },
    [
      cameraZoom,
      handleFocusCanvas,
      layoutById,
      moveEditorArtboard,
      onFreePointerUp,
      setEditorArtboardLayout,
    ],
  );

  /**
   * Empty frame body can drag the frame; artwork keeps its own pointer events
   * so an unselected object can be selected and moved on the first gesture.
   */
  const onArtboardBodyPointerDown = useCallback(
    (nodeId, event) => {
      if (event.button !== 0 || spaceRef.current) return;
      if (
        event.target.closest?.(
          "[data-editor-artboard-title], button, input, textarea, [role=dialog], [role=menu], [role=separator], [data-interactive]",
        )
      )
        return;
      if (tool !== TOOL.SELECT) return;
      const targetEngine = enginesRef.current.get(nodeId)?.engine;
      if (!shouldDragArtboardBody(targetEngine, event.clientX, event.clientY, tool)) return;
      const board = event.currentTarget;
      onTitlePointerDown(nodeId, event);
      if (!artboardDragRef.current) return;
      const move = (e) => onTitlePointerMove(e);
      const up = (e) => {
        onTitlePointerUp(e);
        board.removeEventListener("pointermove", move);
        board.removeEventListener("pointerup", up);
        board.removeEventListener("pointercancel", up);
      };
      board.addEventListener("pointermove", move);
      board.addEventListener("pointerup", up);
      board.addEventListener("pointercancel", up);
    },
    [enginesRef, tool, onTitlePointerDown, onTitlePointerMove, onTitlePointerUp, spaceRef],
  );

  return { onFreePointerDown, onFreePointerMove, onFreePointerUp,
    onTitlePointerDown, onTitlePointerMove, onTitlePointerUp, onArtboardBodyPointerDown };
}
