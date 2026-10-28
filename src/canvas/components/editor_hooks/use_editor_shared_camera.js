import { useCallback, useEffect, useRef } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { ZOOM_STEP, wheelPanDelta, wheelZoomFactor } from "../../editor/editor_constants.js";
import { zoomCameraAt } from "../image_editor_helpers.js";
import { editorPanelLayout, fitEditorPageCamera, shouldReserveBothPanelInsets } from "../editor_panel_layout.js";

/** Shared workspace camera: fit/zoom, wheel input, DOM sync and remembered views. */
export function useEditorSharedCamera({
  multi, visible, freeStageRef, artboardLayerRef, freeGridRef,
  freeLayouts, layoutById, nodeIds, focusedId, presentationId, swapPanels,
  layersPanelShown, propertiesOpen, historyOpen, enginesRef, readySignature,
  editorRememberCamera, editingGroupId, getGroupCamera, saveGroupCamera,
  pendingArtboardFitId, pendingNavigationRef, setEditorCamera,
}) {
  const panEditorCamera = useDesignStore((state) => state.panEditorCamera);
  const setEditorArtboardLayouts = useDesignStore((state) => state.setEditorArtboardLayouts);
  const setEditorViewport = useDesignStore((state) => state.setEditorViewport);
  /** The free stage's centre in stage coordinates, for cursor-anchored zoom. */
  const stageCentre = useCallback(() => {
    const stage = freeStageRef.current;
    return {
      x: (stage?.clientWidth ?? 0) / 2,
      y: (stage?.clientHeight ?? 0) / 2,
    };
  }, [freeStageRef]);

  /** Fits the whole artboard row into the free stage. */
  const fitAll = useCallback(() => {
    const stage = freeStageRef.current;
    if (!stage || freeLayouts.length === 0) return;
    const fittingLayouts = presentationId
      ? [layoutById.get(focusedId) ?? freeLayouts[0]]
      : freeLayouts;
    const box = fittingLayouts.reduce(
      (acc, layout) => ({
        x: Math.min(acc.x, layout.x),
        y: Math.min(acc.y, layout.y),
        right: Math.max(acc.right, layout.x + layout.width),
        bottom: Math.max(acc.bottom, layout.y + layout.height),
      }),
      { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity },
    );
    const width = box.right - box.x;
    const height = box.bottom - box.y;
    const panel = editorPanelLayout({
      stageWidth: stage.clientWidth,
      swapped: swapPanels,
      // Multi-page actions must remain clear when Properties opens after the
      // first Fit. Reserve its band so selection never moves the camera.
      reserveBothPanels:
        multi ||
        shouldReserveBothPanelInsets({
          layersPanelShown,
          propertiesOpen,
          historyOpen,
        }),
    });
    const insets = panel.insets;
    const camera = fitEditorPageCamera({
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      layout: { x: box.x, y: box.y, width, height },
      insets,
    });
    if (!camera) return;
    setEditorCamera(camera);
  }, [
    freeLayouts,
    freeStageRef,
    multi,
    setEditorCamera,
    presentationId,
    focusedId,
    layoutById,
    swapPanels,
    layersPanelShown,
    propertiesOpen,
    historyOpen,
  ]);

  const zoomSharedStep = useCallback(
    (direction) =>
      setEditorCamera((prev) =>
        zoomCameraAt(prev, ZOOM_STEP ** direction, stageCentre()),
      ),
    [stageCentre, setEditorCamera],
  );
  const zoomSharedHundred = useCallback(
    () =>
      setEditorCamera((prev) => {
        const stage = freeStageRef.current;
        const focusedLayout = layoutById.get(focusedId);
        if (stage && focusedLayout) {
          return {
            zoom: 1,
            panX:
              (stage.clientWidth - focusedLayout.width) / 2 - focusedLayout.x,
            panY:
              (stage.clientHeight - focusedLayout.height) / 2 - focusedLayout.y,
          };
        }
        return zoomCameraAt(prev, 1 / prev.zoom, stageCentre());
      }),
    [stageCentre, setEditorCamera, focusedId, layoutById, freeStageRef],
  );

  // Sync artboard layouts and viewport dimensions into workflow store for target resolution.
  useEffect(() => {
    if (!multi || freeLayouts.length === 0) return;
    const stage = freeStageRef.current;
    if (stage) {
      setEditorViewport({
        width: stage.clientWidth || 1440,
        height: stage.clientHeight || 900,
      });
    }
    setEditorArtboardLayouts(layoutById);
  }, [
    multi,
    freeStageRef,
    freeLayouts,
    layoutById,
    setEditorArtboardLayouts,
    setEditorViewport,
  ]);

  // Fine-grained hardware-accelerated transform sync for multi-artboard canvas pan.
  // Directly updates layer transform so pan operations do not trigger React re-renders
  // or individual artboard DOM mutations.
  useEffect(() => {
    if (!multi) return undefined;
    const syncTransform = (cam) => {
      const el = artboardLayerRef.current;
      if (!cam) return;
      if (freeGridRef.current) freeGridRef.current.style.backgroundPosition = `${cam.panX || 0}px ${cam.panY || 0}px`;
      if (!el) return;
      el.style.transform = `translate3d(${cam.panX || 0}px, ${cam.panY || 0}px, 0)`;
    };
    syncTransform(useDesignStore.getState().editorCamera);
    let lastCamera = useDesignStore.getState().editorCamera;
    return useDesignStore.subscribe((state) => {
      const cam = state.editorCamera;
      if (cam && cam !== lastCamera) {
        lastCamera = cam;
        syncTransform(cam);
      }
    });
  }, [multi, artboardLayerRef, freeGridRef]);

  // Wheel over the free stage: scroll pans, ⌘/Ctrl+wheel zooms around the
  // cursor. Attached natively because React's onWheel is passive and would
  // swallow preventDefault.
  useEffect(() => {
    if (!multi || !visible) return undefined;
    const stage = freeStageRef.current;
    if (!stage) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const bounds = stage.getBoundingClientRect();
        setEditorCamera((prev) =>
          zoomCameraAt(prev, wheelZoomFactor(event.deltaY), {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          }),
        );
        return;
      }
      const { dx, dy } = wheelPanDelta(event);
      panEditorCamera(dx, dy);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", onWheel);

    };
  }, [multi, visible, panEditorCamera, setEditorCamera, freeStageRef]);

  // Fit the whole row once every page has finished opening.
  const fittedRef = useRef(null);
  useEffect(() => {
    if (!multi) return;
    const allReady = presentationId
      ? enginesRef.current.get(focusedId)?.ready
      : nodeIds.every((id) => enginesRef.current.get(id)?.ready);
    if (!allReady) return;
    const signature = (presentationId ? nodeIds : [...nodeIds].sort()).join(
      "|",
    );
    if (fittedRef.current === signature) return;
    const firstFit = fittedRef.current === null;
    fittedRef.current = signature;
    // A remembered group reopens exactly where its user left it; a hand
    // multi-select (or a first group edit with no saved view) fits the pages.
    const saved =
      editorRememberCamera && (!presentationId || firstFit)
        ? getGroupCamera(editingGroupId)
        : null;
    if (saved && saved.panX !== undefined && saved.panY !== undefined) {
      setEditorCamera({
        zoom: saved.zoom ?? 1,
        panX: saved.panX,
        panY: saved.panY,
      });
    } else {
      fitAll();
    }
  }, [
    multi,
    nodeIds,
    readySignature,
    enginesRef,
    fitAll,
    setEditorCamera,
    editorRememberCamera,
    editingGroupId,
    getGroupCamera,
    presentationId,
    focusedId,
  ]);

  // Focus an unseen artboard after the initial row fit, using its world position.
  useEffect(() => {
    if (!pendingArtboardFitId || pendingArtboardFitId !== focusedId) return;
    if (multi) {
      const stage = freeStageRef.current;
      const layout = layoutById.get(focusedId);
      const allReady = presentationId
        ? enginesRef.current.get(focusedId)?.ready
        : nodeIds.every((id) => enginesRef.current.get(id)?.ready);
      if (!stage || !layout || !allReady) return;
      const camera = fitEditorPageCamera({
        stageWidth: stage.clientWidth,
        stageHeight: stage.clientHeight,
        layout,
        insets: editorPanelLayout({ stageWidth: stage.clientWidth, swapped: swapPanels, reserveBothPanels: true }).insets,
      });
      if (!camera) return;
      setEditorCamera(camera);
    }
    useDesignStore.setState({ pendingArtboardFitId: null });
  }, [pendingArtboardFitId, focusedId, multi, nodeIds, presentationId, layoutById, readySignature, swapPanels, setEditorCamera, enginesRef, freeStageRef]);

  // A component jump is complete when its live page and visible stage are
  // ready. The normal multi-page fit runs first; this then focuses the target.
  useEffect(() => {
    const navigation = pendingNavigationRef.current;
    if (!navigation || navigation.pageId !== focusedId) return;
    const targetEngine = enginesRef.current.get(focusedId);
    if (!targetEngine?.ready) return;

    if (multi) {
      const stage = freeStageRef.current;
      const layout = layoutById.get(focusedId);
      if (!stage || !layout) return;
      if (navigation.kind === "enter") {
        const panel = editorPanelLayout({
          stageWidth: stage.clientWidth,
          swapped: swapPanels,
        });
        const insets = panel.insets;
        const camera = fitEditorPageCamera({
          stageWidth: stage.clientWidth,
          stageHeight: stage.clientHeight,
          layout,
          insets,
        });
        if (!camera) return;
        setEditorCamera(camera);
      } else if (navigation.camera) {
        const camera = navigation.camera;
        setEditorCamera(
          navigation.cameraMode === "shared"
            ? camera
            : {
                zoom: camera.zoom,
                panX: camera.panX - layout.x * camera.zoom,
                panY: camera.panY - layout.y * camera.zoom,
              },
        );
      }
    } else if (navigation.kind === "enter") {
      targetEngine.engine.zoomToFit?.();
    } else if (navigation.cameraMode === "local" && navigation.camera) {
      targetEngine.engine.setViewport?.(navigation.camera);
    }

    if (navigation.kind === "return") {
      const current = targetEngine.engine.getDocument();
      const ids = navigation.selectedIds.filter((id) =>
        current.nodes.some((node) => node.id === id),
      );
      targetEngine.engine.selectExactly(ids);
      if (navigation.playback) {
        targetEngine.engine.seekToTime(navigation.playback.time);
        if (navigation.playback.playing) targetEngine.engine.play();
      }
    }
    pendingNavigationRef.current = null;
  }, [
    focusedId,
    multi,
    enginesRef,
    freeStageRef,
    pendingNavigationRef,
    readySignature,
    layoutById,
    swapPanels,
    setEditorCamera,
  ]);

  // Remember the free-canvas view for a group: when the editor closes (or the
  // set of pages changes), write the camera back onto the group node so the
  // next open restores it. A hand multi-select (no group) is never written.
  const cameraRef = useRef(useDesignStore.getState().editorCamera);
  cameraRef.current = useDesignStore.getState().editorCamera;
  useEffect(() => useDesignStore.subscribe((state) => {
    cameraRef.current = state.editorCamera;
  }), []);
  const rememberedRef = useRef({ groupId: null, active: false });
  useEffect(() => {
    if (multi && editorRememberCamera && editingGroupId) {
      rememberedRef.current = { groupId: editingGroupId, active: true };
      return;
    }
    const prev = rememberedRef.current;
    if (prev.active && prev.groupId) {
      saveGroupCamera(prev.groupId, cameraRef.current);
    }
    rememberedRef.current = { groupId: null, active: false };
  }, [multi, editorRememberCamera, editingGroupId, nodeIds, saveGroupCamera]);

  return { fitAll, zoomSharedStep, zoomSharedHundred };
}
