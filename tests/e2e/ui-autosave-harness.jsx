import React, { useRef } from "react";
import { createRoot } from "react-dom/client";
import { useEditorAutosave } from "../../src/canvas/components/editor_hooks/use_editor_autosave.js";
import { useDesignStore } from "../../src/store/design_store.js";

/** Mount the production hook and observe durable writes across preference changes. */
export function mountAutosaveAudit() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const originalPersist = useDesignStore.getState().saveEditorDrafts;
  const api = { saver: null, writes: [], errors: [], version: 0 };
  const doc = { width: 120, height: 80, nodes: [] };
  const engine = {
    isDirty: () => true,
    getDocument: () => doc,
    serialise: () => doc,
    getRegions: () => [],
    flushMasks: () => Promise.resolve(),
  };
  useDesignStore.setState({ saveEditorDrafts: async (entries) => api.writes.push(entries) });
  function Harness({ disabled }) {
    const enginesRef = useRef(new Map([["autosave-ui", { ready: true, engine }]]));
    const snapshotsRef = useRef(new Map());
    api.saver = useEditorAutosave({
      enginesRef, snapshotsRef, nodeIds: ["autosave-ui"], disabled,
      setApplyError: (error) => { if (error) api.errors.push(error); },
    });
    api.version += 1;
    return <span data-autosave-disabled={disabled} />;
  }
  api.render = (disabled) => root.render(<Harness disabled={disabled} />);
  api.close = () => {
    root.unmount();
    host.remove();
    useDesignStore.setState({ saveEditorDrafts: originalPersist });
  };
  api.render(true);
  return api;
}
