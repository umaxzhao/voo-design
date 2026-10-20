/** Rendering helpers shared by the live 3D viewport. */
import * as THREE from "three";
import {
  editorPointToWorld,
  getNodeWorldTransform,
} from "./three-scene-model.js";

export function renderKey(node, assetKey) {
  return JSON.stringify([
    node.kind,
    node.kind === "model3d" ? null : node.width,
    node.kind === "model3d" ? null : node.height,
    node.fill,
    node.fillOpacity,
    node.stroke,
    node.strokeWidth,
    node.strokeOpacity,
    node.cornerRadius,
    node.gradient,
    node.points,
    node.sources,
    node.pen,
    node.poly,
    node.text,
    node.fontSize,
    node.fontFamily,
    node.fontWeight,
    node.lineHeight,
    node.geometry,
    node.material,
    node.kind === "model3d" ? null : node.model,
    node.name,
    node.opacity,
    node.src,
    node.imageId,
    node.sourceCanvasId,
    assetKey,
  ]);
}

/** Render one export-sized frame, then restore the interactive viewport. */
export function captureRendererAtSize({
  renderer,
  effectsController,
  camera,
  width,
  height,
  updateCamera,
  render,
  readFrame,
}) {
  const viewportSize = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();
  const projection = {
    aspect: camera.aspect,
    left: camera.left,
    right: camera.right,
    top: camera.top,
    bottom: camera.bottom,
  };
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    effectsController.resize(width, height);
    updateCamera(width, height);
    render();
    return readFrame();
  } finally {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(viewportSize.x, viewportSize.y, false);
    effectsController.resize(viewportSize.x, viewportSize.y);
    camera.aspect = projection.aspect;
    if (camera.isOrthographicCamera) {
      camera.left = projection.left;
      camera.right = projection.right;
      camera.top = projection.top;
      camera.bottom = projection.bottom;
    }
    camera.updateProjectionMatrix();
    render();
  }
}

export function makeCamera(settings, doc, aspect) {
  if (settings.projection === "perspective") {
    return new THREE.PerspectiveCamera(settings.fov, aspect, 0.1, 100000);
  }
  const extent = Math.max(doc.height, doc.width / aspect) * 0.6;
  return new THREE.OrthographicCamera(
    -extent * aspect,
    extent * aspect,
    extent,
    -extent,
    0.1,
    100000,
  );
}

export function setCameraPosition(camera, settings, doc) {
  const position = editorPointToWorld(settings.position, doc);
  const target = editorPointToWorld(settings.target, doc);
  camera.position.set(position.x, position.y, position.z);
  camera.zoom = settings.zoom;
  camera.updateProjectionMatrix();
  return new THREE.Vector3(target.x, target.y, target.z);
}

export function captureCameraState(camera, controls) {
  return {
    position: camera.position.clone(),
    target: controls.target.clone(),
    zoom: camera.zoom,
  };
}

export function hasCameraMoved(started, camera, controls) {
  return (
    !started ||
    started.position.distanceToSquared(camera.position) >= 1e-10 ||
    started.target.distanceToSquared(controls.target) >= 1e-10 ||
    Math.abs(started.zoom - camera.zoom) >= 1e-10
  );
}

export function applyTransform(object, node, doc, layerIndex) {
  const transform = getNodeWorldTransform(node, doc);
  const isPlane = node.kind !== "mesh3d" && node.kind !== "model3d";
  object.position.set(
    transform.position.x,
    transform.position.y,
    transform.position.z + (isPlane ? layerIndex * 0.01 : 0),
  );
  object.rotation.set(
    THREE.MathUtils.degToRad(transform.rotation.x),
    THREE.MathUtils.degToRad(transform.rotation.y),
    THREE.MathUtils.degToRad(transform.rotation.z),
  );
}
