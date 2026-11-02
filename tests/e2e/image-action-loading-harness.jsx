import React, { useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEditor } from "../../src/canvas/editor/editor_engine.js";
import { useEditorImageActions } from "../../src/canvas/components/editor_hooks/use_editor_image_actions.js";

/** Real action Hook and real engines, with a controllable page registry. */
export function mountImageActionHarness() {
  const host = document.createElement("div");
  host.id = "image-action-loading-harness";
  Object.assign(host.style, { position: "fixed", left: "320px", top: "180px", zIndex: "1000", background: "#171717", padding: "12px" });
  document.body.append(host);
  const source = window.__vooEditor;
  const pageId = window.__vooStore.editingNodeId;
  const enginesRef = { current: new Map([[pageId, { engine: source }]]) };
  const snapshotsRef = { current: new Map() };
  const options = { engine: source };
  const trace = { source, pageId, enginesRef, options, errors: [] };
  let alternate = null;
  const root = createRoot(host);
  function Harness() {
    const [, refresh] = useReducer(value => value + 1, 0);
    const [error, setError] = useState(null);
    trace.refresh = refresh;
    const actions = useEditorImageActions({ engine: options.engine, enginesRef, snapshotsRef,
      retouchImage: () => {}, setImageActionError: value => { trace.errors.push(value); setError(value); } });
    trace.actions = actions;
    return <div data-image-action-state={JSON.stringify({ pending: actions.imageActionPending, error })}>
      <button onClick={() => { trace.lastAction = actions.runAutoEnhance(pageId); }}>Enhance</button>
      <button onClick={() => { trace.lastAction = actions.runSmartCrop(); }}>Smart crop</button>
    </div>;
  }
  trace.replaceEngine = ({ changeProp = true } = {}) => {
    const stage = document.createElement("div"), canvas = document.createElement("canvas");
    stage.append(canvas); host.append(stage);
    alternate = createEditor({ canvas, stage, onChange: () => {} });
    alternate.setDoc(source.getDocument());
    enginesRef.current.set(pageId, { engine: alternate });
    if (changeProp) options.engine = alternate;
    trace.alternate = alternate;
    trace.refresh();
  };
  trace.removeEngine = () => { enginesRef.current.delete(pageId); trace.refresh(); };
  trace.dispose = () => { alternate?.dispose(); alternate = null; };
  trace.close = () => { root.unmount(); trace.dispose(); host.remove(); };
  root.render(<Harness />);
  window.__imageActionTrace = trace;
}
