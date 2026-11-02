import { figmaMatrix } from "./figma-node-transform.js";

/** Native STRETCH stores the manual crop's normalized image sampling matrix. */
export function figmaImagePaint(paint) {
  const mode = paint.imageScaleMode ?? paint.scaleMode ?? "FILL";
  const fields = { imageScaleMode: ({ FILL: "fill", FIT: "fit", TILE: "tile", STRETCH: "crop", CROP: "crop" })[mode] ?? "fill" };
  if (["STRETCH", "CROP"].includes(mode) && paint.transform) {
    const matrix = figmaMatrix(paint.transform);
    const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
    if (Math.abs(determinant) > 1e-10) fields.imageTransform = matrix;
  }
  if (mode === "TILE") fields.imageTileScale = paint.scale > 0 ? paint.scale : 1;
  return fields;
}
