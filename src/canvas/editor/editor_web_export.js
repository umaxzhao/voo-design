/** Standalone HTML page export for Design, Motion, and embedded 3D canvases. */
import { getNodeSpatial, getScene3d } from "./canvas-composition-model.js";
import {
  documentToHtml,
  safeImageSource,
  safeVideoSource,
  fallbackSvg,
} from "./editor_html_export.js";
import { safeCssValue } from "./editor_html_elements.js";
import { estimateTextSize } from "./text_fidelity.js";
import { normalizeTimeline } from "./scene-motion.js";
import { t } from "../../shared/i18n.js";
import { THREE_RUNTIME, VIDEO_RUNTIME } from "./editor_web_runtime.js";

const SCENE_KINDS = new Set([
  "rect",
  "ellipse",
  "text",
  "image",
  "video",
  "mesh3d",
  "model3d",
  "canvasInstance",
  "path",
  "boolean",
]);
const ANIMATED_PROPERTIES = new Set([
  "x",
  "y",
  "rotation",
  "opacity",
  "spatial.z",
  "spatial.rotationX",
  "spatial.rotationY",
  "model.rotation.x",
  "model.rotation.y",
  "model.rotation.z",
  "model.scale",
  "geometry.depth",
  "material.metalness",
  "material.roughness",
]);

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function scriptJson(value) {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function safeModuleSource(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new TypeError("html-export-runtime-url");
  try {
    const url = new URL(value);
    if (
      ["https:", "http:"].includes(url.protocol) &&
      url.pathname.endsWith(".js")
    )
      return url.href;
  } catch {
    if (/^(?:\.\/|\.\.\/|\/)[\w./-]+\.js$/.test(value) && !value.includes(".."))
      return value;
  }
  throw new TypeError("html-export-runtime-url");
}

function safeAssetSource(value) {
  if (
    typeof value === "string" &&
    /^data:(?:model\/gltf-binary|application\/octet-stream);base64,(?:[a-z\d+/]{4})*(?:[a-z\d+/]{2}==|[a-z\d+/]{3}=)?$/i.test(
      value,
    )
  )
    return value;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    // Relative assets stay portable when exported beside their GLB or glTF files.
  }
  return typeof value === "string" &&
    /^(?:\.\/|[\w-])[\w./%-]+\.(?:glb|gltf)(?:\?[\w=&%-]+)?$/i.test(value) &&
    !value.includes("..")
    ? value
    : null;
}

function sceneNode(
  node,
  imageSourceOf,
  videoSourceOf,
  modelSourceOf,
  warnings,
) {
  // Sound has no scene presence: it reaches the page through documentToHtml's
  // own <audio>, so leaving it out of the WebGL scene is not an unsupported
  // node to warn about.
  if (
    node.visible === false ||
    ["group", "region", "adjustment", "audio"].includes(node.kind)
  )
    return null;
  if (!SCENE_KINDS.has(node.kind)) {
    warnings.push("html-export-3d-unsupported-node");
    return null;
  }
  const measured =
    node.kind === "text"
      ? estimateTextSize(node.text, node.fontSize, node.boxWidth)
      : null;
  const width = node.width > 0 ? node.width : measured?.width;
  const height = node.height > 0 ? node.height : measured?.height;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    warnings.push("html-export-3d-node-size");
    return null;
  }
  const spatial = getNodeSpatial({ ...node, width, height });
  const animations = Array.isArray(node.animations)
    ? node.animations
        .filter(
          (track) =>
            ANIMATED_PROPERTIES.has(track.property) &&
            Array.isArray(track.keyframes),
        )
        .map((track) => ({
          property: track.property,
          keyframes: track.keyframes
            .filter(
              (frame) =>
                Number.isFinite(frame.time) &&
                Number.isFinite(frame.value) &&
                frame.time >= 0,
            )
            .map((frame) => ({
              time: frame.time,
              value: frame.value,
              easing: frame.easing,
            })),
        }))
    : [];
  const isVectorPath = node.kind === "path" || node.kind === "boolean";
  const source =
    node.kind === "image"
      ? safeImageSource(imageSourceOf(node))
      : node.kind === "video"
        ? safeVideoSource(videoSourceOf(node))
        : node.kind === "model3d"
          ? safeAssetSource(modelSourceOf(node))
          : node.kind === "canvasInstance"
            ? safeImageSource(node.instance?.poster)
            : isVectorPath
              ? fallbackSvg(node)
              : null;
  if (
    ["image", "video", "model3d", "canvasInstance"].includes(node.kind) &&
    !source
  )
    warnings.push("html-export-3d-asset-missing");
  return {
    id: String(node.id),
    kind: isVectorPath ? "image" : node.kind,
    ...(isVectorPath ? { originalKind: node.kind } : {}),
    ...(typeof node.materialAssetId === "string"
      ? { materialAssetId: node.materialAssetId }
      : {}),
    ...spatial,
    opacity: Number.isFinite(node.opacity)
      ? Math.max(0, Math.min(1, node.opacity))
      : 1,
    fill: safeCssValue(node.fill, "#d4d4d4"),
    text: String(node.text ?? ""),
    fontSize: Number.isFinite(node.fontSize) ? Math.max(1, node.fontSize) : 16,
    geometry:
      node.kind === "mesh3d"
        ? {
            type: node.geometry?.type ?? "box",
            depth: node.geometry?.depth ?? Math.min(node.width, node.height),
            ...(Number.isFinite(node.geometry?.radialSegments)
              ? { radialSegments: node.geometry.radialSegments }
              : {}),
            ...(Number.isFinite(node.geometry?.tubularSegments)
              ? { tubularSegments: node.geometry.tubularSegments }
              : {}),
            ...(Number.isFinite(node.geometry?.tubeRadius)
              ? { tubeRadius: node.geometry.tubeRadius }
              : {}),
            ...(Number.isFinite(node.geometry?.turns)
              ? { turns: node.geometry.turns }
              : {}),
            ...(Number.isFinite(node.geometry?.pitch)
              ? { pitch: node.geometry.pitch }
              : {}),
            ...(Number.isFinite(node.geometry?.p)
              ? { p: node.geometry.p }
              : {}),
            ...(Number.isFinite(node.geometry?.q)
              ? { q: node.geometry.q }
              : {}),
            ...(Number.isFinite(node.geometry?.sides)
              ? { sides: node.geometry.sides }
              : {}),
            ...(Number.isFinite(node.geometry?.points)
              ? { points: node.geometry.points }
              : {}),
            ...(Number.isFinite(node.geometry?.innerRatio)
              ? { innerRatio: node.geometry.innerRatio }
              : {}),
            ...(Number.isFinite(node.geometry?.detail)
              ? { detail: node.geometry.detail }
              : {}),
          }
        : null,
    material:
      node.kind === "mesh3d"
        ? {
            color: safeCssValue(node.material?.color, "#d4d4d4"),
            metalness: node.material?.metalness ?? 0,
            roughness: node.material?.roughness ?? 0.6,
          }
        : null,
    model:
      node.kind === "model3d"
        ? {
            rotation: node.model?.rotation ?? { x: 0, y: 0, z: 0 },
            scale: node.model?.scale ?? 1,
            color: safeCssValue(node.model?.color, null),
          }
        : null,
    source,
    animations,
  };
}

function buildScene(
  { id, doc, nodes, playbackStart, transparentBackground },
  callbacks,
  warnings,
) {
  const scene = getScene3d(doc);
  return {
    id,
    width: doc.width,
    height: doc.height,
    frame: scene.frame,
    backgroundColor: transparentBackground
      ? "transparent"
      : safeCssValue(scene.backgroundColor, "transparent"),
    backgroundOpacity: transparentBackground
      ? 0
      : scene.backgroundOpacity,
    fog: scene.fog,
    sky: scene.sky,
    shadows: scene.shadows,
    colorGrading: scene.colorGrading,
    effects: scene.effects,
    camera: scene.camera,
    lighting: scene.lighting,
    environment: scene.environment,
    materialAssets: scene.materialAssets ?? [],
    duration:
      Number.isFinite(doc.timeline?.duration) && doc.timeline.duration > 0
        ? doc.timeline.duration
        : 5,
    playbackStart: Number.isFinite(playbackStart)
      ? Math.max(0, playbackStart)
      : 0,
    nodes: nodes
      .map((node) =>
        sceneNode(
          node,
          callbacks.imageSourceOf,
          callbacks.videoSourceOf,
          callbacks.modelSourceOf,
          warnings,
        ),
      )
      .filter(Boolean),
  };
}

/** Returns page HTML plus explicit export limitations for the caller to display. */
export function documentToWebPage(doc, options = {}) {
  const warnings = [];
  const scenes = [];
  const imageSourceOf = options.imageSourceOf ?? ((node) => node.src);
  const videoSourceOf = options.videoSourceOf ?? ((node) => node.src);
  const modelSourceOf = options.modelSourceOf ?? ((node) => node.src);
  const snippet = documentToHtml(doc, {
    selectedIds: options.selectedIds ?? null,
    imageSourceOf,
    imageSizeOf: options.imageSizeOf ?? (() => null),
    videoSourceOf,
    scenePosterOf: options.scenePosterOf ?? (() => null),
    resolveCanvas: options.resolveCanvas ?? null,
    onScene: (scene) => scenes.push(scene),
  });
  const configs = scenes.map((scene) =>
    buildScene(
      scene,
      { imageSourceOf, videoSourceOf, modelSourceOf },
      warnings,
    ),
  );
  const threeUrl = safeModuleSource(options.threeModuleUrl);
  const loaderUrl = safeModuleSource(options.gltfLoaderModuleUrl);
  const effectScenes = configs.some((scene) =>
    scene.effects?.enabled && ["bloom", "vignette", "grain", "chromaticAberration"]
      .some((key) => scene.effects[key]?.enabled),
  );
  if (configs.length && !threeUrl)
    warnings.push("html-export-three-runtime-required");
  if (
    configs.some((scene) =>
      scene.nodes.some((node) => node.kind === "model3d"),
    ) &&
    !loaderUrl
  )
    warnings.push("html-export-gltf-loader-required");
  const title = escapeHtml(options.title ?? "VOO");
  const lang = /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(options.lang ?? "en")
    ? (options.lang ?? "en")
    : "en";
  const importMapImports = { three: threeUrl };
  if (effectScenes && threeUrl) {
    const addonBase = options.threeAddonsBaseUrl
      ? safeModuleSource(options.threeAddonsBaseUrl)
      : threeUrl.replace(/\/build\/three\.module\.js(?:\?.*)?$/, "/examples/jsm/")
          .replace(/\/three\.module\.js(?:\?.*)?$/, "/examples/jsm/");
    if (addonBase && addonBase !== threeUrl) importMapImports["three/addons/"] = addonBase;
    else warnings.push("html-export-three-effects-unavailable");
  }
  const importMap =
    configs.length && threeUrl
      ? `<script type="importmap">${scriptJson({ imports: importMapImports })}</script>`
      : "";
  const runtime =
    configs.length && threeUrl
      ? THREE_RUNTIME.replace("__SCENES__", scriptJson(configs))
          .replace("__THREE_URL__", scriptJson(threeUrl))
          .replace("__LOADER_URL__", scriptJson(loaderUrl))
          .replace("__HAS_EFFECTS__", effectScenes ? "true" : "false")
          .replace("__EFFECT_MODULES__", effectScenes
            ? importMapImports["three/addons/"]
              ? 'await Promise.all([import("three/addons/postprocessing/EffectComposer.js"),import("three/addons/postprocessing/RenderPass.js"),import("three/addons/postprocessing/ShaderPass.js"),import("three/addons/postprocessing/UnrealBloomPass.js"),import("three/addons/postprocessing/OutputPass.js")])'
              : "null"
            : "null")
      : "";
  // The media runtime drives sound against the composition's own clock, so
  // the page is told how long a loop is and whether it turns over.
  const mediaRuntime = VIDEO_RUNTIME.replace(
    '"__AUDIO_LABEL__"',
    JSON.stringify(t("editor.web.soundToggle")),
  );
  const timeline = normalizeTimeline(doc.timeline);
  return {
    html: `<!doctype html>\n<html lang="${lang}" data-voo-duration="${timeline.duration}" data-voo-loop="${timeline.loop === true}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${title}</title><style>html,body{margin:0;min-height:100%;}body{display:flex;align-items:flex-start;justify-content:flex-start;}</style>${importMap}</head><body>${snippet}${mediaRuntime}${runtime}</body></html>`,
    warnings: [...new Set(warnings)],
    scenes: configs,
  };
}
