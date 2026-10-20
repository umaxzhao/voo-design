import { getCanvasType } from "./canvas-composition-model.js";
import { NODE_KIND } from "./scene_model.js";
import { detachInstance } from "./component_extract.js";
import { applyInstanceOverrides } from "./instance-overrides.js";
import { withInstanceCamera, withInstanceView } from "./instance-view.js";
import { evaluateSceneAtTime } from "./scene-motion.js";

let threeFrameSessionFactory = null;

export function configureRasterThreeFrameSession(factory) {
  if (typeof factory !== "function")
    throw new TypeError("EXPORT_3D_RENDERER_UNAVAILABLE");
  threeFrameSessionFactory = factory;
}

export function expandInstancesForRaster(
  doc,
  resolveCanvas,
  instanceBitmaps,
  scale,
  sourcePath = new Set(),
) {
  if (typeof resolveCanvas !== "function") return doc;
  const nodes = doc.nodes.flatMap((node) => {
    if (node.kind !== NODE_KIND.CANVAS_INSTANCE || node.visible === false)
      return [node];
    const sourceId = node.sourceCanvasId;
    if (sourcePath.has(sourceId)) throw new Error("EXPORT_COMPONENT_CYCLE");
    const source = resolveCanvas(sourceId);
    if (!source) throw new Error("EXPORT_COMPONENT_SOURCE_MISSING");
    if (getCanvasType(source) === "3d")
      throw new Error("EXPORT_ASYNC_REQUIRED");
    const detached = detachInstance(
      { ...doc, nodes: [node] },
      node.id,
      source,
    ).doc;
    return expandInstancesForRaster(
      detached,
      resolveCanvas,
      instanceBitmaps,
      scale,
      new Set([...sourcePath, sourceId]),
    ).nodes;
  });
  return { ...doc, nodes };
}

export async function expandInstancesForRasterAsync(
  doc,
  resolveCanvas,
  instanceBitmaps,
  scale,
  frameTime = 0,
  sourcePath = new Set(),
) {
  if (typeof resolveCanvas !== "function") return doc;
  const nodes = [];
  for (const node of doc.nodes) {
    if (node.kind !== NODE_KIND.CANVAS_INSTANCE || node.visible === false) {
      nodes.push(node);
      continue;
    }
    const sourceId = node.sourceCanvasId;
    if (sourcePath.has(sourceId)) throw new Error("EXPORT_COMPONENT_CYCLE");
    const source = resolveCanvas(sourceId);
    if (!source) throw new Error("EXPORT_COMPONENT_SOURCE_MISSING");
    if (getCanvasType(source) === "3d") {
      if (!threeFrameSessionFactory)
        throw new Error("EXPORT_3D_RENDERER_UNAVAILABLE");
      const canvas = document.createElement("canvas");
      // The renderer loads on demand; injected synchronous factories also work.
      const session = await threeFrameSessionFactory(canvas);
      try {
        const timedSource = evaluateSceneAtTime(source, frameTime);
        const overridden = applyInstanceOverrides(timedSource, node.instance);
        const rendered = withInstanceCamera(
          withInstanceView(overridden, node.instance),
          node.instance,
        );
        const frame = await session.renderFrame(
          rendered,
          rendered.nodes,
          undefined,
          frameTime,
        );
        const output = document.createElement("canvas");
        output.width = Math.max(1, Math.round(source.width * scale));
        output.height = Math.max(1, Math.round(source.height * scale));
        const context = output.getContext("2d");
        if (!context) throw new Error("EXPORT_3D_INSTANCE_CONTEXT_MISSING");
        context.drawImage(frame, 0, 0, output.width, output.height);
        instanceBitmaps.set(node.id, output);
      } finally {
        session.dispose();
      }
      nodes.push({
        ...node,
        kind: NODE_KIND.IMAGE,
        imageId: node.id,
        src: "",
      });
      continue;
    }
    const detached = detachInstance(
      { ...doc, nodes: [node] },
      node.id,
      source,
    ).doc;
    const expanded = await expandInstancesForRasterAsync(
      detached,
      resolveCanvas,
      instanceBitmaps,
      scale,
      frameTime,
      new Set([...sourcePath, sourceId]),
    );
    nodes.push(...expanded.nodes);
  }
  return { ...doc, nodes };
}
