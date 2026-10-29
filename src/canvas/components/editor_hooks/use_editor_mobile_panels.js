import { useCallback, useRef, useState } from "react";
import { useMobileCanvasGestures } from "../use_mobile_canvas_gestures.js";
import { zoomCameraAt } from "../image_editor_helpers.js";

/** Keep touch panel gestures and canvas pinch routing in one lifecycle. */
export function useEditorMobilePanels({
  isNarrow,
  engine,
  multi,
  setEditorCamera,
  freeStageRef,
  editorRootRef,
  panGestureRef,
  spaceRef,
  undo,
  redo,
}) {
  const [mobileLayersExpanded, setMobileLayersExpanded] = useState(false);
  const [mobilePropertiesExpanded, setMobilePropertiesExpanded] = useState(false);
  const applyMobilePinch = useCallback(
    ({ isStart, factor, centerX, centerY, deltaX, deltaY }) => {
      if (isStart) {
        panGestureRef.current = null;
        if (freeStageRef.current) {
          freeStageRef.current.style.cursor = spaceRef.current ? "grab" : "default";
        }
        return;
      }
      const stage =
        freeStageRef.current ??
        editorRootRef.current?.querySelector('[data-testid="editor-pages"]');
      if (!stage) return;
      const bounds = stage.getBoundingClientRect();
      const point = { x: centerX - bounds.left, y: centerY - bounds.top };
      if (multi) {
        setEditorCamera((previous) => {
          const zoomed = zoomCameraAt(previous, factor, point);
          return {
            ...zoomed,
            panX: zoomed.panX + deltaX,
            panY: zoomed.panY + deltaY,
          };
        });
        return;
      }
      engine?.zoomAt?.(factor, point);
      engine?.panBy?.(deltaX, deltaY);
    },
    [engine, multi, setEditorCamera, freeStageRef, editorRootRef, panGestureRef, spaceRef],
  );
  const mobileCanvasGestures = useMobileCanvasGestures(undo, applyMobilePinch, redo);
  const mobilePanelDragRef = useRef(null);
  const suppressPanelClickRef = useRef(false);
  const onMobilePanelPointerDownCapture = useCallback(
    (event) => {
      if (!isNarrow || event.pointerType !== "touch") return;
      const panel = event.target.closest?.(
        '[data-testid="editor-layers-panel"], [data-testid="editor-properties-panel"]',
      );
      if (!panel) return;
      const panelId = panel.getAttribute("data-testid");
      const isExpanded =
        panelId === "editor-layers-panel"
          ? mobileLayersExpanded
          : mobilePropertiesExpanded;
      const bounds = panel.getBoundingClientRect();
      if (isExpanded && event.clientY > bounds.top + 56) return;
      mobilePanelDragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        panelId,
        isExpanded,
        dragged: false,
      };
    },
    [isNarrow, mobileLayersExpanded, mobilePropertiesExpanded],
  );
  const onMobilePanelPointerMoveCapture = useCallback(
    (event) => {
      const drag = mobilePanelDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaY = event.clientY - drag.startY;
      if (drag.isExpanded) {
        if (deltaY < -10) {
          mobilePanelDragRef.current = null;
          return;
        }
        if (deltaY < 10) return;
        event.preventDefault();
        event.stopPropagation();
        drag.dragged = true;
        if (deltaY < 28) return;
        if (drag.panelId === "editor-layers-panel") {
          setMobileLayersExpanded(false);
        } else {
          setMobilePropertiesExpanded(false);
        }
      } else {
        if (deltaY > 10) {
          mobilePanelDragRef.current = null;
          return;
        }
        if (deltaY > -10) return;
        event.preventDefault();
        event.stopPropagation();
        drag.dragged = true;
        if (deltaY > -28) return;
        if (drag.panelId === "editor-layers-panel") {
          setMobileLayersExpanded(true);
        } else {
          setMobilePropertiesExpanded(true);
        }
      }
    },
    [],
  );
  const onMobilePanelPointerUpCapture = useCallback((event) => {
    const drag = mobilePanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressPanelClickRef.current = drag.dragged;
    mobilePanelDragRef.current = null;
  }, []);
  const onMobilePanelPointerCancelCapture = useCallback(() => {
    mobilePanelDragRef.current = null;
    suppressPanelClickRef.current = false;
  }, []);
  const onMobilePanelClickCapture = useCallback((event) => {
    if (!suppressPanelClickRef.current) return;
    suppressPanelClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    mobileLayersExpanded,
    mobilePropertiesExpanded,
    setMobileLayersExpanded,
    setMobilePropertiesExpanded,
    mobileCanvasGestures,
    onMobilePanelPointerDownCapture,
    onMobilePanelPointerMoveCapture,
    onMobilePanelPointerUpCapture,
    onMobilePanelPointerCancelCapture,
    onMobilePanelClickCapture,
  };
}
