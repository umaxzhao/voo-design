/**
 * Cache Storage buckets that hold the in-browser model files.
 *
 * One list, so the modules that fill these caches and the Settings action that
 * empties them cannot drift apart: a bucket added here is also one the
 * "Clear model files" button removes.
 */
export const MATTING_MODEL_CACHE = "voo-matting-v1";
export const AI_REPAIR_MODEL_CACHE = "voo-ai-repair-v1";
export const UPSCALE_MODEL_CACHE = "voo-upscale-v1";

export const MODEL_CACHE_NAMES = Object.freeze([
  MATTING_MODEL_CACHE,
  AI_REPAIR_MODEL_CACHE,
  UPSCALE_MODEL_CACHE,
]);
