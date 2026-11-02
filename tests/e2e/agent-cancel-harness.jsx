import React from "react";
import { createRoot } from "react-dom/client";
import Panel from "../../src/canvas/components/canvas_agent_panel.jsx";
import { useDesignStore } from "../../src/store/design_store.js";
import { setLocale } from "../../src/shared/i18n.js";

export async function mountCancelHarness() {
  await setLocale("en");
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:500;background:#242424;display:flex;justify-content:center";
  document.body.append(host);
  const panel = document.createElement("div");
  panel.style.cssText = "width:420px;height:760px;margin:20px";
  host.append(panel);
  window.agentState = () => useDesignStore.getState().agentGenerating;
  const root = createRoot(panel);
  root.render(<Panel onClose={() => root.unmount()} />);
}
