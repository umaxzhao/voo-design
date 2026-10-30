import React from "react";
import { createRoot } from "react-dom/client";
import CanvasAgentPanel from "../../src/canvas/components/canvas_agent_panel.jsx";
import { useDesignStore } from "../../src/store/design_store.js";
import {
  EDITOR_ENGINE_CHANGE_EVENT,
  setEditorEngineReady,
} from "../../src/canvas/editor-engine-events.js";
import { setLocale } from "../../src/shared/i18n.js";
import "../../src/index.css";

let nodes = [];
const engine = {
  getSelectedIds: () => nodes.map((node) => node.id),
  getNode: (id) => nodes.find((node) => node.id === id),
};
window.__vooEditors = { "suggestion-page": engine };
setEditorEngineReady(engine, true);
setLocale("zh");
useDesignStore.setState({
  welcomeOpen: false,
  activeDocumentId: "suggestion-document",
  editingNodeId: "suggestion-page",
});
window.selectSuggestionFixture = (kinds) => {
  nodes = kinds.map((kind, index) => ({
    id: `object-${index}`,
    kind,
    name: `Object ${index + 1}`,
  }));
  window.dispatchEvent(new CustomEvent(EDITOR_ENGINE_CHANGE_EVENT));
};
createRoot(document.getElementById("root")).render(
  <CanvasAgentPanel onClose={() => {}} />,
);
