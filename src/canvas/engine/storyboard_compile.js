/**
 * Storyboard shot model and prompt compilation.
 *
 * Pure data and string work — no React, no store, no host calls — so the
 * shot vocabulary, the LLM split contract and the per-shot prompts can be
 * pinned by node:test. The storyboard node, its editor and the executor all
 * read the vocabulary from here, so a shot size added once shows up in the
 * picker, the split contract and the compiled prompt together.
 *
 * Camera terms are compiled in English on purpose: image and video models
 * are trained on English cinematography vocabulary regardless of the UI
 * language, while the shot's own wording (action, prompts, dialogue) is sent
 * as the user wrote it.
 */
import { extractJsonReply } from "../../shared/json-reply.js";

export const STORYBOARD_MAX_SHOTS = 24;
export const STORYBOARD_DEFAULT_SHOT_COUNT = 6;
export const STORYBOARD_DEFAULT_TOTAL_DURATION = 30;
export const STORYBOARD_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "21:9"];

/** Framing, widest to tightest. */
export const SHOT_SIZES = {
  extremeWide: "extreme wide shot",
  wide: "wide shot",
  full: "full shot",
  medium: "medium shot",
  mediumClose: "medium close-up",
  closeUp: "close-up",
  extremeCloseUp: "extreme close-up",
};

export const CAMERA_ANGLES = {
  eyeLevel: "eye-level",
  high: "high angle",
  low: "low angle",
  birdsEye: "bird's-eye view",
  wormsEye: "worm's-eye view",
  overShoulder: "over-the-shoulder",
  pov: "point-of-view",
  dutch: "dutch angle",
};

export const CAMERA_MOVES = {
  static: "static camera",
  pushIn: "camera pushes in",
  pullOut: "camera pulls out",
  panLeft: "camera pans left",
  panRight: "camera pans right",
  tiltUp: "camera tilts up",
  tiltDown: "camera tilts down",
  truckLeft: "camera trucks left",
  truckRight: "camera trucks right",
  orbit: "camera orbits the subject",
  craneUp: "camera cranes up",
  craneDown: "camera cranes down",
  follow: "tracking shot following the subject",
  handheld: "handheld camera",
  zoomIn: "camera zooms in",
  zoomOut: "camera zooms out",
};

/** Speed is folded into the move phrase; a still or handheld camera has none. */
export const MOVE_SPEEDS = { slow: "slowly", normal: "", fast: "quickly" };
const SPEEDLESS_MOVES = new Set(["static", "handheld"]);

const SHOT_DEFAULTS = Object.freeze({
  duration: 5,
  shotSize: "medium",
  angle: "eyeLevel",
  cameraMove: "static",
  moveSpeed: "normal",
  action: "",
  imagePrompt: "",
  motionPrompt: "",
  dialogue: "",
  keyframeId: null,
});

const TEXT_FIELDS = ["action", "imagePrompt", "motionPrompt", "dialogue"];

let shotCounter = 0;

/** A fresh, stable shot id. Ids survive reordering, so results map back by id. */
export function createShotId() {
  shotCounter += 1;
  return `shot-${Date.now().toString(36)}-${shotCounter}`;
}

function pickEnum(value, table, fallback) {
  return typeof value === "string" && Object.hasOwn(table, value)
    ? value
    : fallback;
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 1 ? number : fallback;
}

/**
 * Coerces any shot-like object into the stored shape. Unknown enum values
 * fall back to defaults instead of throwing: the split output comes from an
 * LLM, and one invented camera term must not discard the whole storyboard.
 */
export function normalizeShot(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const shot = {
    id: typeof source.id === "string" && source.id ? source.id : createShotId(),
    duration: positiveInteger(source.duration, SHOT_DEFAULTS.duration),
    shotSize: pickEnum(source.shotSize, SHOT_SIZES, SHOT_DEFAULTS.shotSize),
    angle: pickEnum(source.angle, CAMERA_ANGLES, SHOT_DEFAULTS.angle),
    cameraMove: pickEnum(
      source.cameraMove,
      CAMERA_MOVES,
      SHOT_DEFAULTS.cameraMove,
    ),
    moveSpeed: pickEnum(source.moveSpeed, MOVE_SPEEDS, SHOT_DEFAULTS.moveSpeed),
    keyframeId:
      typeof source.keyframeId === "string" && source.keyframeId
        ? source.keyframeId
        : null,
    keyframeSignature:
      typeof source.keyframeSignature === "string"
        ? source.keyframeSignature
        : null,
  };
  for (const field of TEXT_FIELDS) {
    shot[field] = typeof source[field] === "string" ? source[field].trim() : "";
  }
  return shot;
}

export function createShot(overrides = {}) {
  return normalizeShot({ ...SHOT_DEFAULTS, ...overrides, id: createShotId() });
}

/**
 * Rescales shot durations so they add up to `total` seconds, keeping each
 * shot's share. Every shot keeps at least one second. Largest remainders
 * distribute the remaining seconds without losing time to rounding.
 */
export function distributeDurations(shots, total) {
  const target = Math.round(Number(total));
  if (!Number.isFinite(target) || target < 1 || shots.length === 0) {
    return shots;
  }
  const remaining = Math.max(target, shots.length) - shots.length;
  const weights = shots.map((shot) => Math.max(0, Number(shot.duration) || 0));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = weights.map(
    (weight) =>
      (remaining * (weightTotal > 0 ? weight : 1)) /
      (weightTotal > 0 ? weightTotal : shots.length),
  );
  const scaled = shots.map((shot, index) => ({
    ...shot,
    duration: 1 + Math.floor(shares[index]),
  }));
  const extras =
    remaining - shares.reduce((sum, share) => sum + Math.floor(share), 0);
  const order = shares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < extras; index += 1) {
    scaled[order[index].index].duration += 1;
  }
  return scaled;
}

export function totalDuration(shots = []) {
  return shots.reduce((sum, shot) => sum + (Number(shot?.duration) || 0), 0);
}

/** Camera direction as one phrase, e.g. "close-up, low angle, camera pushes in slowly". */
export function cameraPhrase(shot) {
  const move = CAMERA_MOVES[shot.cameraMove] ?? CAMERA_MOVES.static;
  const speed = SPEEDLESS_MOVES.has(shot.cameraMove)
    ? ""
    : (MOVE_SPEEDS[shot.moveSpeed] ?? "");
  return [
    SHOT_SIZES[shot.shotSize] ?? SHOT_SIZES.medium,
    CAMERA_ANGLES[shot.angle] ?? CAMERA_ANGLES.eyeLevel,
    speed ? `${move} ${speed}` : move,
  ].join(", ");
}

/** Still-frame prompt for one shot's keyframe. The still has no camera move. */
export function compileKeyframePrompt(shot, board = {}) {
  const framing = [
    SHOT_SIZES[shot.shotSize] ?? SHOT_SIZES.medium,
    CAMERA_ANGLES[shot.angle] ?? CAMERA_ANGLES.eyeLevel,
  ].join(", ");
  return [
    shot.imagePrompt || shot.action,
    `Framing: ${framing}.`,
    board.style?.trim() ? `Style: ${board.style.trim()}.` : "",
    board.aspectRatio ? `Aspect ratio: ${board.aspectRatio}.` : "",
    "One single cinematic film frame. No text, captions, borders or split panels.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Motion prompt for one shot's video, in the timeline form the director-style
 * ComfyUI nodes compile to: a header naming the shot and its length, the
 * camera direction, then the content.
 */
export function compileShotVideoPrompt(shot, index, count, board = {}) {
  return [
    `[Shot ${index + 1}/${count} · ${shot.duration}s] ${cameraPhrase(shot)}.`,
    shot.action,
    shot.motionPrompt,
    shot.dialogue ? `Dialogue: "${shot.dialogue}"` : "",
    board.style?.trim() ? `Style: ${board.style.trim()}.` : "",
    "Start from the first reference image as the opening frame.",
  ]
    .filter(Boolean)
    .join("\n");
}

const enumList = (table) => Object.keys(table).join(" | ");

/** The instruction sent to the chat model to split a story into shots. */
export function buildSplitPrompt({
  story,
  shotCount,
  totalSeconds,
  style,
  aspectRatio,
}) {
  const count = Math.min(
    positiveInteger(shotCount, STORYBOARD_DEFAULT_SHOT_COUNT),
    STORYBOARD_MAX_SHOTS,
  );
  const seconds = positiveInteger(
    totalSeconds,
    STORYBOARD_DEFAULT_TOTAL_DURATION,
  );
  return [
    "You are a film director breaking a story into a shot list for AI image and video generation.",
    `Split the story below into exactly ${count} shots whose durations add up to ${seconds} seconds.`,
    style?.trim() ? `Visual style: ${style.trim()}.` : "",
    aspectRatio ? `Aspect ratio: ${aspectRatio}.` : "",
    "Vary framing and camera work between consecutive shots. Keep character identity, wardrobe and setting consistent across shots.",
    "Write action, imagePrompt, motionPrompt and dialogue in the same language as the story.",
    "Reply with JSON only, no preamble and no code fence, in exactly this shape:",
    '{"shots":[{"duration":5,"shotSize":"medium","angle":"eyeLevel","cameraMove":"pushIn","moveSpeed":"slow","action":"what happens","imagePrompt":"a detailed still-frame description","motionPrompt":"how subjects and camera move","dialogue":""}]}',
    `shotSize: ${enumList(SHOT_SIZES)}`,
    `angle: ${enumList(CAMERA_ANGLES)}`,
    `cameraMove: ${enumList(CAMERA_MOVES)}`,
    `moveSpeed: ${enumList(MOVE_SPEEDS)}`,
    `<story>\n${story}\n</story>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Parses the chat model's split reply into stored shots. Throws a coded error
 * when the reply holds no usable shot list; tolerates code fences, a bare
 * array, prose around the JSON and invented enum values.
 */
export function parseSplitReply(text, { totalSeconds } = {}) {
  const json = extractJsonReply(text);
  let parsed = null;
  try {
    parsed = json ? JSON.parse(json) : null;
  } catch {
    parsed = null;
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.shots;
  if (!Array.isArray(list)) {
    throw Object.assign(new Error("storyboardParse"), {
      code: "storyboardParse",
    });
  }
  const shots = list
    .slice(0, STORYBOARD_MAX_SHOTS)
    .map((raw) => normalizeShot({ ...raw, id: undefined, keyframeId: null }))
    .filter((shot) => shot.action || shot.imagePrompt || shot.motionPrompt);
  if (shots.length === 0) {
    throw Object.assign(new Error("storyboardParse"), {
      code: "storyboardParse",
    });
  }
  return distributeDurations(shots, totalSeconds);
}

/** Shots that still need a keyframe, in board order. */
export function shotsMissingKeyframes(shots = []) {
  return shots.filter((shot) => !shot.keyframeId);
}

/** A shot is worth rendering when it says something. */
export function isRenderableShot(shot) {
  return Boolean(shot?.action || shot?.imagePrompt || shot?.motionPrompt);
}
