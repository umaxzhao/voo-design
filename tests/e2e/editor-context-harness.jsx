import React, { useEffect, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createDocument, createRectNode } from "../../src/canvas/editor/scene_model.js";
import { useEditorEngine } from "../../src/canvas/use_editor_engine.js";
import { useDesignStore } from "../../src/store/design_store.js";
import { useEditorFrameProperties } from "../../src/canvas/components/editor_hooks/use_editor_frame_properties.js";
import { createEditorPropertyLibraries } from "../../src/canvas/components/editor_hooks/editor_property_libraries.js";
import { useEditorComponentContext } from "../../src/canvas/components/editor_hooks/use_editor_component_context.js";

/** The production hooks use two actual canvas engines; only layout metadata is recorded. */
export function mountEditorContextAudit() {
  const element = document.createElement("div");
  element.id = "editor-context-audit";
  Object.assign(element.style, { position: "fixed", left: "20px", top: "20px", zIndex: "99999", width: "320px", height: "240px", background: "#171717" });
  document.body.append(element);
  const root = createRoot(element);
  const masterDoc = createDocument(120, 80, "#ffffff", { canvasId: "master-canvas" });
  masterDoc.nodes = [{ ...createRectNode({ x: 10, y: 10, width: 30, height: 20, fill: "#ff00ff" }), id: "master-child" }];
  const snapshotDoc = createDocument(90, 60, "#ffffff", { canvasId: "snapshot-canvas" });
  const hostEngine = window.__vooEditor;
  const api = {
    props: { focusedId: "host", propertyId: "pinned", multi: true },
    hostEngine, layouts: new Map([["host", { x: 48, y: 48, width: 600, height: 400 }]]), layoutWrites: [],
  };
  const enginesRef = { current: new Map([["host", { ready: true, engine: hostEngine }]]) };
  const snapshotsRef = { current: new Map([["snapshot", { doc: snapshotDoc }]]) };
  const metadata = [{ id: "host", data: { label: "Host" } }, { id: "master", data: { editorDoc: masterDoc } }, { id: "snapshot", data: { editorDoc: snapshotDoc } }];
  const translate = (_key, values) => `Variable ${values?.index ?? 1}`;
  const source = () => ({ savedDoc: masterDoc });

  function Harness() {
    const [, refresh] = useReducer(value => value + 1, 0);
    const [nestedSelection, setNestedSelection] = useState(null);
    const canvasRef = useRef(null), stageRef = useRef(null);
    const master = useEditorEngine({ canvasRef, stageRef, active: true, registerCommands: false,
      sourceWorkflowNodeId: "context-master", getSource: source });
    api.master = master;
    enginesRef.current.set("master", master);
    useEffect(() => hostEngine.subscribeRender(refresh), []);
    const doc = hostEngine.getDocument();
    const setEditorArtboardLayout = (id, layout) => { api.layoutWrites.push({ id, layout }); api.layouts.set(id, layout); refresh(); };
    const frame = useEditorFrameProperties({ engine: hostEngine, doc, focusedId: api.props.focusedId,
      isFrameSelected: true, frameLayout: api.layouts.get(api.props.focusedId) ?? { x: 0, y: 0 },
      layoutById: api.layouts, setEditorArtboardLayout, multi: api.props.multi });
    const libraries = createEditorPropertyLibraries({ engine: hostEngine, doc,
      propertyObject: doc.nodes.find(node => node.id === api.props.propertyId) ?? null, t: translate });
    const components = useEditorComponentContext({ doc, nodes: metadata,
      nodeIds: ["host", "master", "snapshot"], focusedId: api.props.focusedId,
      selected: hostEngine.getSelected(), selectedInstanceChild: nestedSelection,
      setSelectedInstanceChild: setNestedSelection, enginesRef, snapshotsRef,
      pageTitle: id => id });
    api.current = { frame, libraries, components, nestedSelection };
    api.render = patch => { Object.assign(api.props, patch); refresh(); };
    api.setNested = setNestedSelection;
    return <div>
      <button id="context-resize" onClick={() => {
        frame.handleMutateFrame({ x: 80, y: 90, width: 800, height: 500, fill: "#abcdef" }, { commit: false });
        hostEngine.commit("editor.frame.update");
      }}>Resize</button>
      <button id="context-variable" onClick={() => libraries.colorVariableActions.create()}>Variable</button>
      <button id="context-style" onClick={() => libraries.styleActions.actions.create("paint", "Brand")}>Style</button>
      <div ref={stageRef} style={{ position: "relative", width: 320, height: 180 }}><canvas ref={canvasRef} /></div>
    </div>;
  }
  api.close = () => { root.unmount(); element.remove(); };
  api.storeDocument = (id, doc) => {
    const state = useDesignStore.getState();
    useDesignStore.setState({ nodes: [...state.nodes, { id, data: { editorDoc: doc } }] });
  };
  root.render(<Harness />);
  return api;
}
