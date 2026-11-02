import React, { useRef } from "react";
import { createRoot } from "react-dom/client";
import { useEditorFeedback } from "../../src/canvas/components/editor_hooks/use_editor_feedback.js";
import { useEditorMediaImport } from "../../src/canvas/components/editor_hooks/use_editor_media_import.js";
import { useEditorMobilePanels } from "../../src/canvas/components/editor_hooks/use_editor_mobile_panels.js";
import { useEditorImageActions } from "../../src/canvas/components/editor_hooks/use_editor_image_actions.js";

/** Mount the actual extracted hooks; fake engines only record their public calls. */
export function mountEditorRefactorAudit() {
  const element = document.createElement("div");
  element.id = "editor-refactor-audit";
  Object.assign(element.style, {
    position: "fixed", left: "20px", top: "20px", zIndex: "99999",
    width: "400px", height: "500px", background: "#171717",
  });
  document.body.append(element);
  const root = createRoot(element);
  const api = {
    calls: [], props: { isNarrow: true, multi: false, focusedId: "first" },
    camera: { zoom: 1, panX: 0, panY: 0 },
    regionHint: null, regionTone: null,
  };
  const translate = key => key;
  const record = (kind, ...values) => api.calls.push({ kind, values });
  const feedbackEngine = {
    getRegionHint: () => api.regionHint,
    getRegionHintTone: () => api.regionTone,
    setRegionHint: value => { api.regionHint = value; record("clear-region", value); },
  };
  const pixelCanvas = document.createElement("canvas");
  pixelCanvas.width = 8; pixelCanvas.height = 8;
  const ctx = pixelCanvas.getContext("2d");
  ctx.fillStyle = "#444444"; ctx.fillRect(0, 0, 8, 8);
  const documents = { first: { nodes: [] }, second: { nodes: [] } };
  const tools = { first: "select", second: "select" };
  const makeEngine = name => ({
    prepareImageInsertion: async file => {
      if (api.holdImport) await api.holdImport;
      if (api.failImport) throw new Error("fixture-import-failed");
      return { file };
    },
    insertPreparedImages: entries => entries.map(({ prepared, point }) => {
      record("insert-image", name, prepared.file.name, point);
      const node = { id: `${name}-${documents[name].nodes.length}`, kind: "image" };
      documents[name] = { nodes: [...documents[name].nodes, node] };
      return node;
    }),
    getSelectedIds: () => [],
    selectExactly: () => {},
    setDoc: document => { documents[name] = document; },
    getTool: () => tools[name],
    setTool: value => {
      tools[name] = value;
      record("tool", name, value);
    },
    zoomAt: (...args) => record("zoom", name, ...args),
    panBy: (...args) => record("pan", name, ...args),
    toDocPoint: (x, y) => ({ x: x - 10, y: y - 20 }),
    getSelected: () => ({ id: `${name}-image`, kind: "image", adjustments: {} }),
    getDocument: () => documents[name],
    getNodeBitmap: () => pixelCanvas,
    updateNode: (...args) => record("update", name, ...args),
  });
  api.engines = { first: makeEngine("first"), second: makeEngine("second") };
  const enginesRef = { current: new Map(Object.entries(api.engines).map(([id, engine]) => [id, { engine }])) };
  const snapshotsRef = { current: new Map() };
  const focusEditorPage = id => record("focus", id);
  const openVooDocument = file => record("open-document", file.name);
  const clearSplitLayersError = () => { record("clear-split"); api.props.splitLayersError = null; api.render(); };
  const setEditorCamera = update => { api.camera = update(api.camera); };
  const undo = () => record("undo");
  const redo = () => record("redo");
  const retouchImage = strengths => record("retouch", api.props.focusedId, strengths);

  function Harness() {
    const freeStageRef = useRef(null);
    const editorRootRef = useRef(element);
    const panGestureRef = useRef({ moving: true });
    const spaceRef = useRef(false);
    const engine = api.engines[api.props.focusedId];
    const feedback = useEditorFeedback({ engine: feedbackEngine, t: translate,
      clearSplitLayersError, ...api.props });
    const media = useEditorMediaImport({ engine, enginesRef,
      focusedId: api.props.focusedId, focusEditorPage, openVooDocument, t: translate });
    const mobile = useEditorMobilePanels({ engine, ...api.props, setEditorCamera,
      freeStageRef, editorRootRef, panGestureRef, spaceRef, undo, redo });
    const image = useEditorImageActions({ engine, enginesRef, snapshotsRef,
      retouchImage, setImageActionError: feedback.setImageActionError });
    api.current = { feedback, media, mobile, image, panGestureRef };
    const panelProps = {
      onPointerDownCapture: mobile.onMobilePanelPointerDownCapture,
      onPointerMoveCapture: mobile.onMobilePanelPointerMoveCapture,
      onPointerUpCapture: mobile.onMobilePanelPointerUpCapture,
      onPointerCancelCapture: mobile.onMobilePanelPointerCancelCapture,
      onClickCapture: mobile.onMobilePanelClickCapture,
    };
    return <div {...panelProps}>
      <button id="expand-audit-panel" onClick={() => mobile.setMobileLayersExpanded(true)}>Expand</button>
      <div data-testid="editor-layers-panel" style={{ height: 120 }}>
        <button id="audit-panel-action" onClick={() => record("panel-click")}>Panel action</button>
      </div>
      <div data-testid="editor-pages" ref={freeStageRef} {...mobile.mobileCanvasGestures}
        style={{ height: 220, touchAction: "none" }} />
      <input ref={media.mediaInputRef} type="file" onClick={() => record("picker")} />
    </div>;
  }
  api.render = patch => { Object.assign(api.props, patch); root.render(<Harness />); };
  api.close = () => { root.unmount(); element.remove(); };
  api.render();
  return api;
}
