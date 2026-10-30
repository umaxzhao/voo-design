/** Stable registration facade; asset implementations are grouped by responsibility. */
import { GENERATE_VECTOR_SCHEMA, generateVector } from "./canvas-tools-vector-assets.js";
import { VECTORIZE_IMAGE_SCHEMA, EDIT_IMAGE_SCHEMA, vectorizeImage, editImage } from "./canvas-tools-image-assets.js";
import { STOCK_IMAGE_SCHEMA, CREATE_ICON_SCHEMA, stockImage, createIcon } from "./canvas-tools-stock-assets.js";
export { transformPathData } from "./canvas-asset-shared.js";
export { GENERATE_VECTOR_SCHEMA, generateVector, VECTORIZE_IMAGE_SCHEMA, EDIT_IMAGE_SCHEMA, vectorizeImage, editImage, STOCK_IMAGE_SCHEMA, CREATE_ICON_SCHEMA, stockImage, createIcon };
export const ASSET_TOOL_SCHEMAS = Object.freeze([GENERATE_VECTOR_SCHEMA, VECTORIZE_IMAGE_SCHEMA, EDIT_IMAGE_SCHEMA, STOCK_IMAGE_SCHEMA, CREATE_ICON_SCHEMA]);
export const ASSET_TOOL_EXECUTORS = Object.freeze({
  generate_vector: generateVector,
  vectorize_image: vectorizeImage,
  edit_image: editImage,
  stock_image: stockImage,
  create_icon: createIcon
});
