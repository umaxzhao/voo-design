import {
  cameraPhrase,
  compileKeyframePrompt,
  isRenderableShot,
} from "./storyboard_compile.js";

export const STORYBOARD_MODE = Object.freeze({
  SHOTS: "shots",
  SHEET: "sheet",
});

export function usesStoryboardSheet(board) {
  return board.data?.storyboardMode === STORYBOARD_MODE.SHEET;
}

/** The sheet's fixed row-major layout makes each panel addressable later. */
export function sheetColumns(count) {
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

export function compileStoryboardSheetPrompt(board) {
  const shots = (board.data.shots ?? []).filter(isRenderableShot);
  const columns = sheetColumns(shots.length);
  const rows = Math.ceil(shots.length / columns);
  const panels = shots.map((shot, index) => {
    const row = Math.floor(index / columns) + 1;
    const column = (index % columns) + 1;
    return [
      `Panel ${index + 1} (row ${row}, column ${column}, ${shot.duration}s):`,
      shot.imagePrompt || shot.action,
      `Camera: ${cameraPhrase(shot)}.`,
      shot.motionPrompt ? `Motion: ${shot.motionPrompt}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  });
  return [
    `Draw ONE cinematic storyboard contact sheet with exactly ${shots.length} panels in a ${columns}-column by ${rows}-row grid, numbered left-to-right and top-to-bottom.`,
    "Keep the same characters, wardrobe, locations, palette, and visual style across every panel.",
    "Draw clear arrows or motion paths inside each panel to indicate subject and camera movement. Keep paths distinct from the artwork so they can be removed in the final frames.",
    "Only small panel numbers and motion arrows may appear. No captions, dialogue, border decorations, or extra panels.",
    board.data.style?.trim() ? `Visual style: ${board.data.style.trim()}.` : "",
    board.data.aspectRatio
      ? `Each panel uses ${board.data.aspectRatio} framing.`
      : "",
    board.data.sheetPrompt?.trim() || "",
    ...panels,
  ]
    .filter(Boolean)
    .join("\n");
}

export function compileStoryboardKeyframePrompt(shot, board) {
  const prompt = compileKeyframePrompt(shot, board.data);
  if (!usesStoryboardSheet(board)) return prompt;
  const shots = (board.data.shots ?? []).filter(isRenderableShot);
  const index = shots.findIndex((item) => item.id === shot.id);
  const columns = sheetColumns(shots.length);
  const row = Math.floor(index / columns) + 1;
  const column = (index % columns) + 1;
  return [
    prompt,
    `The first reference image is a storyboard contact sheet. Expand ONLY panel ${index + 1} (row ${row}, column ${column}) into one clean full-frame image. Preserve its composition, character identity, wardrobe, setting, and light. Use its arrows only as motion guidance; remove all arrows, labels, panel borders, and other panels from the result.`,
  ].join("\n");
}
