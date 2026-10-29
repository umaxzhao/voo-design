import React from "react";
import { createRoot } from "react-dom/client";
import EditorStatusNotices from "../../src/canvas/components/editor_status_notices.jsx";
import EditorPage from "../../src/canvas/components/editor_page.jsx";
import { createDocument, createRectNode } from "../../src/canvas/editor/scene_model.js";
import { useDesignStore } from "../../src/store/design_store.js";

/** One actual Page owns its engine; only surrounding workflow metadata is supplied. */
export function mountEditorPageCompositionAudit() {
  const element = document.createElement("div");
  element.id = "editor-page-composition-audit";
  Object.assign(element.style, { position: "fixed", left: "80px", top: "100px", width: "640px", height: "520px", zIndex: "99999", background: "#444444" });
  document.body.append(element);
  const root = createRoot(element);
  const original = useDesignStore.getState();
  const nodeId = "page-composition-fixture";
  const doc = createDocument(320, 240, "#ffffff");
  doc.nodes = [{ ...createRectNode({ x: 20, y: 20, width: 60, height: 40, fill: "#ff0000" }), id: "composition-rect" }];
  const stored = { ...doc, nodes: doc.nodes.map(node => ({ ...node, fill: "#00ffff" })) };
  useDesignStore.setState({ nodes: [...original.nodes, { id: nodeId, data: { editorDoc: stored, layoutWidth: 320, layoutHeight: 240 } }] });
  const api = { nodeId, version: "first", props: { title: "Original page", active: true, snapshot: { doc } },
    entry: null, disposals: [], changes: [], renames: [], engines: [] };
  api.render = patch => {
    Object.assign(api.props, patch);
    const version = api.version;
    root.render(<EditorPage nodeId={nodeId} title={api.props.title} active={api.props.active}
      snapshot={api.props.snapshot} focused mode="full" onFocus={() => {}}
      onEngine={(id, entry) => { api.entry = entry; if (entry.engine) api.engines.push(entry.engine); }}
      onBeforeDispose={(id, engine, ready) => {
        api.disposals.push({ version, ready, doc: engine.serialise() });
        if (ready) api.props.snapshot = { doc: engine.serialise(), appliedDoc: engine.getAppliedDoc?.() ?? null };
      }}
      onChange={() => api.changes.push(version)} onGeneratedOutput={() => {}} onVisibility={() => {}}
      onRenamePage={(id, name) => { api.renames.push({ version, id, name }); api.render({ title: name }); }} />);
  };
  api.addExternalImage = () => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 20;
    canvas.getContext("2d").fillStyle = "#11dd44"; canvas.getContext("2d").fillRect(0, 0, 20, 20);
    const state = useDesignStore.getState();
    const current = state.nodes.find(node => node.id === nodeId);
    const saved = { ...current.data.editorDoc, nodes: [...current.data.editorDoc.nodes,
      { id: "external-saved-layer", kind: "image", imageId: "composition-external-image" }] };
    const update = { nodes: state.nodes.map(node => node.id === nodeId ? { ...node, data: { ...node.data, editorDoc: saved } } : node),
      images: { ...state.images, "composition-external-image": canvas.toDataURL() } };
    useDesignStore.setState(update);
    useDesignStore.setState({ images: { ...update.images } });
  };
  api.close = () => {
    root.unmount(); element.remove();
    useDesignStore.setState({ nodes: original.nodes, images: original.images });
  };
  api.render();
  return api;
}

/** Exercise the extracted notice callbacks through real rendered buttons. */
export function mountEditorStatusAudit() {
  const element = document.createElement("div");
  element.id = "editor-status-audit";
  Object.assign(element.style, { position: "fixed", left: "80px", top: "100px", width: "640px", height: "520px", zIndex: "99999", background: "#444444" });
  document.body.append(element);
  const root = createRoot(element);
  const api = { props: { persistQuota: { source: "image-store" }, aiErrorText: "Model failed" }, dismissals: [] };
  const update = (key, value) => { api.dismissals.push(key); api.props[key] = value; api.render(); };
  api.render = patch => {
    Object.assign(api.props, patch);
    root.render(<EditorStatusNotices {...api.props} t={key => key}
      setPersistQuota={value => update("persistQuota", value)}
      setAiErrorText={value => update("aiErrorText", value)}
      downloadMattingModel={() => {}} cancelMattingModelDownload={() => {}} />);
  };
  api.close = () => { root.unmount(); element.remove(); };
  api.render();
  return api;
}
