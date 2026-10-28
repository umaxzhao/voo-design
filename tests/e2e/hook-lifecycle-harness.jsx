import React, { useRef } from "react";
import { createRoot } from "react-dom/client";
import { useEditorEngine } from "../../src/canvas/use_editor_engine.js";
import { createDocument } from "../../src/canvas/editor/scene_doc_factory.js";
import { createRectNode } from "../../src/canvas/editor/scene_model_node_builders.js";
import EditorTextOverlay from "../../src/canvas/components/editor_text_overlay.jsx";
import EditorRegionLabel from "../../src/canvas/components/editor_region_label.jsx";
import CanvasAgentPanel from "../../src/canvas/components/canvas_agent_panel.jsx";
import SettingsDesignSystems from "../../src/canvas/components/settings_design_systems.jsx";
import EditorPage from "../../src/canvas/components/editor_page.jsx";
import InspectPanel from "../../src/canvas/components/editor_properties/inspect_panel.jsx";
import { useDesignStore } from "../../src/store/design_store.js";

function host(id) {
  const element = document.createElement("div");
  element.id = id;
  Object.assign(element.style, {
    position: "fixed", left: "20px", top: "20px", zIndex: "99999",
    width: "600px", height: "800px", maxHeight: "90vh", overflow: "auto", background: "#171717",
  });
  document.body.append(element);
  const root = createRoot(element);
  return { element, root, close() { root.unmount(); element.remove(); } };
}

/** The actual engine hook owns a real canvas; only its source/callback props vary. */
export function mountEngineAudit() {
  const mounted = host("hook-engine-audit");
  const api = { sourceVersions: [], changes: [], disposals: [], engine: null, ready: false };
  function EngineHarness({ version, active }) {
    const canvasRef = useRef(null), stageRef = useRef(null);
    const result = useEditorEngine({
      canvasRef, stageRef, active, registerCommands: false,
      sourceWorkflowNodeId: "hook-engine-audit",
      getSource: () => {
        api.sourceVersions.push(version);
        const doc = createDocument(200, 100, "#ffffff");
        doc.nodes = [{ ...createRectNode({ x: 10, y: 10, width: 30, height: 20, fill: "#0000ff" }), id: "source-node" }];
        return { savedDoc: doc };
      },
      onChange: () => api.changes.push(version),
      onBeforeDispose: () => api.disposals.push(version),
    });
    api.engine = result.engine;
    api.ready = result.ready;
    return <div ref={stageRef} style={{ width: 400, height: 250, position: "relative" }}><canvas ref={canvasRef} /></div>;
  }
  api.render = (version, active = true) => mounted.root.render(<EngineHarness version={version} active={active} />);
  api.close = mounted.close;
  api.render("first");
  return api;
}

/** These are the production overlays; rerenders only replace their callback prop. */
export function mountOverlayAudit(kind) {
  const mounted = host("hook-overlay-audit");
  const api = { commits: [] };
  const viewport = { zoom: 1, panX: 0, panY: 30 };
  const text = { id: "text-audit", x: 20, y: 20, width: 220, height: 32, text: "Initial text", fontSize: 20, fontFamily: "system-ui", fill: "#ffffff" };
  const region = { id: "region-audit", x: 20, y: 20, width: 220, height: 100, label: "Initial region" };
  api.render = (version) => mounted.root.render(kind === "text"
    ? <EditorTextOverlay node={text} viewport={viewport} onCommit={(value) => api.commits.push({ version, value })} />
    : <EditorRegionLabel node={region} viewport={viewport} onCommit={(value) => api.commits.push({ version, value })} />);
  api.close = mounted.close;
  api.render("first");
  return api;
}

export function mountAgentAudit() {
  const mounted = host("hook-agent-audit");
  const api = { render: () => mounted.root.render(<CanvasAgentPanel onClose={() => {}} />), close: mounted.close };
  api.render();
  return api;
}

export function mountSettingsAudit() {
  const mounted = host("hook-settings-audit");
  mounted.root.render(<SettingsDesignSystems />);
  return { close: mounted.close };
}

/** A real full-mode page opens its own image source and later enables Skia. */
export function mountFullPageAudit() {
  const mounted = host("hook-page-audit");
  const state = useDesignStore.getState();
  const nodeId = state.editingNodeId;
  const originalNode = state.nodes.find(node => node.id === nodeId);
  const originalImages = state.images;
  const image = document.createElement("canvas");
  image.width = 8; image.height = 8;
  const context = image.getContext("2d");
  context.fillStyle = "#22cc55"; context.fillRect(0, 0, 8, 8);
  useDesignStore.setState({
    images: { ...originalImages, "hook-page-image": image.toDataURL() },
    nodes: state.nodes.map(node => node.id === nodeId
      ? { ...node, data: { ...node.data, editorDoc: null, imageId: "hook-page-image", layoutWidth: 8, layoutHeight: 8 } }
      : node),
  });
  const api = { entry: null, engines: [], disposals: [], visibility: [], changes: 0, generated: [], focus: [] };
  const onEngine = (id, entry) => { api.entry = entry; api.engines.push({ id, ...entry }); };
  const onBeforeDispose = (id, engine, ready) => api.disposals.push({ id, engine, ready });
  const onVisibility = (id, visible) => api.visibility.push({ id, visible });
  const onChange = () => { api.changes += 1; };
  const onGeneratedOutput = (result) => { api.generated.push(result); return "hook-page-candidate"; };
  api.nodeId = nodeId;
  api.render = () => mounted.root.render(<EditorPage readOnly nodeId={nodeId} title="Image source audit"
    focused active mode="full" onEngine={onEngine} onBeforeDispose={onBeforeDispose}
    onChange={onChange} onVisibility={onVisibility} onGeneratedOutput={onGeneratedOutput}
    onFocus={id => api.focus.push(id)} />);
  api.close = () => {
    mounted.close();
    localStorage.removeItem("voo.renderer");
    useDesignStore.setState({ images: originalImages,
      nodes: useDesignStore.getState().nodes.map(node => node.id === nodeId ? originalNode : node) });
  };
  api.render();
  return api;
}

export function mountInspectAudit(engine) {
  const mounted = host("hook-inspect-audit");
  mounted.root.render(<InspectPanel object={engine.getDocument().nodes[0]} engine={engine} />);
  return { close: mounted.close };
}
