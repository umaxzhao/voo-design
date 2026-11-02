import React from "react";
import { createRoot } from "react-dom/client";
import CanvasAgentPanel from "../../src/canvas/components/canvas_agent_panel.jsx";

/** Match the app's React instance without depending on Vite cache paths. */
export function mountAgentCatalogPanel() {
  const host = document.createElement("div");
  host.id = "agent-catalog-test";
  Object.assign(host.style, {
    position: "fixed",
    inset: "20px 20px 20px auto",
    width: "380px",
    zIndex: "500",
  });
  document.body.append(host);
  createRoot(host).render(
    React.createElement(CanvasAgentPanel, { onClose() {} }),
  );
}
