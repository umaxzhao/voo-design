/** Runtime scripts embedded into standalone web exports. */
import {
  createStudioEnvironment,
  installLayeredMaterial,
} from "./three-scene-material-renderer.js";
import {
  cubicBezierProgress,
  easingProgress,
  evaluateTrack,
  parseCubicBezier,
} from "./scene-motion.js";

export function fitWebShadowCamera(THREE, light, bounds) {
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const extent = Math.max(1, sphere.radius + sphere.center.length());
  const distance = light.position.length();
  const camera = light.shadow.camera;
  camera.left = -extent;
  camera.right = extent;
  camera.top = extent;
  camera.bottom = -extent;
  camera.near = Math.max(0.1, distance - extent);
  camera.far = distance + extent;
  camera.updateProjectionMatrix();
  light.shadow.normalBias = (2 * extent) / 1024;
  light.shadow.bias = -0.0005;
}

export function resizeWebOrthographicCamera(camera, config, width, height) {
  if (!camera?.isOrthographicCamera) return;
  const aspect = width / height;
  const extent = config.frame?.autoZoom === false
    ? Math.max(config.height / 2, Number.EPSILON)
    : Math.max(config.height, config.width / aspect) * 0.6;
  camera.left = -extent * aspect;
  camera.right = extent * aspect;
  camera.top = extent;
  camera.bottom = -extent;
  camera.zoom = config.camera.zoom;
  camera.updateProjectionMatrix();
}

export function gradeWebMaterial(material, saturation) {
  if (!material?.isMaterial) return;
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    previousCompile?.call(this, shader, renderer);
    const anchor = "#include <tonemapping_fragment>";
    if (!shader.fragmentShader.includes(anchor)) return;
    shader.uniforms.uVooSceneSaturation = { value: saturation };
    shader.fragmentShader = `uniform float uVooSceneSaturation;\n${shader.fragmentShader}`.replace(
      anchor,
      `float vooSceneLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));\noutgoingLight = mix(vec3(vooSceneLuminance), outgoingLight, uVooSceneSaturation);\n${anchor}`,
    );
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|voo-scene-grade`;
  material.needsUpdate = true;
}

/** Embed the same evaluator used by the editor and Remotion in standalone HTML. */
export const WEB_SAMPLE_RUNTIME = `
const parseCubicBezier = ${parseCubicBezier.toString()};
const cubicBezierProgress = ${cubicBezierProgress.toString()};
const easingProgress = ${easingProgress.toString()};
const sample = ${evaluateTrack.toString()};`;

export const VIDEO_RUNTIME = `<script>
const vooSoundLabel = "__AUDIO_LABEL__";
const vooSourceTime = (node, clock) => {
  const clipStart = Number(node.dataset.vooStart) || 0;
  const inPoint = Number(node.dataset.vooIn) || 0;
  const speed = Number(node.dataset.vooSpeed) || 1;
  return inPoint + Math.max(0, clock - clipStart) * speed;
};
for (const media of document.querySelectorAll("video[data-voo-in], audio[data-voo-in]")) {
  const inPoint = Number(media.dataset.vooIn) || 0;
  const outPoint = Number(media.dataset.vooOut);
  const level = Number(media.dataset.vooVolume);
  const fadeIn = Number(media.dataset.vooFadeIn) || 0;
  const fadeOut = Number(media.dataset.vooFadeOut) || 0;
  const shape = () => {
    if (!(Number.isFinite(level) || fadeIn > 0 || fadeOut > 0)) return;
    const finish = Number.isFinite(outPoint) ? outPoint : (media.duration || Infinity);
    const at = media.currentTime;
    let gain = 1;
    if (fadeIn > 0 && at < inPoint + fadeIn) gain = (at - inPoint) / fadeIn;
    if (fadeOut > 0 && at > finish - fadeOut) gain = Math.min(gain, (finish - at) / fadeOut);
    media.volume = Math.max(0, Math.min(1, (Number.isFinite(level) ? level : 1) * Math.max(0, Math.min(1, gain))));
  };
  media.addEventListener("loadedmetadata", () => {
    media.currentTime = Math.min(inPoint, media.duration || inPoint);
    media.playbackRate = Number(media.dataset.vooSpeed) || 1;
    shape();
  });
  media.addEventListener("timeupdate", () => {
    shape();
    if (Number.isFinite(outPoint) && media.currentTime >= outPoint) media.pause();
  });
  shape();
}
// Sound waits for a gesture in most browsers, so the page carries one control:
// a speaker that starts every track in step with the timeline and mutes it
// again. It is built only when the page actually has sound to offer.
(function () {
  const tracks = Array.from(document.querySelectorAll("audio[data-voo-in]"));
  if (!tracks.length) return;
  const root = document.documentElement;
  const duration = Number(root.dataset.vooDuration) || 0;
  const loop = root.dataset.vooLoop === "true";
  const clock = () => {
    const seconds = ((document.timeline && document.timeline.currentTime) || 0) / 1000;
    if (!(duration > 0)) return seconds;
    return loop ? seconds % duration : Math.min(seconds, duration);
  };
  const expected = (audio) => vooSourceTime(audio, clock());
  const inside = (audio) => {
    const at = expected(audio);
    const outPoint = Number(audio.dataset.vooOut);
    return (
      at >= (Number(audio.dataset.vooIn) || 0) &&
      (!Number.isFinite(outPoint) || at < outPoint)
    );
  };
  const ON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/></svg>';
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", vooSoundLabel);
  button.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:0;border-radius:999px;background:rgba(17,17,17,0.55);color:#f5f5f5;cursor:pointer";
  document.body.appendChild(button);
  let on = false;
  const paint = () => {
    button.innerHTML = on ? ON : OFF;
    button.setAttribute("aria-pressed", on ? "true" : "false");
  };
  const ready = (audio) =>
    audio.readyState >= 1
      ? Promise.resolve()
      : new Promise((done) => audio.addEventListener("loadedmetadata", done, { once: true }));
  const mute = () => {
    for (const audio of tracks) {
      audio.pause();
      audio.muted = true;
    }
    on = false;
    paint();
  };
  const start = () =>
    Promise.all(tracks.map(ready)).then(() => {
      const audible = tracks.filter((audio) => {
        if (!inside(audio)) {
          audio.pause();
          audio.muted = true;
          return false;
        }
        // The author's mute lives in the data channel: the toggle clears the
        // browser attribute it starts the tracks with, but a layer the
        // artwork marks muted never becomes audible.
        audio.muted = audio.dataset.vooMuted === "true";
        audio.currentTime = expected(audio);
        return true;
      });
      if (!audible.length) {
        on = false;
        paint();
        return;
      }
      // A rejection here is the browser's autoplay gate; the button stays on
      // the muted icon until someone presses it.
      Promise.all(audible.map((audio) => audio.play().then(() => true, () => false))).then(
        (started) => {
          on = started.every(Boolean);
          paint();
        },
      );
    });
  button.addEventListener("click", () => (on ? mute() : start()));
  for (const audio of tracks) {
    audio.addEventListener("timeupdate", () => {
      if (!on) return;
      const target = expected(audio);
      // The clock wraps under a loop and can outrun a stalled element; put the
      // track back on the timeline rather than letting it drift.
      if (Math.abs(audio.currentTime - target) > 0.5) audio.currentTime = target;
      if (!inside(audio)) audio.pause();
    });
  }
  paint();
  start();
})();
</script>`;

export const THREE_RUNTIME = `<script type="module">
const scenes = __SCENES__;
  const threeUrl = __THREE_URL__;
const HAS_EFFECTS = __HAS_EFFECTS__;
const loaderUrl = __LOADER_URL__;
const installLayeredMaterial = ${installLayeredMaterial.toString()};
const createStudioEnvironment = ${createStudioEnvironment.toString()};
const fitShadowCamera = ${fitWebShadowCamera.toString()};
const resizeOrthographicCamera = ${resizeWebOrthographicCamera.toString()};
const gradeWebMaterial = ${gradeWebMaterial.toString()};
${WEB_SAMPLE_RUNTIME}
function applySceneAppearance(THREE, scene, renderer, directional, config) {
  const backgroundColor = config.backgroundColor;
  const backgroundOpacity = Math.max(0, Math.min(1, config.backgroundOpacity ?? 1));
  const sky = config.sky || { enabled: false };
  const needsTexture = sky.enabled || (backgroundColor !== "transparent" && backgroundOpacity < 1);
  if (needsTexture) {
    const bytes = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    const top = bytes(sky.enabled ? sky.color : backgroundColor);
    const bottom = bytes(sky.enabled && sky.mode === "gradient" ? sky.horizonColor : sky.enabled ? sky.color : backgroundColor);
    const alpha = Math.round(backgroundOpacity * 255);
    const texture = new THREE.DataTexture(new Uint8Array([...bottom, alpha, ...top, alpha]), 1, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    scene.background = texture;
  } else {
    scene.background = backgroundColor === "transparent" ? null : new THREE.Color(backgroundColor);
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2 ** (config.colorGrading?.exposure || 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  directional.castShadow = config.shadows?.enabled !== false;
  directional.shadow.mapSize.set(1024, 1024);
  directional.shadow.intensity = config.shadows?.intensity ?? 0.5;
  directional.shadow.radius = (config.shadows?.softness ?? 0.5) * 8;
  scene.fog = config.fog?.enabled
    ? new THREE.Fog(config.fog.color, config.fog.near, config.fog.far)
    : null;
  const grade = (material) => gradeWebMaterial(
    material,
    config.colorGrading?.saturation ?? 1,
  );
  return grade;
}
try {
  const THREE = await import(threeUrl);
  const GLTFLoader = loaderUrl ? (await import(loaderUrl)).GLTFLoader : null;
  const effectPasses = __EFFECT_MODULES__;
  const radians = (degrees) => degrees * Math.PI / 180;
  for (const config of scenes) {
    const canvas = [...document.querySelectorAll("canvas[data-voo-scene]")].find((item) => item.dataset.vooScene === config.id);
    if (!canvas) continue;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    renderer.shadowMap.enabled = true;
    const studioEnvironment = config.environment?.type === "studio"
      ? createStudioEnvironment(THREE, renderer) : null;
    if (studioEnvironment) {
      scene.environment = studioEnvironment.texture;
      scene.environmentIntensity = config.environment.intensity;
    }
    const point = (x, y, z) => new THREE.Vector3(x - config.width / 2, config.height / 2 - y, z);
    const cameraConfig = config.camera;
    const camera = cameraConfig.projection === "perspective"
      ? new THREE.PerspectiveCamera(cameraConfig.fov, config.width / config.height, 0.1, 100000)
      : new THREE.OrthographicCamera(-config.width / 2, config.width / 2, config.height / 2, -config.height / 2, 0.1, 100000);
    camera.position.copy(point(cameraConfig.position.x, cameraConfig.position.y, cameraConfig.position.z));
    camera.lookAt(point(cameraConfig.target.x, cameraConfig.target.y, cameraConfig.target.z));
    if (camera.isOrthographicCamera) camera.zoom = cameraConfig.zoom;
    camera.updateProjectionMatrix();
    scene.add(new THREE.AmbientLight(config.lighting.ambientColor, config.lighting.ambientIntensity));
    const sunlight = new THREE.DirectionalLight(config.lighting.directionalColor, config.lighting.directionalIntensity);
    const lightPosition = config.lighting.directionalPosition;
    sunlight.position.copy(point(lightPosition.x, lightPosition.y, lightPosition.z));
    scene.add(sunlight);
    const gradeSceneMaterial = applySceneAppearance(THREE, scene, renderer, sunlight, config);
    const hasEffects = config.effects?.enabled && ["bloom", "vignette", "grain", "chromaticAberration"]
      .some((key) => config.effects[key]?.enabled);
    const entries = [];
    const mixers = [];
    const loader = GLTFLoader ? new GLTFLoader() : null;
    const materialAssets = new Map((config.materialAssets || []).map((asset) => [asset.id, asset]));
    for (const [index, node] of config.nodes.entries()) {
      const materialAsset = node.materialAssetId ? materialAssets.get(node.materialAssetId) : null;
      if (node.materialAssetId && !materialAsset) throw new Error("3D material asset is missing: " + node.materialAssetId);
      let geometry;
      if (node.kind === "mesh3d") {
        const geom = node.geometry || {};
        const gtype = geom.type || "box";
        const depth = Math.max(0.01, geom.depth ?? 80);
        if (gtype === "box") geometry = new THREE.BoxGeometry(node.width, node.height, depth);
        else if (gtype === "sphere") geometry = new THREE.SphereGeometry(1, geom.radialSegments || 32, Math.max(16, Math.round((geom.radialSegments || 32) * 0.75)));
        else if (gtype === "cylinder") geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, geom.radialSegments || 32);
        else if (gtype === "cone") geometry = new THREE.ConeGeometry(0.5, 1, geom.radialSegments || 32);
        else if (gtype === "pyramid") {
          const cone = new THREE.ConeGeometry(0.5, 1, 4);
          cone.rotateY(Math.PI / 4);
          geometry = cone;
        } else if (gtype === "torus") {
          const minDim = Math.max(1, Math.min(node.width, node.height));
          const tubeRadius = Math.max(0.01, (geom.tubeRadius ?? 16) / minDim);
          geometry = new THREE.TorusGeometry(0.35, tubeRadius, geom.radialSegments || 16, geom.tubularSegments || 48);
        } else if (gtype === "helix") {
          const turns = geom.turns ?? 3;
          const minDim = Math.max(1, Math.min(node.width, node.height));
          const tubeRadius = Math.max(0.01, (geom.tubeRadius ?? 6) / minDim);
          class HelixCurve extends THREE.Curve {
            constructor(r = 0.35, h = 1, t = 3) { super(); this.r = r; this.h = h; this.t = t; }
            getPoint(t, target = new THREE.Vector3()) {
              const a = 2 * Math.PI * this.t * t;
              return target.set(this.r * Math.cos(a), (t - 0.5) * this.h, this.r * Math.sin(a));
            }
          }
          const pitch = geom.pitch ?? 25;
          const rise = (pitch * turns) / Math.max(1, node.height);
          geometry = new THREE.TubeGeometry(new HelixCurve(0.35, rise, turns), Math.max(32, Math.min(256, turns * 24)), tubeRadius, geom.radialSegments || 8, false);
        } else if (gtype === "torusKnot") {
          const minDim = Math.max(1, Math.min(node.width, node.height));
          const tubeRadius = Math.max(0.01, (geom.tubeRadius ?? 12) / minDim);
          geometry = new THREE.TorusKnotGeometry(0.35, tubeRadius, geom.tubularSegments || 64, geom.radialSegments || 8, geom.p ?? 2, geom.q ?? 3);
        } else if (gtype === "icosahedron") geometry = new THREE.IcosahedronGeometry(0.5, geom.detail || 0);
        else if (gtype === "dodecahedron") geometry = new THREE.DodecahedronGeometry(0.5, geom.detail || 0);
        else if (gtype === "ellipse") {
          const shape = new THREE.Shape();
          shape.absellipse(0, 0, 0.5, 0.5, 0, Math.PI * 2, false, 0);
          geometry = new THREE.ShapeGeometry(shape, 32);
        } else if (gtype === "triangle") {
          const shape = new THREE.Shape();
          shape.moveTo(0, 0.5); shape.lineTo(0.5, -0.5); shape.lineTo(-0.5, -0.5); shape.closePath();
          geometry = new THREE.ShapeGeometry(shape);
        } else if (gtype === "polygon") {
          const sides = Math.max(3, geom.sides ?? 5);
          const shape = new THREE.Shape();
          for (let i = 0; i < sides; i++) {
            const a = Math.PI / 2 + (i * 2 * Math.PI) / sides;
            const px = 0.5 * Math.cos(a), py = 0.5 * Math.sin(a);
            if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
          }
          shape.closePath();
          geometry = new THREE.ShapeGeometry(shape);
        } else if (gtype === "star") {
          const points = Math.max(3, geom.points ?? 5);
          const innerRatio = Math.max(0.1, Math.min(0.9, geom.innerRatio ?? 0.5));
          const shape = new THREE.Shape();
          for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? 0.5 : 0.5 * innerRatio;
            const a = Math.PI / 2 + (i * Math.PI) / points;
            const px = r * Math.cos(a), py = r * Math.sin(a);
            if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
          }
          shape.closePath();
          geometry = new THREE.ShapeGeometry(shape);
        } else geometry = new THREE.PlaneGeometry(node.width, node.height);
      } else geometry = new THREE.PlaneGeometry(node.width, node.height);
      const color = node.material?.color || (node.kind === "rect" || node.kind === "ellipse" ? node.fill : "#d4d4d4");
      const material = new THREE.MeshStandardMaterial({ color: color === "transparent" ? "#ffffff" : color, metalness: node.material?.metalness || 0, roughness: node.material?.roughness ?? 0.8, transparent: true, opacity: node.opacity, side: THREE.DoubleSide });
      if (materialAsset && (node.kind === "mesh3d" || node.kind === "model3d")) {
        geometry.computeBoundingBox();
        installLayeredMaterial(THREE, material, materialAsset, geometry.boundingBox);
      }
      gradeSceneMaterial(material);
      const object = new THREE.Mesh(geometry, material);
      object.castShadow = true;
      object.receiveShadow = true;
      if (node.kind === "mesh3d") {
        const gtype = node.geometry?.type;
        if (gtype === "sphere") object.scale.set(node.width / 2, node.height / 2, Math.max(1, node.geometry.depth / 2));
        else if (["cylinder", "cone", "pyramid", "torus", "helix", "torusKnot", "icosahedron", "dodecahedron"].includes(gtype)) {
          object.scale.set(node.width, node.height, Math.max(0.01, node.geometry.depth ?? 80));
        } else if (["ellipse", "triangle", "polygon", "star"].includes(gtype)) {
          object.scale.set(node.width, node.height, 1);
        }
      }
      object.position.copy(point(node.x + node.width / 2, node.y + node.height / 2, node.z + index * 0.001));
      object.rotation.set(-radians(node.rotationX + (node.model?.rotation?.x || 0)), radians(node.rotationY + (node.model?.rotation?.y || 0)), -radians(node.rotationZ + (node.model?.rotation?.z || 0)));
      scene.add(object);
      const entry = { node, object };
      entries.push(entry);
      if (node.kind === "text" || node.kind === "ellipse") {
        const surface = document.createElement("canvas");
        surface.width = Math.min(2048, Math.max(1, Math.ceil(node.width)));
        surface.height = Math.min(2048, Math.max(1, Math.ceil(node.height)));
        const context = surface.getContext("2d");
        context.scale(surface.width / node.width, surface.height / node.height);
        if (node.kind === "ellipse") { context.fillStyle = node.fill; context.beginPath(); context.ellipse(node.width / 2, node.height / 2, node.width / 2, node.height / 2, 0, 0, Math.PI * 2); context.fill(); }
        else { context.fillStyle = node.fill; context.font = node.fontSize + "px sans-serif"; node.text.split("\\n").forEach((line, lineIndex) => context.fillText(line, 0, node.fontSize * (lineIndex + 1))); }
        material.color.set("#ffffff"); material.map = new THREE.CanvasTexture(surface); material.map.colorSpace = THREE.SRGBColorSpace; material.needsUpdate = true;
      }
      if (node.kind === "image" || node.kind === "canvasInstance") {
        if (node.source) new THREE.TextureLoader().load(node.source, (texture) => { texture.colorSpace = THREE.SRGBColorSpace; material.color.set("#ffffff"); material.map = texture; material.needsUpdate = true; });
      }
      if (node.kind === "video" && node.source) {
        const video = document.createElement("video");
        video.src = node.source; video.muted = true; video.loop = true; video.playsInline = true; video.crossOrigin = "anonymous";
        video.play().catch((error) => console.warn("Exported 3D video could not autoplay", error));
        material.color.set("#ffffff"); material.map = new THREE.VideoTexture(video); material.needsUpdate = true;
      }
      if (node.kind === "model3d" && node.source && loader) {
        loader.load(node.source, (gltf) => {
          const model = gltf.scene;
          model.traverse((part) => {
            if (part.isMesh) {
              part.castShadow = true;
              part.receiveShadow = true;
            }
          });
          const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
          const fit = Math.min(node.width / Math.max(size.x, 0.001), node.height / Math.max(size.y, 0.001));
          model.scale.setScalar(fit * node.model.scale); model.position.copy(center.multiplyScalar(-fit * node.model.scale));
          if (node.model.color) model.traverse((part) => { if (part.material?.color) part.material.color.set(node.model.color); });
          if (materialAsset) model.traverse((part) => {
            if (!part.isMesh || !part.material) return;
            if (part.geometry && !part.geometry.boundingBox) part.geometry.computeBoundingBox();
            const decorate = (source) => {
              if (!source) return null;
              // GLB unlit materials need a Standard shader before layered PBR hooks apply.
              const clone = source.isMeshStandardMaterial
                ? source.clone()
                : new THREE.MeshStandardMaterial({
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
              installLayeredMaterial(THREE, clone, materialAsset, part.geometry?.boundingBox);
              return clone;
            };
            part.material = Array.isArray(part.material)
              ? part.material.map(decorate)
              : decorate(part.material);
          });
          model.traverse((part) => {
            if (!part.isMesh) return;
            for (const current of Array.isArray(part.material) ? part.material : [part.material]) gradeSceneMaterial(current);
          });
          if (gltf.animations?.length) {
            const mixer = new THREE.AnimationMixer(model);
            for (const clip of gltf.animations) mixer.clipAction(clip).play();
            mixers.push(mixer);
          }
          object.visible = false; const group = new THREE.Group(); group.position.copy(object.position); group.rotation.copy(object.rotation); group.add(model); scene.add(group);
          entry.object = group;
          entry.modelFit = fit;
          entry.modelCenter = box.getCenter(new THREE.Vector3());
          entry.modelVisual = model;
        }, undefined, (error) => console.error("Exported 3D model could not load", error));
      }
    }
    let composer = null;
    let effectShader = null;
    if (hasEffects && effectPasses) {
      const [composerModule, renderModule, shaderModule, bloomModule, outputModule] = effectPasses;
      composer = new composerModule.EffectComposer(renderer);
      composer.addPass(new renderModule.RenderPass(scene, camera));
      if (config.effects.bloom?.enabled) {
        composer.addPass(new bloomModule.UnrealBloomPass(
          new THREE.Vector2(config.width, config.height),
          config.effects.bloom.strength, config.effects.bloom.radius,
          config.effects.bloom.threshold,
        ));
      }
      const shader = {
        uniforms: {
          tDiffuse: { value: null }, uVignetteEnabled: { value: Number(config.effects.vignette?.enabled === true) },
          uVignetteOffset: { value: config.effects.vignette?.offset ?? 0.5 },
          uVignetteDarkness: { value: config.effects.vignette?.darkness ?? 0.35 },
          uGrainEnabled: { value: Number(config.effects.grain?.enabled === true) },
          uGrainAmount: { value: config.effects.grain?.amount ?? 0.15 }, uGrainSeed: { value: 0 },
          uChromaticEnabled: { value: Number(config.effects.chromaticAberration?.enabled === true) },
          uChromaticOffset: { value: config.effects.chromaticAberration?.offset ?? 0.002 },
        },
        vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader: "uniform sampler2D tDiffuse;uniform float uVignetteEnabled,uVignetteOffset,uVignetteDarkness,uGrainEnabled,uGrainAmount,uGrainSeed,uChromaticEnabled,uChromaticOffset;varying vec2 vUv;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uGrainSeed*74.7)*43758.5453);}void main(){vec4 color=texture2D(tDiffuse,vUv);if(uChromaticEnabled>0.5){vec2 shift=(vUv-0.5)*uChromaticOffset;color.r=texture2D(tDiffuse,vUv+shift).r;color.b=texture2D(tDiffuse,vUv-shift).b;}if(uVignetteEnabled>0.5){float edge=distance(vUv,vec2(0.5));float shade=smoothstep(min(uVignetteOffset,0.706),0.7071,edge);color.rgb*=1.0-shade*uVignetteDarkness;}if(uGrainEnabled>0.5){color.rgb+=(hash(gl_FragCoord.xy)-0.5)*uGrainAmount;}gl_FragColor=color;}"
      };
      effectShader = new shaderModule.ShaderPass(shader);
          composer.addPass(effectShader);
          composer.addPass(new outputModule.OutputPass());
    }
    const resize = () => {
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      renderer.setSize(width, height, false);
      composer?.setSize(width, height);
      if (camera.isPerspectiveCamera) camera.aspect = width / height;
      if (camera.isOrthographicCamera) {
        resizeOrthographicCamera(camera, config, width, height);
      } else {
        camera.updateProjectionMatrix();
      }
    };
    resize();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(canvas);
    else window.addEventListener("resize", resize);
    const started = performance.now();
    let previousFrame = started;
    const draw = (now) => {
      const time = ((now - started) / 1000 + config.playbackStart) % config.duration;
      const delta = Math.max(0, (now - previousFrame) / 1000);
      previousFrame = now;
      for (const mixer of mixers) mixer.update(delta);
      for (const entry of entries) {
        const { node, object } = entry;
        let rotationX = node.rotationX;
        let rotationY = node.rotationY;
        let rotationZ = node.rotationZ;
        let modelRotationX = node.model?.rotation?.x || 0;
        let modelRotationY = node.model?.rotation?.y || 0;
        let modelRotationZ = node.model?.rotation?.z || 0;
        for (const track of node.animations) {
          const value = sample(track, time);
          if (value === null) continue;
          if (track.property === "x") object.position.x = value + node.width / 2 - config.width / 2;
          if (track.property === "y") object.position.y = config.height / 2 - value - node.height / 2;
          if (track.property === "rotation") rotationZ = value;
          if (track.property === "spatial.z") object.position.z = value;
          if (track.property === "spatial.rotationX") rotationX = value;
          if (track.property === "spatial.rotationY") rotationY = value;
          if (track.property === "model.rotation.x") modelRotationX = value;
          if (track.property === "model.rotation.y") modelRotationY = value;
          if (track.property === "model.rotation.z") modelRotationZ = value;
          if (track.property === "model.scale" && entry.modelVisual) {
            const scale = entry.modelFit * Math.max(0, value);
            entry.modelVisual.scale.setScalar(scale);
            entry.modelVisual.position.copy(entry.modelCenter.clone().multiplyScalar(-scale));
          }
          if (track.property === "geometry.depth" && node.kind === "mesh3d") {
            const gtype = node.geometry?.type;
            if (gtype === "box") object.scale.z = Math.max(0.01, value) / Math.max(0.01, node.geometry.depth);
            else if (gtype === "sphere") object.scale.z = Math.max(0.01, value) / 2;
            else if (["cylinder", "cone", "pyramid", "helix", "torus"].includes(gtype)) object.scale.z = Math.max(0.01, value);
          }
          if (track.property === "material.metalness" && object.material) object.material.metalness = Math.max(0, Math.min(1, value));
          if (track.property === "material.roughness" && object.material) object.material.roughness = Math.max(0, Math.min(1, value));
          if (track.property === "opacity") object.traverse((part) => { if (part.material) for (const material of Array.isArray(part.material) ? part.material : [part.material]) { material.transparent = true; material.opacity = Math.max(0, Math.min(1, value)); } });
        }
        object.rotation.set(-radians(rotationX + modelRotationX), radians(rotationY + modelRotationY), -radians(rotationZ + modelRotationZ));
      }
      if (entries.length) {
        const bounds = new THREE.Box3();
        for (const entry of entries) bounds.expandByObject(entry.object);
        if (!bounds.isEmpty()) fitShadowCamera(THREE, sunlight, bounds);
      }
      if (composer) {
        if (effectShader) effectShader.uniforms.uGrainSeed.value = time;
        composer.render();
      } else renderer.render(scene, camera);
      canvas.setAttribute("data-voo-ready", "");
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }
} catch (error) { console.error("Unable to start exported 3D scene", error); }
</script>`;
