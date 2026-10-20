import { getBaseDefaults, newId, NODE_KIND } from "./scene_doc_factory.js";

const VIDEO_DEFAULTS = Object.freeze({
  inPoint: 0,
  outPoint: null,
  speed: 1,
  volume: 1,
  muted: false,
});

/** Clips whose span follows their footage rather than the composition. */
const FOOTAGE_KINDS = new Set([NODE_KIND.VIDEO, NODE_KIND.AUDIO]);
/** Layers that belong on the stage as a box; audio deliberately does not. */
const BOXED_KINDS = new Set([NODE_KIND.VIDEO, NODE_KIND.MODEL_3D]);

const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);

export function isMediaNode(node) {
  return FOOTAGE_KINDS.has(node?.kind) || node?.kind === NODE_KIND.MODEL_3D;
}

/**
 * Whether a layer owns a rectangle on the stage at all.
 *
 * An audio layer has a clip span, volume and fades but paints nothing, so it
 * neither hit-tests nor draws selection chrome — it is reached from Layers and
 * the timeline, the two places that can give it a span.
 */
export function isBoxlessNode(node) {
  return node?.kind === NODE_KIND.AUDIO;
}

/** Every footage clip shares these; only the video path adds anything. */
function normalizeClipMedia(media) {
  const value = media ?? {};
  return {
    inPoint: Math.max(0, finite(value.inPoint, VIDEO_DEFAULTS.inPoint)),
    outPoint: Number.isFinite(value.outPoint)
      ? Math.max(0, value.outPoint)
      : null,
    speed:
      Number.isFinite(value.speed) && value.speed > 0
        ? value.speed
        : VIDEO_DEFAULTS.speed,
    volume: Math.min(
      1,
      Math.max(0, finite(value.volume, VIDEO_DEFAULTS.volume)),
    ),
    muted: Boolean(value.muted),
  };
}

/** Seconds of gain ramp at each end of an audio clip; never negative. */
function normalizeFade(value) {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

export function normalizeMediaNode(node) {
  if (!isMediaNode(node)) return node;
  const common = {
    ...node,
    assetId: typeof node.assetId === "string" ? node.assetId : null,
    src: typeof node.src === "string" ? node.src : null,
    timing: {
      start: Math.max(0, finite(node.timing?.start, 0)),
      end: Number.isFinite(node.timing?.end)
        ? Math.max(0, node.timing.end)
        : null,
    },
    animations: Array.isArray(node.animations) ? node.animations : [],
  };
  if (node.kind === NODE_KIND.VIDEO) {
    return { ...common, media: normalizeClipMedia(node.media) };
  }
  if (node.kind === NODE_KIND.AUDIO) {
    const media = node.media ?? {};
    return {
      ...common,
      media: {
        ...normalizeClipMedia(media),
        fadeIn: normalizeFade(media.fadeIn),
        fadeOut: normalizeFade(media.fadeOut),
      },
    };
  }
  const model = node.model ?? {};
  return {
    ...common,
    model: {
      rotation: {
        x: finite(model.rotation?.x, 0),
        y: finite(model.rotation?.y, 0),
        z: finite(model.rotation?.z, 0),
      },
      scale: Math.max(0, finite(model.scale, 1)),
      color: typeof model.color === "string" ? model.color : null,
      metalness: Number.isFinite(model.metalness)
        ? Math.min(1, Math.max(0, model.metalness))
        : null,
      roughness: Number.isFinite(model.roughness)
        ? Math.min(1, Math.max(0, model.roughness))
        : null,
      camera: {
        azimuth: finite(model.camera?.azimuth, 0),
        elevation: finite(model.camera?.elevation, 15),
        distance: Math.max(0.01, finite(model.camera?.distance, 3)),
        fov: Math.min(179, Math.max(1, finite(model.camera?.fov, 45))),
      },
      environment:
        typeof model.environment === "string" ? model.environment : "studio",
      exposure: Math.max(0, finite(model.exposure, 1)),
    },
  };
}

function createMediaNode(kind, options = {}) {
  const box = options.box ?? options;
  // Sound has no rectangle: its node exists to carry the clip, not a box, so
  // nothing on the stage can select, move or draw it.
  const boxed = BOXED_KINDS.has(kind);
  return {
    ...getBaseDefaults(),
    id: options.id ?? newId(),
    kind,
    x: boxed ? finite(box.x, 0) : 0,
    y: boxed ? finite(box.y, 0) : 0,
    width: boxed ? Math.max(1, finite(box.width, 320)) : 0,
    height: boxed ? Math.max(1, finite(box.height, 180)) : 0,
    assetId: options.assetId ?? null,
    src: options.src ?? null,
    ...(options.name ? { name: options.name } : {}),
    timing: options.timing ?? { start: 0, end: null },
    animations: options.animations ?? [],
    ...(FOOTAGE_KINDS.has(kind)
      ? { media: options.media }
      : { model: options.model }),
  };
}

export function createVideoNode(options) {
  return normalizeMediaNode(createMediaNode(NODE_KIND.VIDEO, options));
}

export function createAudioNode(options) {
  return normalizeMediaNode(createMediaNode(NODE_KIND.AUDIO, options));
}

export function createModel3dNode(options) {
  return normalizeMediaNode(createMediaNode(NODE_KIND.MODEL_3D, options));
}

/** Merge property-panel patches without erasing sibling model controls. */
export function mergeMediaNodePatch(node, patch) {
  if (!isMediaNode(node)) return patch;
  const next = { ...node, ...patch };
  if (patch.timing) next.timing = { ...node.timing, ...patch.timing };
  if (patch.media) next.media = { ...node.media, ...patch.media };
  if (patch.model) {
    next.model = {
      ...node.model,
      ...patch.model,
      ...(patch.model.rotation
        ? { rotation: { ...node.model?.rotation, ...patch.model.rotation } }
        : {}),
      ...(patch.model.camera
        ? { camera: { ...node.model?.camera, ...patch.model.camera } }
        : {}),
    };
  }
  const normalized = normalizeMediaNode(next);
  return Object.fromEntries(
    Object.keys(patch).map((key) => [key, normalized[key]]),
  );
}
