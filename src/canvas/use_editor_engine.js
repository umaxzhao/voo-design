import {
  pageCameraCache,
  rememberPageCamera,
  restorePageCamera,
} from "./page_camera.js";
import { useEffect, useReducer, useRef, useState } from "react";
import { createEditor } from "./editor/editor_engine.js";
import { createEditorCommandBridge } from "./editor/editor_command_bridge.js";
import { openDecodeFailed } from "./editor_open_state.js";
import { useDesignStore } from "../store/design_store.js";
import { createWorkflowStoreEditorHost } from "../shared/editor-host-contract.js";
import { ensureModule, moduleState } from "./module_loader.js";
import { EDITOR_ENGINE_CHANGE_EVENT, setEditorEngineReady } from "./editor-engine-events.js";
// Runtime-only sessions retain undo and selection when a document tab unmounts.
const documentSessions = new Map();
useDesignStore.subscribe(state => {
  const ids = new Set(state.openDocuments.map(doc => doc.id));
  for (const [key, entry] of documentSessions) if (!ids.has(entry.documentId)) documentSessions.delete(key);
});
export { EDITOR_ENGINE_CHANGE_EVENT } from "./editor-engine-events.js";

/**
 * Binds the editor engine to React.
 *
 * The engine owns the document and repaints itself, so React's only job is to
 * mirror the handful of values the panels display. It re-reads them whenever
 * the engine reports a change rather than holding a copy of the document —
 * one source of truth, and no risk of the two drifting apart.
 *
 * `onChange` lets an owner higher up re-render too: with several pages open the
 * shared toolbar lives above the page that owns the engine, so it has to hear
 * about the same changes. `onBeforeDispose` runs while the engine is still
 * usable, which is the only moment a caller can take a snapshot of a page that
 * is about to be torn down.
 */
export function useEditorEngine({
  canvasRef,
  stageRef,
  source,
  getSource,
  active,
  onChange,
  onBeforeDispose,
  onGeneratedOutput,
  sourceWorkflowNodeId,
  cameraMode = "page",
  registerCommands = true,
  getFitInsets = null,
}) {
  // The engine is state rather than a ref so an owner can react to it
  // appearing; a ref would leave the first render after creation blind.
  const [engine, setEngine] = useState(null);
  const [, bump] = useReducer((count) => count + 1, 0);
  const [ready, setReady] = useState(false);
  // A resolved open is not proof of a decoded picture: a decode failure
  // leaves a blank document and the engine still resolves. The hook checks
  // the document against the source (editor_open_state.js) and surfaces the
  // miss here, so the page can show an error instead of an empty canvas.
  const [error, setError] = useState(null);
  // Bumping this re-runs the open effect: the page's Retry button.
  const [retryToken, setRetryToken] = useState(0);
  // Held in refs so a changed callback never tears the engine down and throws
  // away the document with it.
  const onChangeRef = useRef(onChange);
  const onBeforeDisposeRef = useRef(onBeforeDispose);
  const onGeneratedOutputRef = useRef(onGeneratedOutput);
  const getFitInsetsRef = useRef(getFitInsets);
  const sourceRef = useRef(source);
  const getSourceRef = useRef(getSource);
  onChangeRef.current = onChange;
  onBeforeDisposeRef.current = onBeforeDispose;
  onGeneratedOutputRef.current = onGeneratedOutput;
  getFitInsetsRef.current = getFitInsets;
  sourceRef.current = source;
  getSourceRef.current = getSource;

  useEffect(() => {
    if (!active || !canvasRef.current || !stageRef.current) return undefined;

    // Capture the source once for this engine activation. Cache notifications
    // may update the next source without replacing an in-progress document.
    const openedSource = getSourceRef.current
      ? getSourceRef.current()
      : sourceRef.current;

    const host = createWorkflowStoreEditorHost(useDesignStore, {
      sourceWorkflowNodeId,
      ensureModule: (moduleId, opts) => ensureModule(moduleId, opts),
      moduleState: (moduleId) => moduleState(moduleId),
      isModuleInstalled: (moduleId) => moduleState(moduleId) === "installed",
      onGeneratedOutput: (result) => {
        const sink = onGeneratedOutputRef.current;
        if (typeof sink !== "function") {
          throw new Error("generatedOutputSinkMissing");
        }
        return sink(result);
      },
    });

    const created = createEditor({
      canvas: canvasRef.current,
      stage: stageRef.current,
      cameraMode,
      sourceWorkflowNodeId,
      host,
      // Read at fit time: the panels around the stage change with its width.
      getFitInsets: (stageWidth) =>
        getFitInsetsRef.current?.(stageWidth) ?? null,
      onGeneratedOutput: (result) => {
        const sink = onGeneratedOutputRef.current;
        if (typeof sink !== "function") {
          throw new Error("generatedOutputSinkMissing");
        }
        return sink(result);
      },
      onChange: () => {
        bump();
        onChangeRef.current?.();
        // The Agent's layer target follows selection without polling or
        // registering a second engine. Read-only previews never publish it.
        if (registerCommands)
          window.dispatchEvent(
            new CustomEvent(EDITOR_ENGINE_CHANGE_EVENT, {
              detail: { nodeId: sourceWorkflowNodeId },
            }),
          );
      },
    });
    setEngine(created);
    setReady(false);
    setError(null);
    // Test hook: with ?voo-test=1 the engine is exposed so the Playwright
    // acceptance harness can assert engine state directly (selection bounds,
    // transform rect, tool). Inert in normal use.
    if (registerCommands) {
      window.__vooEditor = created;
      window.__vooEditors = window.__vooEditors || {};
      if (sourceWorkflowNodeId) {
        window.__vooEditors[sourceWorkflowNodeId] = created;
      }
      window.__vooStore = useDesignStore.getState();
    }

    // Agent command bridge: the workflow store routes editor commands
    // (select_region / refine / fill / repaint) from agent tools to this
    // engine. Registered in editorBridges by sourceWorkflowNodeId.
    const commandBridge = registerCommands
      ? createEditorCommandBridge(created, {
          nodeId: sourceWorkflowNodeId,
        })
      : null;
    if (commandBridge) commandBridge.ready = false;
    if (commandBridge)
      useDesignStore
        .getState()
        .registerEditorBridge?.(sourceWorkflowNodeId, commandBridge);

    const documentId = useDesignStore.getState().activeDocumentId;
    const sessionKey = `${documentId}:${sourceWorkflowNodeId}`;
    const previousSession = documentSessions.get(sessionKey)?.snapshot;
    const pageCameras = pageCameraCache(
      useDesignStore.getState().editorPageSession,
    );
    let cancelled = false;
    let opened = false;
    void created
      .open(openedSource)
      .then(async () => {
        if (cancelled) return;
        if (previousSession) {
          const snapshot = await previousSession;
          if (cancelled) return;
          created.restoreDocumentSession(snapshot.state);
          created.setViewport(snapshot.viewport);
        }
        if (openDecodeFailed(openedSource, created.getDocument())) {
          setError({ code: "decodeFailed" });
          return;
        }
        opened = true;
        setEditorEngineReady(created, true);
        setReady(true);
        if (commandBridge) {
          commandBridge.ready = true;
          window.dispatchEvent(
            new CustomEvent(EDITOR_ENGINE_CHANGE_EVENT, {
              detail: { nodeId: sourceWorkflowNodeId },
            }),
          );
        }
        if (cameraMode !== "shared") {
          if (!previousSession && !restorePageCamera(pageCameras, sourceWorkflowNodeId, created))
            created.zoomToFit();
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to open image editor source", err);
        setError({ code: err?.code ?? "openFailed", message: err?.message });
      });

    const resizeObserver = new ResizeObserver(() => {
      if (
        opened &&
        !previousSession &&
        created &&
        cameraMode !== "shared" &&
        !pageCameras.has(sourceWorkflowNodeId) &&
        stageRef.current?.clientWidth &&
        stageRef.current?.clientHeight
      ) {
        created.zoomToFit();
      }
    });
    if (stageRef.current) {
      resizeObserver.observe(stageRef.current);
    }

    return () => {
      cancelled = true;
      setEditorEngineReady(created, false);
      if (opened && cameraMode !== "shared")
        rememberPageCamera(
          pageCameras,
          sourceWorkflowNodeId,
          created.getViewport?.(),
        );
      resizeObserver.disconnect();
      if (window.__vooEditors?.[sourceWorkflowNodeId] === created) {
        delete window.__vooEditors[sourceWorkflowNodeId];
      }
      if (window.__vooEditor === created) {
        window.__vooEditor = null;
      }
      if (commandBridge) {
        useDesignStore
          .getState()
          .unregisterEditorBridge?.(sourceWorkflowNodeId, commandBridge);
        window.dispatchEvent(
          new CustomEvent(EDITOR_ENGINE_CHANGE_EVENT, {
            detail: { nodeId: sourceWorkflowNodeId },
          }),
        );
      }
      let snapshotWork = null;
      try {
        snapshotWork = onBeforeDisposeRef.current?.(created) ?? null;
      } catch (err) {
        console.error("Failed to snapshot editor before dispose", err);
      }
      if (opened && useDesignStore.getState().openDocuments.some(doc => doc.id === documentId)) {
        const capture = () => ({ state: created.captureDocumentSession(), viewport: created.getViewport() });
        documentSessions.set(sessionKey, { documentId, snapshot: snapshotWork && typeof snapshotWork.then === "function"
          ? Promise.resolve(snapshotWork).then(capture) : Promise.resolve(capture()) });
      }
      setEngine(null);
      setReady(false);
      if (snapshotWork && typeof snapshotWork.then === "function") {
        void Promise.resolve(snapshotWork)
          .catch((err) => {
            console.error("Failed to finish editor snapshot", err);
          })
          .finally(() => created.dispose());
      } else {
        created.dispose();
      }
    };
  }, [
    active,
    canvasRef,
    stageRef,
    cameraMode,
    registerCommands,
    retryToken,
    sourceWorkflowNodeId,
  ]);

  return {
    engine,
    ready,
    error,
    retry: () => setRetryToken((token) => token + 1),
    tool: engine?.getTool() ?? "select",
    color: engine?.getColor() ?? null,
    zoom: engine?.getZoom() ?? 1,
    doc: engine?.getDocument() ?? null,
    selected: engine?.getSelected() ?? null,
    selectedIds:
      engine?.getSelectedIds?.() ??
      (engine?.getSelectedId?.() ? [engine.getSelectedId()] : []),
    backgroundSelected: engine?.isBackgroundSelected() ?? false,
    editingTextId: engine?.getEditingTextId() ?? null,
    editingRegionId: engine?.getEditingRegionId() ?? null,
    maskEdit: engine?.getMaskEdit() ?? null,
    lasso: engine?.getLasso() ?? null,
    cropRect: engine?.getCropRect() ?? null,
    canUndo: engine?.canUndo() ?? false,
    canRedo: engine?.canRedo() ?? false,
  };
}
