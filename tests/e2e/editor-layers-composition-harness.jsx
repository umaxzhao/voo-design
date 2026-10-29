import React from "react";
import { createRoot } from "react-dom/client";
import EditorLayers from "../../src/canvas/components/editor_layers.jsx";
import { createEditor } from "../../src/canvas/editor/editor_engine.js";

/** Real engines feed the same public layer callbacks as the editor container. */
export function mountLayerCompositionAudit() {
  const element = document.createElement("div");
  element.id = "layers-composition-audit";
  Object.assign(element.style, { position: "fixed", left: "20px", top: "100px",
    width: "320px", height: "700px", zIndex: "99999", background: "#171717" });
  document.body.append(element);
  const stage = document.createElement("div");
  Object.assign(stage.style, { position: "fixed", left: "-2000px", width: "400px", height: "300px" });
  const canvas = document.createElement("canvas"); stage.append(canvas); document.body.append(stage);
  const root = createRoot(element);
  const api = { active: "first", focusEvents: [], first: window.__vooEditor };
  api.second = createEditor({ canvas, stage, onChange: () => api.render?.() });
  api.second.setDoc({ ...api.second.getDocument(), width: 400, height: 300, isCanvasRoot: false, backgroundColor: "#ffffff",
    nodes: [{ id: "second-blue", name: "Second blue", kind: "rect", visible: true,
      x: 20, y: 20, width: 80, height: 60, fill: "#0000ff", strokeWidth: 0 }] });
  const focus = (id) => { api.active = id; api.focusEvents.push(id); api.render(); };
  function Harness() {
    const engine = api[api.active], doc = engine.getDocument(), selected = engine.getSelectedIds();
    const nodeAt = index => doc.nodes[index];
    const change = action => (...args) => { action(...args); api.render(); };
    return <EditorLayers objects={doc.nodes} activeCanvasId={api.active}
      canvasPages={["first", "second"].map(id => ({ id, title: id === "first" ? "First canvas" : "Second canvas",
        nodes: api[id].getDocument().nodes, selectedIds: api[id].getSelectedIds(), type: "design" }))}
      selectedIds={selected} activeIndex={doc.nodes.findIndex(node => selected.includes(node.id))}
      backgroundColor={doc.backgroundColor} onSelect={change(index => engine.selectExactly([nodeAt(index).id]))}
      onToggleSelect={change(index => engine.toggleExactly(nodeAt(index).id))}
      onSelectExactly={change(ids => engine.selectExactly(ids))}
      onSelectGroup={change(id => engine.selectGroup(id))}
      onToggle={change(index => engine.updateNode(nodeAt(index).id, { visible: !nodeAt(index).visible }))}
      onToggleLock={change(index => engine.toggleLockNode(nodeAt(index).id))}
      onRemove={change(index => engine.removeNode(nodeAt(index).id))}
      onMutate={change((id, patch) => engine.updateNode(id, patch, { commit: false }))}
      onCommit={change(() => engine.commit("editor.history.entry.layer"))}
      onRename={change((index, name) => engine.updateNode(nodeAt(index).id, { name: name ?? undefined }))}
      onFocusCanvas={focus} onSelectCanvasLayer={(id, layerId) => {
        api.active = id; api[id].selectExactly([layerId]); api.focusEvents.push(id); api.render();
      }} />;
  }
  api.render = () => root.render(<Harness />);
  api.close = () => { root.unmount(); api.second.dispose(); element.remove(); stage.remove(); };
  api.render();
  return api;
}
