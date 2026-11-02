import React, { useEffect, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createDocument, createRectNode } from "../../src/canvas/editor/scene_model.js";
import { useEditorEngine } from "../../src/canvas/use_editor_engine.js";
import { useDesignStore } from "../../src/store/design_store.js";
import { useEditorEngineRegistry } from "../../src/canvas/components/editor_hooks/use_editor_engine_registry.js";
import { useEditorCanvasNavigation } from "../../src/canvas/components/editor_hooks/use_editor_canvas_navigation.js";

/** Mount the production session hooks around a live host and real master engine. */
export function mountEditorSessionAudit() {
  const element = document.createElement("div");
  element.id = "editor-session-audit";
  Object.assign(element.style, { position: "fixed", left: "20px", top: "20px", zIndex: "99999", width: "320px", height: "240px" });
  document.body.append(element);
  const root = createRoot(element);
  const storeBefore = useDesignStore.getState();
  const hostId = storeBefore.editingNodeId;
  const host = window.__vooEditor;
  const masterDoc = createDocument(120, 80, "#ffffff", { canvasId: "session-master-canvas" });
  masterDoc.nodes = [{ ...createRectNode({ x: 10, y: 10, width: 30, height: 20, fill: "#ff00ff" }), id: "master-child" }];
  const hostDoc = createDocument(200, 160, "#ffffff", { canvasId: "session-host-canvas" });
  hostDoc.nodes = [{ ...createRectNode({ x: 20, y: 20, width: 50, height: 30, fill: "#ff0000" }), id: "host-child" },
    { id: "session-instance", kind: "canvasInstance", sourceCanvasId: "session-master-canvas", x: 80, y: 40, width: 100, height: 80, visible: true }];
  host.setDoc(hostDoc);
  const metadata = [{ id: hostId, data: { editorDoc: hostDoc } }, { id: "session-master", data: { editorDoc: masterDoc } },
    ...Array.from({ length: 14 }, (_, index) => ({ id: `session-filler-${index}`, data: {} }))];
  useDesignStore.setState({ nodes: [...storeBefore.nodes, ...metadata.slice(1)] });
  const api = { host, hostId, metadata, props: { focusedId: hostId, nodeIds: [hostId, "session-master"], multi: true },
    focusCalls: [], openCalls: [], background: true, close: null };
  const source = () => ({ savedDoc: masterDoc });

  function Harness() {
    const [, refresh] = useReducer(value => value + 1, 0);
    const [nested, setNested] = useState(null);
    const canvasRef = useRef(null), stageRef = useRef(null);
    const master = useEditorEngine({ canvasRef, stageRef, active: true, registerCommands: false,
      sourceWorkflowNodeId: "session-master", getSource: source });
    const registry = useEditorEngineRegistry({ ...api.props, nodes: metadata, selectedInstanceChild: nested });
    useEffect(() => {
      registry.handleEngine(hostId, { engine: host, ready: true, dirty: host.isDirty() });
    }, [registry.handleEngine]);
    useEffect(() => {
      if (master.engine) registry.handleEngine("session-master", master);
    }, [master.engine, master.ready, registry.handleEngine]);
    const focusEditorPage = id => { api.focusCalls.push(id); api.props.focusedId = id; refresh(); };
    const openExistingEditorPage = id => {
      api.openCalls.push(id);
      if (api.blockOpen) return false;
      api.props.nodeIds = [...new Set([...api.props.nodeIds, id])];
      focusEditorPage(id);
      return true;
    };
    const engine = registry.enginesRef.current.get(api.props.focusedId)?.engine ?? null;
    const navigation = useEditorCanvasNavigation({ ...api.props, nodes: metadata, engine,
      enginesRef: registry.enginesRef, pendingCanvasSelectionRef: registry.pendingCanvasSelectionRef,
      focusEditorPage, openExistingEditorPage, handleBeforeDispose: registry.handleBeforeDispose,
      setSelectedInstanceChild: setNested, setCanvasBackgroundSelected: value => { api.background = value; } });
    api.master = master;
    api.current = { registry, navigation, nested };
    api.render = patch => { Object.assign(api.props, patch); refresh(); };
    api.setNested = setNested;
    return <div ref={stageRef} style={{ position: "relative", width: 320, height: 200 }}><canvas ref={canvasRef} /></div>;
  }
  api.close = () => {
    root.unmount(); element.remove();
    api.releasedReader = useDesignStore.getState().editorPageDocumentReader;
    useDesignStore.setState({ nodes: storeBefore.nodes, editorPageDocumentReader: storeBefore.editorPageDocumentReader });
  };
  root.render(<Harness />);
  return api;
}
