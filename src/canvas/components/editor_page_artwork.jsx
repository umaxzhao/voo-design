import React, { lazy, Suspense } from "react";
import PropTypes from "prop-types";
import EditorArtworkFallback from "./editor_artwork_fallback.jsx";
import { requiresWorkspaceCanvas2d } from "../editor/workspace-artwork-routing.js";
import { setInstanceCamera } from "../editor/instance-view.js";
const EditorMixedLayers = lazy(() => import("./editor_mixed_layers.jsx"));

/** Keep each renderer's DOM canvas ownership unchanged in full and free modes. */
export default function EditorPageArtwork({ page }) {
  const { free, doc, mixedLayers, engine, resolveCanvas, selected, tool,
    selectedInstanceChild, adjustingInstanceId, focused, onSelectInstanceChild,
    workspaceRendererReady, canvasRef, skiaCanvasRef, skiaPainting,
    skiaEnabled, skiaStatus } = page;
  return free ? (
    doc?.isCanvasRoot && !mixedLayers ? (
      <EditorArtworkFallback engine={engine} opacity={doc.opacity ?? 1} tool={tool}
        includeFrame={!workspaceRendererReady}
        paintArtwork={!workspaceRendererReady || requiresWorkspaceCanvas2d(doc)} />
    ) : doc && mixedLayers ? (
      <Suspense fallback={null}>
        <EditorMixedLayers
          doc={doc}
          engine={engine}
          resolveCanvas={resolveCanvas}
          selectedId={selected?.id ?? null}
          selectedInstanceChild={selectedInstanceChild}
          adjustingInstanceId={adjustingInstanceId}
          onInstanceCameraChange={(camera) => {
            const current = engine
              ?.getDocument()
              ?.nodes.find((node) => node.id === adjustingInstanceId);
            if (!current) return;
            const baseCamera =
              current.instance?.overrides?.camera ??
              resolveCanvas?.(current.sourceCanvasId)?.scene3d?.camera;
            if (!baseCamera)
              throw new Error("Instance camera source is unavailable");
            const instance = setInstanceCamera(current.instance, {
              ...baseCamera,
              ...camera,
            });
            engine.updateNode(current.id, { instance }, { commit: false });
          }}
          active={focused}
          onSelectInstanceChild={onSelectInstanceChild}
        />
      </Suspense>
    ) : doc && (!workspaceRendererReady || requiresWorkspaceCanvas2d(doc)) ? (
      <EditorArtworkFallback engine={engine} opacity={doc.opacity ?? 1} includeFrame={!workspaceRendererReady} />
    ) : null
  ) : (
    <>
      <canvas
        ref={canvasRef}
        data-testid="editor-2d-canvas"
        data-renderer-active={!skiaPainting ? "true" : "false"}
        className={`absolute left-0 top-0 ${mixedLayers ? "z-20" : ""} ${skiaPainting ? "invisible" : ""}`}
      />
      {skiaEnabled ? (
        <canvas
          ref={skiaCanvasRef}
          data-testid="skia-canvas"
          data-status={skiaStatus}
          data-renderer-active={skiaPainting ? "true" : "false"}
          className={`absolute left-0 top-0 ${skiaPainting ? "" : "invisible"}`}
        />
      ) : null}
      {doc && mixedLayers ? (
        <Suspense fallback={null}>
          <EditorMixedLayers
            doc={doc}
            engine={engine}
            resolveCanvas={resolveCanvas}
            selectedId={selected?.id ?? null}
            selectedInstanceChild={selectedInstanceChild}
            adjustingInstanceId={adjustingInstanceId}
            onInstanceCameraChange={(camera) => {
              const current = engine
                ?.getDocument()
                ?.nodes.find((node) => node.id === adjustingInstanceId);
              if (!current) return;
              const baseCamera =
                current.instance?.overrides?.camera ??
                resolveCanvas?.(current.sourceCanvasId)?.scene3d?.camera;
              if (!baseCamera)
                throw new Error("Instance camera source is unavailable");
              const instance = setInstanceCamera(current.instance, {
                ...baseCamera,
                ...camera,
              });
              engine.updateNode(current.id, { instance }, { commit: false });
            }}
            active={focused}
            onSelectInstanceChild={onSelectInstanceChild}
          />
        </Suspense>
      ) : null}
    </>
  );

}
EditorPageArtwork.propTypes = { page: PropTypes.object.isRequired };
