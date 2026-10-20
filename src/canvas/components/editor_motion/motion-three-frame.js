/** Shared offscreen Three renderer for Remotion and browser capture. */
import * as THREE from "three";
import { getScene3d } from "../../editor/canvas-composition-model.js";
import {
  editorPointToWorld,
  getNodeWorldTransform,
  projectSceneToXY,
} from "../../editor/three-scene-model.js";
import { createSceneObject } from "../../editor/three-scene-objects.js";
import {
  createStudioEnvironment,
  getAssignedMaterialAsset,
} from "../../editor/three-scene-material-renderer.js";
import {
  applyThreeSceneVisualSettings,
  disposeThreeSceneVisualSettings,
} from "../../editor/three-scene-visual-runtime.js";
import { createSceneEffectsController } from "../../editor/three-scene-effects-runtime.js";

export function applyFrameSceneAppearance({
  scene,
  renderer,
  directional,
  settings,
}) {
  applyThreeSceneVisualSettings({
    THREE,
    scene,
    renderer,
    directional,
    settings,
  });
}

function makeCamera(settings, doc) {
  const aspect = doc.width / doc.height;
  let camera;
  if (settings.camera.projection === "perspective") {
    camera = new THREE.PerspectiveCamera(
      settings.camera.fov,
      aspect,
      0.1,
      100000,
    );
  } else {
    const extent = Math.max(doc.height, doc.width / aspect) * 0.6;
    camera = new THREE.OrthographicCamera(
      -extent * aspect,
      extent * aspect,
      extent,
      -extent,
      0.1,
      100000,
    );
  }
  const position = editorPointToWorld(settings.camera.position, doc);
  const target = editorPointToWorld(settings.camera.target, doc);
  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(target.x, target.y, target.z);
  camera.zoom = settings.camera.zoom;
  camera.updateProjectionMatrix();
  return camera;
}

function applyTransform(object, node, doc) {
  const transform = getNodeWorldTransform(node, doc);
  object.position.set(
    transform.position.x,
    transform.position.y,
    transform.position.z,
  );
  object.rotation.set(
    THREE.MathUtils.degToRad(transform.rotation.x),
    THREE.MathUtils.degToRad(transform.rotation.y),
    THREE.MathUtils.degToRad(transform.rotation.z),
  );
}

function objectSignature(node) {
  // Model appearance and transform are updated each frame. Keep the loaded
  // geometry while those properties animate on the shared timeline.
  const model =
    node.model && node.kind === "model3d"
      ? {
          ...node.model,
          rotation: undefined,
          scale: undefined,
          color: undefined,
          roughness: undefined,
          metalness: undefined,
        }
      : node.model;
  return JSON.stringify([
    node.kind,
    node.width,
    node.height,
    node.geometry,
    node.kind === "model3d" ? null : node.material,
    model,
    node.name,
    node.opacity,
    node.src,
  ]);
}

/** Session keeps model assets cached across browser-export frames. */
export function createThreeFrameSession(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const objects = new THREE.Group();
  const ambient = new THREE.AmbientLight(0xffffff);
  const directional = new THREE.DirectionalLight(0xffffff);
  scene.add(objects, ambient, directional);
  const records = new Map();
  let studioEnvironment = null;
  let disposed = false;
  let activeCamera = null;
  const effectsController = createSceneEffectsController({
    renderer,
    scene,
    getCamera: () => activeCamera,
  });

  function recordFor(node, key, materialAsset) {
    const signature = objectSignature(node);
    const current = records.get(key);
    if (current?.signature === signature) return current;
    current?.record.dispose();
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const record = createSceneObject(node, {
      resolveAsset: (sourceNode) => sourceNode.src,
      onReady: resolveReady,
      onError: (_id, error) => rejectReady(error),
      materialAsset,
    });
    if (!["image", "video", "model3d", "canvasInstance"].includes(node.kind))
      resolveReady();
    const entry = { signature, record, ready };
    records.set(key, entry);
    return entry;
  }

  return {
    async renderFrame(doc, nodes, signal, frameTime = 0) {
      if (disposed) throw new Error("3D renderer has been disposed");
      signal?.throwIfAborted();
      const sceneDoc = doc.canvasType === "3d" ? doc : projectSceneToXY(doc);
      const settings = getScene3d(sceneDoc);
      const contentRotation = settings.contentRotation ?? {};
      const radians = (value) =>
        THREE.MathUtils.degToRad(Number.isFinite(value) ? value : 0);
      objects.rotation.set(
        -radians(contentRotation.rotationX),
        radians(contentRotation.rotationY),
        -radians(contentRotation.rotationZ),
      );
      renderer.setSize(doc.width, doc.height, false);
      if (settings.environment.type === "studio") {
        studioEnvironment ??= createStudioEnvironment(THREE, renderer);
        scene.environment = studioEnvironment.texture;
        scene.environmentIntensity = settings.environment.intensity;
      } else {
        scene.environment = null;
      }
      ambient.intensity = settings.lighting.ambientIntensity;
      ambient.color.set(settings.lighting.ambientColor);
      directional.intensity = settings.lighting.directionalIntensity;
      directional.color.set(settings.lighting.directionalColor);
      const lightPosition = editorPointToWorld(
        settings.lighting.directionalPosition,
        sceneDoc,
      );
      directional.position.set(
        lightPosition.x,
        lightPosition.y,
        lightPosition.z,
      );
      objects.clear();
      const entries = nodes.map((node) => {
        const key = `${doc.canvasId ?? "root"}:${node.id}`;
        const materialAsset = getAssignedMaterialAsset(settings, node);
        const entry = recordFor(node, key, materialAsset);
        entry.record.update?.(node, materialAsset);
        applyTransform(entry.record.object, node, sceneDoc);
        objects.add(entry.record.object);
        return entry;
      });
      await Promise.all(entries.map((entry) => entry.ready));
      signal?.throwIfAborted();
      applyFrameSceneAppearance({ scene, renderer, directional, settings });
      // Force custom PBR uniforms through Three's material refresh path for
      // sessions that reuse one mesh and one shader program across frames.
      renderer.resetState();
      activeCamera = makeCamera(settings, sceneDoc);
      await effectsController.configure(settings.effects);
      effectsController.render(frameTime);
      return canvas;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of records.values()) entry.record.dispose();
      records.clear();
      disposeThreeSceneVisualSettings(scene);
      effectsController.dispose();
      studioEnvironment?.dispose();
      renderer.dispose();
    },
  };
}
