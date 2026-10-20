/** Transparent 3D rendering, owned by one editor instance. */
import { applyModelMaterials } from "./model3d-material.js";
import { getModelAnimationMetadata } from "./preview-playback.js";
import { loadModel3d } from "./model3d-loader.js";

export function createModel3dRuntime(onChange, onError) {
  const entries = new Map();
  let renderer = null;
  let three = null;
  let disposed = false;

  function disposeModel(entry) {
    if (!entry?.gltf) return;
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const skeletons = new Set();
    const bitmaps = new Set();
    entry.gltf.scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.skeleton) skeletons.add(object.skeleton);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) {
          if (!value?.isTexture) continue;
          textures.add(value);
          if (typeof value.source?.data?.close === "function")
            bitmaps.add(value.source.data);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
    for (const bitmap of bitmaps) bitmap.close();
    entry.gltf = null;
  }

  async function load(entry) {
    try {
      const module = await import("three");
      three = module;
      const gltf = await loadModel3d(entry.src, entry.filename);
      entry.gltf = gltf;
      if (disposed || entries.get(entry.id) !== entry) {
        disposeModel(entry);
        return;
      }
      const box = new three.Box3().setFromObject(gltf.scene);
      entry.center = box.getCenter(new three.Vector3());
      entry.normalScale =
        1.6 / Math.max(0.001, ...box.getSize(new three.Vector3()).toArray());
      entry.originalMaterials = new Map();
      gltf.scene.traverse((object) => {
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if (material && !entry.originalMaterials.has(material)) {
            entry.originalMaterials.set(material, {
              color: material.color?.clone(),
              metalness: material.metalness,
              roughness: material.roughness,
            });
          }
        }
      });
      if (gltf.animations?.length) {
        entry.mixer = new three.AnimationMixer(gltf.scene);
        for (const clip of gltf.animations) entry.mixer.clipAction(clip).play();
      }
      entry.animationMetadata = getModelAnimationMetadata(gltf.animations);
      onChange();
    } catch (error) {
      if (disposed || entries.get(entry.id) !== entry) return;
      entry.error = error instanceof Error ? error : new Error(String(error));
      onError(entry.id, entry.error);
      onChange();
    }
  }

  function ensure(node) {
    if (!node.src) {
      onError(node.id, new Error("Model source is unavailable"));
      return Promise.resolve();
    }
    let entry = entries.get(node.id);
    if (entry?.src === node.src && entry.filename === node.name)
      return entry.promise;
    if (entry) disposeModel(entry);
    entry = {
      id: node.id,
      src: node.src,
      filename: node.name,
      gltf: null,
      error: null,
    };
    entries.set(node.id, entry);
    entry.promise = load(entry);
    return entry.promise;
  }

  function render(node, time = 0) {
    const entry = entries.get(node.id);
    if (!entry?.gltf || !three) return null;
    if (!renderer) {
      renderer = new three.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = three.ACESFilmicToneMapping;
    }
    const width = Math.max(1, Math.min(2048, Math.round(node.width)));
    const height = Math.max(1, Math.min(2048, Math.round(node.height)));
    renderer.setSize(width, height, false);
    renderer.toneMappingExposure = node.model?.exposure ?? 1;
    const scene = new three.Scene();
    if (node.model?.environment === "neutral") {
      scene.add(new three.HemisphereLight(0xffffff, 0xffffff, 1.8));
    } else {
      scene.add(new three.AmbientLight(0xffffff, 1.2));
      const light = new three.DirectionalLight(0xffffff, 2);
      light.position.set(2, 4, 3);
      scene.add(light);
    }
    const pivot = new three.Group();
    const centered = new three.Group();
    centered.position.copy(entry.center).multiplyScalar(-1);
    centered.add(entry.gltf.scene);
    pivot.add(centered);
    const rotation = node.model?.rotation ?? {};
    pivot.rotation.set(
      three.MathUtils.degToRad(rotation.x ?? 0),
      three.MathUtils.degToRad(rotation.y ?? 0),
      three.MathUtils.degToRad(rotation.z ?? 0),
    );
    pivot.scale.setScalar(entry.normalScale * (node.model?.scale ?? 1));
    scene.add(pivot);
    applyModelMaterials(entry.originalMaterials, node.model);
    entry.mixer?.setTime(Math.max(0, time - (node.timing?.start ?? 0)));
    const cameraSettings = node.model?.camera ?? {};
    const camera = new three.PerspectiveCamera(
      cameraSettings.fov ?? 45,
      width / height,
      0.01,
      100,
    );
    const azimuth = three.MathUtils.degToRad(cameraSettings.azimuth ?? 0);
    const elevation = three.MathUtils.degToRad(cameraSettings.elevation ?? 15);
    const distance = cameraSettings.distance ?? 3;
    camera.position.set(
      distance * Math.sin(azimuth) * Math.cos(elevation),
      distance * Math.sin(elevation),
      distance * Math.cos(azimuth) * Math.cos(elevation),
    );
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    scene.remove(pivot);
    centered.remove(entry.gltf.scene);
    return renderer.domElement;
  }

  function errorFor(id) {
    return entries.get(id)?.error ?? null;
  }
  function getPlaybackMetadata(id) {
    const entry = entries.get(id);
    if (!entry) return null;
    return {
      ready: Boolean(entry.gltf) && !entry.error,
      ...(entry.animationMetadata ?? { hasAnimation: false, duration: 0 }),
    };
  }
  function prune(ids) {
    for (const [id, entry] of entries) {
      if (ids.has(id)) continue;
      disposeModel(entry);
      entries.delete(id);
    }
  }
  function dispose() {
    disposed = true;
    prune(new Set());
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer = null;
  }
  return { ensure, render, errorFor, getPlaybackMetadata, prune, dispose };
}
