import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { PendingCanvasSelectionManager } from "../editor_pending_canvas_selection.js";

// Each live page owns decoded bitmaps and stage backing stores. Keep visible
// pages and their closest neighbours, plus an actively edited component master.
const MAX_LIVE_PAGES = 12;
const OPEN_GUARD_MS = 800;

/** Own live page engines and durable eviction snapshots for one editor session. */
export function useEditorEngineRegistry({ nodeIds, nodes, focusedId, selectedInstanceChild }) {
  /** nodeId -> live engine, and nodeId -> what an evicted page left behind. */
  const enginesRef = useRef(new Map());
  const snapshotsRef = useRef(new Map());
  useEffect(() => {
    const reader = (id) => {
      const live = enginesRef.current.get(id);
      return live?.ready ? live.engine.serialise() : snapshotsRef.current.get(id)?.doc;
    };
    useDesignStore.setState({ editorPageDocumentReader: reader });
    return () => {
      if (useDesignStore.getState().editorPageDocumentReader === reader) useDesignStore.setState({ editorPageDocumentReader: null });
    };
  }, []);
  const pendingCanvasSelectionRef = useRef(new PendingCanvasSelectionManager());
  const [visibleIds, setVisibleIds] = useState(() => new Set());
  // Any engine reporting a change re-renders the shared panels, which read
  // straight from the focused engine rather than mirroring its state.
  // Every engine report bumps this; the workspace documents read the live engines, so they follow it.
  const [engineVersion, bump] = useReducer((count) => count + 1, 0);

  /**
   * Open guard (plan-design-editor-fixes A6): for a short window after the
   * editor mounts — and again the moment the first engine reports ready —
   * the floating panels yield pointer events to the stage, so the first
   * click/double-click after the editor opens reaches the canvas instead of
   * being eaten by a panel that mounted with it.
   */
  const [openGuard, setOpenGuard] = useState(true);
  /** Only the first engine-ready report re-arms the guard (see handleEngine). */
  const readySeenRef = useRef(false);
  useEffect(() => {
    if (!openGuard) return undefined;
    const timer = setTimeout(() => setOpenGuard(false), OPEN_GUARD_MS);
    return () => clearTimeout(timer);
  }, [openGuard]);

  /**
   * Each page reports its own engine, whether it finished opening, whether it
   * has unsaved work and how big its document is. Asking the engines directly
   * would mean reading them mid-open, when they still hold a blank placeholder
   * and no applied snapshot — and would call every page modified.
   */
  const handleEngine = useCallback((nodeId, state) => {
    if (state.engine) {
      enginesRef.current.set(nodeId, state);
      const store = useDesignStore.getState();
      if (store.nodes.some(node => node.id === nodeId) && state.ready) {
        const dirty = store.nodes.some(node => enginesRef.current.get(node.id)?.dirty || snapshotsRef.current.get(node.id)?.dirty);
        if (dirty) store.setIsDirty(true);
      }
      // Its work is live again; the snapshot it was rebuilt from is spent.
      if (state.ready) {
        snapshotsRef.current.delete(nodeId);
        // The stage becomes interactive the moment the first engine is up;
        // re-arm the guard so the first pointer gesture is never eaten.
        if (!readySeenRef.current) {
          readySeenRef.current = true;
          setOpenGuard(true);
        }
        pendingCanvasSelectionRef.current.consume(nodeId, state.engine);
      }
    } else {
      enginesRef.current.delete(nodeId);
    }
    bump();
  }, []);

  /**
   * An evicted page must keep everything an apply would need, because the
   * engine that could produce it is about to be gone. The flattened picture is
   * only worth carrying when there is an unsaved change to carry, and a page
   * torn down before it opened has nothing worth keeping at all.
   */
  const handleBeforeDispose = useCallback(async (nodeId, engine, ready) => {
    if (!ready) return;

    const writeSnapshot = (png) => {
      const dirty = engine.isDirty();
      snapshotsRef.current.set(nodeId, {
        doc: engine.serialise(),
        appliedDoc: engine.getAppliedDoc?.() ?? null,
        regions: engine.getRegions(),
        promptLayers: engine.getPromptLayers?.() ?? [],
        annotatedLayers: engine.exportAnnotatedLayers?.() ?? [],
        dirty,
        png: dirty ? png : null,
      });
    };

    // Publish a synchronous fallback first so a failed async flush never
    // discards the user's latest in-memory edit.
    writeSnapshot(engine.exportPng());
    try {
      if (engine.getSelectionTransform?.()) {
        await engine.applySelectionTransform?.();
      }
      await engine.flushTransforms?.();
      await engine.flushPaints?.();
      await engine.flushMasks?.();
      const dirty = engine.isDirty();
      const png = dirty
        ? ((await engine.exportFullResPng?.()) ?? engine.exportPng())
        : null;
      writeSnapshot(png);
    } catch (err) {
      console.error("Failed to flush editor snapshot before eviction", err);
    }
  }, []);

  const handleVisibility = useCallback((nodeId, visible) => {
    setVisibleIds((current) => {
      if (current.has(nodeId) === visible) return current;
      const next = new Set(current);
      if (visible) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
  }, []);

  /**
   * Which pages get an engine: what the reader can see, then whatever sits
   * nearest to the focused page, up to the cap. Distance rather than a
   * least-recently-used list, so the set only depends on where the reader is
   * now and scrolling back and forth cannot thrash it.
   */
  const activeIds = useMemo(() => {
    const focusedIndex = Math.max(0, nodeIds.indexOf(focusedId));
    const ranked = nodeIds
      .map((id, index) => ({ id, index, visible: visibleIds.has(id) }))
      .sort((left, right) => {
        if (left.id === focusedId) return -1;
        if (right.id === focusedId) return 1;
        if (left.visible !== right.visible) return left.visible ? -1 : 1;
        return (
          Math.abs(left.index - focusedIndex) -
          Math.abs(right.index - focusedIndex)
        );
      });
    const active = new Set(
      ranked.slice(0, MAX_LIVE_PAGES).map((entry) => entry.id),
    );
    // Keep the component master editable while its child is selected in a host.
    const sourceId = selectedInstanceChild?.sourceCanvasId;
    const sourcePageId = nodes.find(
      (node) =>
        node.id === sourceId || node.data?.editorDoc?.canvasId === sourceId,
    )?.id;
    if (sourcePageId && nodeIds.includes(sourcePageId)) {
      active.add(sourcePageId);
    }
    return active;
  }, [nodeIds, focusedId, visibleIds, selectedInstanceChild, nodes]);

  // A collaborator's brush stroke, replayed into whichever open page holds
  // that layer. Nothing is queued: a stroke only means something against the
  // picture it was painted on, so one for a page that is not open is dropped
  // rather than applied later to a document it was never about.
  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    void import("../../collab/stroke_bus.js").then(({ onRemoteStroke }) => {
      if (cancelled) return;
      detach = onRemoteStroke((stroke) => {
        for (const entry of enginesRef.current.values()) {
          const held = entry?.engine
            ?.getDocument()
            ?.nodes.some((node) => node.id === stroke.nodeId);
          if (held) {
            entry.engine.replayMaskStroke(stroke);
            return;
          }
        }
      });
    });
    return () => {
      cancelled = true;
      detach();
    };
  }, []);

  return { enginesRef, snapshotsRef, pendingCanvasSelectionRef, engineVersion,
    bump, openGuard, activeIds, handleEngine, handleBeforeDispose, handleVisibility };
}
