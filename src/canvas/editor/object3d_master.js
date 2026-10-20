/**
 * A 3D object placed in a Design or Motion frame is an instance of a 3D frame,
 * the way a component instance points at its main component: the frame beside
 * it is where the object is edited, and every instance follows it.
 *
 * These are the pure builders for that pair; the editor shell decides where
 * the new frame goes and writes it into the workflow.
 */
import { CANVAS_TYPE, createDocument } from "./scene_doc_factory.js";
import {
  createCanvasInstanceNode,
  createMesh3dNode,
  setCanvasType,
} from "./canvas-composition-model.js";

const MASTER_MIN_EDGE = 512;
const MASTER_FILL = 0.8;
export const DEFAULT_OBJECT_EDGE = 240;

/** A new primitive at the box the user meant, before it becomes a frame. */
export function createObject3dNode(geometryType, box) {
  return createMesh3dNode({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    geometry: { type: geometryType },
  });
}

/**
 * The main 3D frame for an object: same object, centred at 80% of a frame at
 * least 512 wide, on a transparent scene so instances sit cleanly on the page.
 */
export function masterDocForObject(node) {
  if (node?.kind !== "mesh3d" && node?.kind !== "model3d") {
    throw new TypeError("Only 3D objects get a 3D frame");
  }
  const scale = Math.max(
    1,
    MASTER_MIN_EDGE / Math.max(node.width, node.height),
  );
  const width = Math.round(node.width * scale);
  const height = Math.round(node.height * scale);
  const inner = {
    ...node,
    width: width * MASTER_FILL,
    height: height * MASTER_FILL,
    x: (width * (1 - MASTER_FILL)) / 2,
    y: (height * (1 - MASTER_FILL)) / 2,
  };
  const frame = setCanvasType(
    createDocument(width, height, "transparent", {
      canvasType: CANVAS_TYPE.THREE_D,
    }),
    CANVAS_TYPE.THREE_D,
  );
  return { ...frame, nodes: [...frame.nodes, inner] };
}

/** The instance that stands in for the object in its host frame. */
export function instanceForObject(node, sourceCanvasId, name) {
  return createCanvasInstanceNode({
    id: node.id,
    sourceCanvasId,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    name,
  });
}
