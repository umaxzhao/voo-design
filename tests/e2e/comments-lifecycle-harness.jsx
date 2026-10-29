import React from "react";
import { createRoot } from "react-dom/client";
import EditorComments from "../../src/canvas/components/editor_comments.jsx";

/** A second real facade can unmount while its cold module request is pending. */
export function mountCommentsLifecycleAudit() {
  const element = document.createElement("div");
  element.id = "comments-lifecycle-audit";
  Object.assign(element.style, { position: "fixed", left: "40px", top: "80px", width: "800px", height: "600px", zIndex: "99999", background: "#444444" });
  document.body.append(element);
  const root = createRoot(element);
  const api = { props: { open: true, addMode: true, comments: [] }, calls: [] };
  api.render = patch => {
    Object.assign(api.props, patch);
    root.render(<EditorComments {...api.props} t={key => key}
      onOpen={() => { api.calls.push("open"); api.render({ open: true }); }}
      onClose={() => { api.calls.push("close"); api.render({ open: false, addMode: false }); }}
      onToggleAddMode={() => { api.calls.push("mode"); api.render({ addMode: !api.props.addMode }); }} />);
  };
  api.close = () => { root.unmount(); element.remove(); };
  api.render();
  return api;
}
