import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useDesignStore } from "../../src/store/design_store.js";
import { useEditorRaster } from "../../src/canvas/components/editor_hooks/use_editor_raster.js";

/** Mount the real Hook against the live engine and the real candidate store sink. */
export function mountRasterHarness({ engine = window.__vooEditor, pendingObjectStroke = null } = {}) {
  window.__rasterHarnessRoot?.unmount();
  document.getElementById("raster-action-harness")?.remove();
  const host = document.createElement("div");
  host.id = "raster-action-harness";
  Object.assign(host.style, { position: "fixed", top: "150px", left: "350px", zIndex: "1000", background: "#171717", padding: "12px" });
  document.body.append(host);
  const trace = { outputs: [], materialized: [], sourceWorkflowNodeId: useDesignStore.getState().editingNodeId };
  const options = { engine, pendingObjectStroke };
  function Harness() {
    const [, refresh] = useState(0);
    useEffect(() => options.engine.subscribeRender(() => refresh(value => value + 1)), [options.engine]);
    trace.refresh = () => refresh(value => value + 1);
    const raster = useEditorRaster({
      engine: options.engine, selected: options.engine.getSelected(), lasso: null,
      pendingObjectStroke: options.pendingObjectStroke,
      sourceWorkflowNodeId: trace.sourceWorkflowNodeId,
      onMaterializeGeneratedOutput: async result => {
        const materialized = await useDesignStore.getState().materializeEditorGeneratedOutput({ result });
        trace.outputs.push(result);
        trace.materialized.push(materialized);
        return materialized;
      },
    });
    trace.raster = raster;
    return React.createElement("div", { "data-raster-state": JSON.stringify({ maskBusy: raster.maskBusy,
      lassoBusy: raster.lassoBusy, retouchBusy: raster.retouchBusy, maskError: raster.maskError,
      retouchError: raster.retouchError, retouchErrorSeq: raster.retouchErrorSeq }) },
    React.createElement("button", { onClick: () => { trace.lastAction = raster.removeBackground(); } }, "Mask"),
    React.createElement("button", { onClick: () => { trace.lastAction = raster.retouchImage({ skinBrighten: 25 }); } }, "Retouch"),
    React.createElement("button", { onClick: () => raster.cancelAiGeneration() }, "Cancel"));
  }
  trace.setProps = next => { Object.assign(options, next); trace.refresh(); };
  window.__rasterTrace = trace;
  window.__rasterHarnessRoot = createRoot(host);
  window.__rasterHarnessRoot.render(React.createElement(Harness));
}
