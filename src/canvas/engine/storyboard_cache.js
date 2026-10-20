import { HANDLE } from "../nodes/types.js";
import { collectImageInputs } from "./graph_image_inputs.js";
import { collectTextInputs } from "./graph_text_inputs.js";
import {
  compileShotVideoPrompt,
  isRenderableShot,
} from "./storyboard_compile.js";
import {
  compileStoryboardKeyframePrompt,
  compileStoryboardSheetPrompt,
  usesStoryboardSheet,
} from "./storyboard_sheet.js";

const GENERATION_FIELDS = [
  "platform",
  "executionMode",
  "providerId",
  "modelId",
  "routeId",
  "resolution",
  "fps",
  "negativePrompt",
  "styleAnchorId",
  "referenceImageTransport",
  "jimengModel",
  "jimengAspectRatio",
  "jimengResolution",
  "midjourney",
  "newConversation",
  "voice",
];

function generationSettings(data = {}) {
  return Object.fromEntries(
    GENERATION_FIELDS.map((field) => [field, data[field]]),
  );
}

function imageReferences(nodeId, nodes, edges) {
  return collectImageInputs(nodeId, nodes, edges).map((input) => ({
    imageId: input.imageId,
    annotatedImage: input.annotatedImage,
    annotations: input.annotations,
    prompt: input.prompt,
  }));
}

function audioReferences(nodeId, nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges
    .filter(
      (edge) => edge.target === nodeId && edge.targetHandle === HANDLE.AUDIO,
    )
    .map((edge) => {
      const data = byId.get(edge.source)?.data ?? {};
      return [
        edge.source,
        data.audioId,
        data.assetId,
        data.results,
        data.selectedIndex,
      ];
    });
}

/** A complete recipe for one still, independent of its cached output id. */
export function keyframeSignature(shot, board, nodes, edges) {
  return JSON.stringify({
    prompt: compileStoryboardKeyframePrompt(shot, board),
    settings: generationSettings(board.data),
    images: imageReferences(board.id, nodes, edges),
    sheet: usesStoryboardSheet(board)
      ? {
          imageId: board.data.sheetImageId,
          recipe: storyboardSheetSignature(board, nodes, edges),
        }
      : null,
  });
}

/** One full-page storyboard image, invalidated by any panel or image route. */
export function storyboardSheetSignature(board, nodes, edges) {
  return JSON.stringify({
    prompt: compileStoryboardSheetPrompt(board),
    settings: generationSettings(board.data),
    images: imageReferences(board.id, nodes, edges),
  });
}

export function needsStoryboardSheet(board, nodes, edges) {
  return (
    usesStoryboardSheet(board) &&
    (board.data.shots ?? []).some(isRenderableShot) &&
    (!board.data.sheetImageId ||
      board.data.sheetSignature !==
        storyboardSheetSignature(board, nodes, edges))
  );
}

export function pendingKeyframes(board, nodes, edges) {
  return (board.data.shots ?? []).filter(
    (shot) =>
      isRenderableShot(shot) &&
      (!shot.keyframeId ||
        shot.keyframeSignature !==
          keyframeSignature(shot, board, nodes, edges)),
  );
}

/** A clip recipe includes its position, board direction, and all live inputs. */
export function videoShotSignature(
  shot,
  index,
  count,
  board,
  video,
  nodes,
  edges,
) {
  return JSON.stringify({
    shotId: shot.id,
    prompt: [
      compileShotVideoPrompt(shot, index, count, board.data),
      video.data.prompt?.trim(),
    ]
      .filter(Boolean)
      .join("\n\n"),
    duration: shot.duration,
    aspectRatio: board.data.aspectRatio || video.data.aspectRatio,
    keyframeId: shot.keyframeId,
    keyframeRecipe: shot.keyframeId
      ? keyframeSignature(shot, board, nodes, edges)
      : null,
    settings: generationSettings(video.data),
    images: imageReferences(video.id, nodes, edges),
    text: collectTextInputs(video.id, nodes, edges),
    audio: audioReferences(video.id, nodes, edges),
  });
}

/** Ordered cache entries; stale or legacy clips become empty pending entries. */
export function videoClipPlan(board, video, nodes, edges) {
  const shots = (board.data.shots ?? []).filter(isRenderableShot);
  const cached = new Map(
    (video.data.storyboardClips ?? []).map((entry) => [entry.shotId, entry]),
  );
  return shots.map((shot, index) => {
    const signature = videoShotSignature(
      shot,
      index,
      shots.length,
      board,
      video,
      nodes,
      edges,
    );
    const previous = cached.get(shot.id);
    return {
      shotId: shot.id,
      signature,
      clipIds:
        previous?.signature === signature && Array.isArray(previous.clipIds)
          ? previous.clipIds
          : [],
    };
  });
}

export function clipResults(plan) {
  return plan.flatMap((entry) => entry.clipIds);
}
