/** Converts editable scene nodes into disposable Three.js objects. */
import * as THREE from "three";
import { loadModel3d } from "./model3d-loader.js";
import { drawEllipseNode, drawRectNode } from "./render_basic_shapes.js";
import { drawPathNode } from "./render_path_node.js";
import { drawPenNode } from "./render_pen_node.js";
import { drawBooleanNode } from "./render_boolean_node.js";
import { installLayeredMaterial } from "./three-scene-material-renderer.js";

const DEFAULT_FILL = "#999999";

function normalColor(value, fallback = DEFAULT_FILL) {
  return typeof value === "string" && value !== "transparent"
    ? value
    : fallback;
}

function createPlane(node) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: "#383838",
    transparent: true,
    opacity: node.opacity ?? 1,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(Math.max(1, node.width), Math.max(1, node.height), 1);
  return mesh;
}

function createShapeTexture(node) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.min(2048, Math.ceil(node.width)));
  canvas.height = Math.max(1, Math.min(2048, Math.ceil(node.height)));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context is unavailable");
  context.scale(canvas.width / node.width, canvas.height / node.height);
  context.translate(-node.x, -node.y);
  if (node.kind === "rect") drawRectNode(context, node);
  else if (node.kind === "ellipse") drawEllipseNode(context, node);
  else if (node.kind === "boolean") drawBooleanNode(context, node);
  else if (node.pen === true) drawPenNode(context, node);
  else drawPathNode(context, node);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTextTexture(node) {
  const width = Math.max(1, Math.min(2048, Math.ceil(node.width)));
  const height = Math.max(1, Math.min(2048, Math.ceil(node.height)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context is unavailable");
  const scaleX = width / Math.max(1, node.width);
  const scaleY = height / Math.max(1, node.height);
  context.scale(scaleX, scaleY);
  const fontSize = node.fontSize ?? 24;
  const fontFamily = node.fontFamily ?? "sans-serif";
  context.font = `${node.fontWeight ?? 400} ${fontSize}px ${fontFamily}`;
  context.textBaseline = "top";
  context.fillStyle = normalColor(node.fill, "#ffffff");
  const lineHeight = fontSize * (node.lineHeight ?? 1.2);
  String(node.text ?? "")
    .split("\n")
    .forEach((line, lineIndex) => {
      context.fillText(line, 0, lineIndex * lineHeight, node.width);
    });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

class HelixCurve extends THREE.Curve {
  constructor(radius = 0.35, height = 1, turns = 3) {
    super();
    this.radius = radius;
    this.height = height;
    this.turns = turns;
  }

  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const angle = 2 * Math.PI * this.turns * t;
    const x = this.radius * Math.cos(angle);
    const y = (t - 0.5) * this.height;
    const z = this.radius * Math.sin(angle);
    return optionalTarget.set(x, y, z);
  }
}

const PLANAR_GEOMETRY_TYPES = new Set([
  "plane",
  "ellipse",
  "triangle",
  "polygon",
  "star",
]);

function buildPrimitiveGeometry(node) {
  const geom = node.geometry ?? {};
  const kind = geom.type ?? "box";
  const minDim = Math.max(1, Math.min(node.width, node.height));

  switch (kind) {
    case "sphere": {
      const radial = geom.radialSegments ?? 32;
      return new THREE.SphereGeometry(
        0.5,
        radial,
        Math.max(16, Math.round(radial * 0.75)),
      );
    }
    case "cylinder": {
      const radial = geom.radialSegments ?? 32;
      return new THREE.CylinderGeometry(0.5, 0.5, 1, radial);
    }
    case "cone": {
      const radial = geom.radialSegments ?? 32;
      return new THREE.ConeGeometry(0.5, 1, radial);
    }
    case "pyramid": {
      const cone = new THREE.ConeGeometry(0.5, 1, 4);
      cone.rotateY(Math.PI / 4);
      return cone;
    }
    case "torus": {
      const tubeRadius = Math.max(0.01, (geom.tubeRadius ?? 16) / minDim);
      const radial = geom.radialSegments ?? 16;
      const tubular = geom.tubularSegments ?? 48;
      return new THREE.TorusGeometry(0.35, tubeRadius, radial, tubular);
    }
    case "helix": {
      const turns = geom.turns ?? 3;
      const tubeRadius = Math.max(
        0.01,
        (geom.tubeRadius ?? 6) / minDim,
      );
      const radial = geom.radialSegments ?? 8;
      const tubular = Math.max(32, Math.min(256, turns * 24));
      const pitch = geom.pitch ?? 25;
      const rise = (pitch * turns) / Math.max(1, node.height);
      const curve = new HelixCurve(0.35, rise, turns);
      return new THREE.TubeGeometry(curve, tubular, tubeRadius, radial, false);
    }
    case "torusKnot": {
      const p = geom.p ?? 2;
      const q = geom.q ?? 3;
      const tubeRadius = Math.max(0.01, (geom.tubeRadius ?? 12) / minDim);
      const tubular = geom.tubularSegments ?? 64;
      const radial = geom.radialSegments ?? 8;
      return new THREE.TorusKnotGeometry(
        0.35,
        tubeRadius,
        tubular,
        radial,
        p,
        q,
      );
    }
    case "icosahedron": {
      const detail = geom.detail ?? 0;
      return new THREE.IcosahedronGeometry(0.5, detail);
    }
    case "dodecahedron": {
      const detail = geom.detail ?? 0;
      return new THREE.DodecahedronGeometry(0.5, detail);
    }
    case "plane": {
      return new THREE.PlaneGeometry(1, 1);
    }
    case "ellipse": {
      const shape = new THREE.Shape();
      shape.absellipse(0, 0, 0.5, 0.5, 0, Math.PI * 2, false, 0);
      return new THREE.ShapeGeometry(shape, 32);
    }
    case "triangle": {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.5);
      shape.lineTo(0.5, -0.5);
      shape.lineTo(-0.5, -0.5);
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    }
    case "polygon": {
      const sides = Math.max(3, geom.sides ?? 5);
      const shape = new THREE.Shape();
      for (let i = 0; i < sides; i++) {
        const angle = Math.PI / 2 + (i * 2 * Math.PI) / sides;
        const x = 0.5 * Math.cos(angle);
        const y = 0.5 * Math.sin(angle);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    }
    case "star": {
      const points = Math.max(3, geom.points ?? 5);
      const innerRatio = Math.max(0.1, Math.min(0.9, geom.innerRatio ?? 0.5));
      const shape = new THREE.Shape();
      const count = points * 2;
      for (let i = 0; i < count; i++) {
        const r = i % 2 === 0 ? 0.5 : 0.5 * innerRatio;
        const angle = Math.PI / 2 + (i * Math.PI) / points;
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    }
    case "box":
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function createPrimitive(node) {
  const kind = node.geometry?.type ?? "box";
  const depth = Math.max(
    1,
    node.geometry?.depth ?? Math.min(node.width, node.height),
  );
  const geometry = buildPrimitiveGeometry(node);
  const material = new THREE.MeshStandardMaterial({
    color: normalColor(node.material?.color ?? node.fill),
    metalness: node.material?.metalness ?? 0,
    roughness: node.material?.roughness ?? 0.8,
    side: THREE.DoubleSide,
    transparent: (node.opacity ?? 1) < 1,
    opacity: node.opacity ?? 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(
    Math.max(1, node.width),
    Math.max(1, node.height),
    PLANAR_GEOMETRY_TYPES.has(kind) ? 1 : depth,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function disposeTree(root, extraMaterials = []) {
  const geometries = new Set();
  const materials = new Set(extraMaterials);
  const textures = new Set();
  const bitmaps = new Set();
  const skeletons = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (material) materials.add(material);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value?.isTexture) textures.add(value);
    }
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    texture.dispose();
    if (typeof texture.source?.data?.close === "function")
      bitmaps.add(texture.source.data);
  }
  for (const bitmap of bitmaps) bitmap.close();
  for (const skeleton of skeletons) skeleton.dispose();
}

function createLayeredBaseMaterial(source) {
  if (source.isMeshStandardMaterial) return source.clone();
  // OBJ/unlit materials have no Standard shader to patch. Preserve their
  // visible color and maps when promoting only the layered copy to PBR.
  return new THREE.MeshStandardMaterial({
    color: source.color?.clone() ?? new THREE.Color("#ffffff"),
    map: source.map ?? null,
    normalMap: source.normalMap ?? null,
    bumpMap: source.bumpMap ?? null,
    alphaMap: source.alphaMap ?? null,
    emissive: source.emissive?.clone() ?? new THREE.Color("#000000"),
    emissiveMap: source.emissiveMap ?? null,
    metalness: Number.isFinite(source.metalness) ? source.metalness : 0,
    roughness: Number.isFinite(source.roughness) ? source.roughness : 0.8,
    opacity: source.opacity,
    transparent: source.transparent,
    alphaTest: source.alphaTest,
    side: source.side,
    vertexColors: source.vertexColors,
    depthWrite: source.depthWrite,
  });
}

function fitModel(model, node, bounds) {
  if (!bounds || bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const widthScale = Math.max(1, node.width) / Math.max(0.001, size.x);
  const heightScale = Math.max(1, node.height) / Math.max(0.001, size.y);
  const scale = Math.min(widthScale, heightScale);
  model.position.copy(
    bounds.getCenter(new THREE.Vector3()).multiplyScalar(-scale),
  );
  model.scale.setScalar(scale);
}

/** Asset loads are owned by the returned record and ignored after disposal. */
export function createSceneObject(
  node,
  { resolveAsset, onReady, onError, materialAsset = null } = {},
) {
  const object = new THREE.Group();
  object.userData.nodeId = node.id;
  let disposed = false;
  let video = null;
  let mixer = null;
  let modelScene = null;
  let modelBounds = null;
  let latestNode = node;
  let lastModelShape = null;
  let lastModelStyle = null;
  const materialDefaults = new WeakMap();
  const materialSources = new WeakMap();
  const originalMaterials = new Set();
  const layeredParts = new Map();
  let latestMaterialAsset = materialAsset;

  function applyMaterialAsset(part, asset) {
    if (!part.isMesh || !part.material) return;
    let state = layeredParts.get(part);
    if (!asset) {
      if (!state) return;
      part.material = state.sourceIsArray ? state.sources : state.sources[0];
      for (const material of state.layered) material?.dispose();
      layeredParts.delete(part);
      return;
    }
    if (!state) {
      const sourceIsArray = Array.isArray(part.material);
      const sources = sourceIsArray ? part.material : [part.material];
      const layered = [];
      const controllers = [];
      try {
        for (const source of sources) {
          if (!source) {
            layered.push(null);
            controllers.push(null);
            continue;
          }
          const material = createLayeredBaseMaterial(source);
          layered.push(material);
          if (part.geometry && !part.geometry.boundingBox)
            part.geometry.computeBoundingBox();
          controllers.push(
            installLayeredMaterial(
              THREE,
              material,
              asset,
              part.geometry?.boundingBox,
            ),
          );
          materialSources.set(material, source);
          originalMaterials.add(source);
        }
      } catch (error) {
        for (const material of layered) material?.dispose();
        throw error;
      }
      state = { sourceIsArray, sources, layered, controllers };
      layeredParts.set(part, state);
      part.material = sourceIsArray ? layered : layered[0];
      return;
    }
    if (part.geometry && !part.geometry.boundingBox)
      part.geometry.computeBoundingBox();
    for (const controller of state.controllers) {
      controller?.update(asset, part.geometry?.boundingBox);
    }
  }

  function update(nextNode, nextMaterialAsset = latestMaterialAsset) {
    latestNode = nextNode;
    latestMaterialAsset = nextMaterialAsset;
    if (nextNode.kind === "mesh3d")
      applyMaterialAsset(visual, nextMaterialAsset);
    if (nextNode.kind !== "model3d") return;
    object.scale.setScalar(nextNode.model?.scale ?? 1);
    if (!modelScene) return;
    modelScene.traverse((part) => applyMaterialAsset(part, nextMaterialAsset));
    const shape = `${nextNode.width}:${nextNode.height}`;
    if (shape !== lastModelShape) {
      fitModel(modelScene, nextNode, modelBounds);
      lastModelShape = shape;
    }
    const style = JSON.stringify([
      nextNode.model?.color,
      nextNode.model?.metalness,
      nextNode.model?.roughness,
    ]);
    if (style === lastModelStyle) return;
    lastModelStyle = style;
    modelScene.traverse((part) => {
      for (const material of Array.isArray(part.material)
        ? part.material
        : [part.material]) {
        if (!material) continue;
        const source = materialSources.get(material) ?? material;
        if (!materialDefaults.has(source)) {
          materialDefaults.set(source, {
            color: source.color?.clone(),
            metalness: source.metalness,
            roughness: source.roughness,
          });
        }
        const original = materialDefaults.get(source);
        for (const target of source === material
          ? [source]
          : [source, material]) {
          if (target.color && original.color)
            target.color.set(nextNode.model?.color ?? original.color);
          if ("metalness" in target)
            target.metalness = nextNode.model?.metalness ?? original.metalness;
          if ("roughness" in target)
            target.roughness = nextNode.model?.roughness ?? original.roughness;
        }
      }
    });
  }
  const needsAsset = ["image", "video", "model3d", "canvasInstance"].includes(
    node.kind,
  );
  const visual =
    node.kind === "mesh3d" ? createPrimitive(node) : createPlane(node);
  object.add(visual);

  if (node.kind === "text") {
    const texture = createTextTexture(node);
    visual.material.color.set("#ffffff");
    visual.material.transparent = true;
    visual.material.map = texture;
    visual.material.needsUpdate = true;
  }
  if (["rect", "ellipse", "path", "boolean"].includes(node.kind)) {
    const texture = createShapeTexture(node);
    visual.material.color.set("#ffffff");
    visual.material.map = texture;
    visual.material.needsUpdate = true;
  }

  if (needsAsset) {
    void Promise.resolve(resolveAsset?.(node) ?? node.src)
      .then(async (source) => {
        if (!source || disposed) return;
        if (node.kind === "model3d") {
          const gltf = await loadModel3d(source, node.name ?? "");
          if (disposed) {
            disposeTree(gltf.scene);
            return;
          }
          modelScene = gltf.scene;
          modelBounds = new THREE.Box3().setFromObject(modelScene);
          if (gltf.animations?.length) {
            mixer = new THREE.AnimationMixer(gltf.scene);
            for (const clip of gltf.animations) mixer.clipAction(clip).play();
          }
          try {
            update(latestNode, latestMaterialAsset);
          } catch (error) {
            mixer?.stopAllAction();
            mixer = null;
            disposeTree(gltf.scene, originalMaterials);
            originalMaterials.clear();
            layeredParts.clear();
            modelScene = null;
            modelBounds = null;
            throw error;
          }
          object.remove(visual);
          disposeTree(visual);
          object.add(gltf.scene);
          onReady?.();
          return;
        }
        let texture;
        if (node.kind === "video") {
          video = document.createElement("video");
          video.crossOrigin = "anonymous";
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.src = source;
          texture = new THREE.VideoTexture(video);
          await video.play();
        } else {
          texture = await new THREE.TextureLoader().loadAsync(source);
          texture.colorSpace = THREE.SRGBColorSpace;
        }
        if (disposed) {
          texture.dispose();
          return;
        }
        visual.material.color.set("#ffffff");
        visual.material.map = texture;
        visual.material.transparent = true;
        visual.material.needsUpdate = true;
        onReady?.();
      })
      .catch((error) => {
        if (!disposed) onError?.(node.id, error);
      });
  }

  return {
    object,
    update,
    advance(delta) {
      mixer?.update(delta);
    },
    dispose() {
      disposed = true;
      mixer?.stopAllAction();
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      disposeTree(object, originalMaterials);
      layeredParts.clear();
    },
  };
}
