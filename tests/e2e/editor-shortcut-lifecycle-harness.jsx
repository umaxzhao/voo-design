import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useEditorShortcuts } from "../../src/canvas/use_editor_shortcuts.js";
import { createEditor } from "../../src/canvas/editor/editor_engine.js";

/** Two live canvases exercise shortcut ownership without the app's own listeners. */
export function mountShortcutAudit(Hook = useEditorShortcuts) {
  const host = document.createElement("section");
  Object.assign(host.style, { position: "fixed", inset: "10px", zIndex: 99999,
    background: "#777777", display: "flex", alignItems: "start", gap: "20px" });
  document.body.append(host);
  const api = { calls: [], commits: [[], []], flags: [[], []], engines: [], listeners: [], snapshots: [] };
  for (let index = 0; index < 2; index += 1) {
    const stage = document.createElement("div"), canvas = document.createElement("canvas");
    stage.dataset.editorArtboard = String(index);
    stage.dataset.shortcutStage = String(index);
    Object.assign(stage.style, { width: "300px", height: "250px", position: "relative" });
    stage.append(canvas); host.append(stage);
    const engine = createEditor({ canvas, stage, onChange: () => {} });
    const id = `keyboard-target-${index}`;
    engine.setDoc({ ...engine.getDocument(), width: 100, height: 100,
      backgroundColor: "#ffffff", nodes: [{ id, kind: "rect", visible: true,
        x: 10, y: 10, width: 20, height: 20, fill: index ? "#0000ff" : "#ff0000" }] });
    engine.selectExactly([id]);
    const commit = engine.commit;
    engine.commit = (...args) => { api.commits[index].push(args); return commit(...args); };
    const bypass = engine.setBypassAdjustments;
    engine.setBypassAdjustments = value => { api.flags[index].push(value); return bypass(value); };
    api.engines.push(engine);
  }
  const controls = document.createElement("div");
  controls.id = "shortcut-audit-controls"; host.append(controls);
  const root = createRoot(controls);
  const add = window.addEventListener, remove = window.removeEventListener;
  window.addEventListener = function (type, listener, options) {
    api.listeners.push({ type, listener, capture: options === true || Boolean(options?.capture),
      owned: new Error().stack?.includes("use_editor_shortcuts.js"), active: true });
    return add.call(this, type, listener, options);
  };
  window.removeEventListener = function (type, listener, options) {
    const capture = options === true || Boolean(options?.capture);
    const entry = api.listeners.find(item => item.active && item.type === type && item.listener === listener && item.capture === capture);
    if (entry) entry.active = false;
    return remove.call(this, type, listener, options);
  };
  let revision = 0;
  const log = (action, ...args) => api.calls.push({ action, version: api.version, engineIndex: api.engineIndex, args });
  // Only save/open/new change during the first rerender. Other callbacks stay
  // stable so the test can expose their missing dependencies in the old Hook.
  const stable = {
    onTool: tool => { log("tool", tool); api.engines[api.engineIndex].setTool(tool); },
    onUndo: () => { log("undo"); return api.engines[api.engineIndex].undo(); },
    onRedo: () => { log("redo"); return api.engines[api.engineIndex].redo(); },
    onToggleCommandPalette: () => log("palette"), onOpenFindReplace: () => log("find"),
    onDeleteGuide: id => log("deleteGuide", id),
    onOpenPieMenu: (family, position, code) => log("pie", family.id, position, code),
    onClosePieMenu: () => log("closePie"),
  };
  function Harness({ engineIndex, version, modalOpen, enabled, selectedGuideId }) {
    const engine = api.engines[engineIndex];
    const recordVersion = (action, ...args) => api.calls.push({ action, version, engineIndex, args });
    Hook({ ...stable, engine, enabled, modalOpen, tool: "select", selectedGuideId,
      onSave: options => recordVersion("save", options), onSaveAs: () => recordVersion("saveAs"),
      onOpen: () => recordVersion("open"), onNew: () => recordVersion("new"),
    });
    // Match the engine Hook's passive eviction snapshot, after keyboard cleanup.
    useEffect(() => () => api.snapshots.push({ engineIndex,
      commitCount: api.commits[engineIndex].length, session: engine.captureDocumentSession() }), [engine, engineIndex]);
    api.version = version;
    api.engineIndex = engineIndex;
    return <div>
      <input data-testid="shortcut-text" aria-label="Keyboard text" defaultValue="Editable" />
      <input data-testid="shortcut-range" aria-label="Keyboard range" type="range" defaultValue="50" />
      <div data-testid="shortcut-contenteditable" contentEditable suppressContentEditableWarning>Editable content</div>
      <button type="button" data-testid="shortcut-focus">Focus control</button>
      <div data-editor-artboard data-testid="shortcut-focus-surface"
        style={{ width: 120, height: 80 }} onPointerDown={event => event.preventDefault()} />
      <div role="dialog" data-testid="shortcut-dialog"><button type="button">Dialog control</button></div>
    </div>;
  }
  api.render = ({ engineIndex = 0, version = `v${++revision}`, modalOpen = false,
    enabled = true, selectedGuideId = null } = {}) => root.render(<Harness
    engineIndex={engineIndex} version={version} modalOpen={modalOpen}
    enabled={enabled} selectedGuideId={selectedGuideId} />);
  api.close = () => {
    root.unmount();
    window.addEventListener = add; window.removeEventListener = remove;
  };
  // Live engine stages remain measurable until their renderers are disposed.
  api.dispose = () => { api.engines.forEach(engine => engine.dispose()); host.remove(); };
  api.render({ version: "initial" });
  return api;
}
