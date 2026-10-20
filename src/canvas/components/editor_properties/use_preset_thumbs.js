import { useEffect, useMemo, useState } from "react";
import { FILTER_CATEGORIES } from "../../editor/filter_presets.js";
import { applyAdjustments } from "../../editor/scene_renderer.js";
import { buildToneLut } from "../../editor/tone_lut.js";

/** Longest edge of a preset swatch, in px. */
const THUMB_MAX_EDGE = 96;
/** Swatches survive selection changes; cap how many bitmaps we keep. */
const THUMB_CACHE_LIMIT = 96;

/**
 * `imageKey|preset.key` → `{ url, width, height }`. Module-level so re-opening
 * the picker (or re-selecting an already-seen image) costs nothing.
 */
const thumbCache = new Map();

/** Tone signatures per preset, computed once — the active-swatch comparison. */
const PRESET_SIGNATURES = new Map(
  FILTER_CATEGORIES.flatMap((category) =>
    category.presets.map((preset) => [
      preset.key,
      buildToneLut(preset.adjustments).signature,
    ]),
  ),
);

/** The preset applied to a scaled-down copy of the node's bitmap. */
function renderThumb(bitmap, adjustments) {
  const sourceWidth = bitmap.naturalWidth ?? bitmap.width;
  const sourceHeight = bitmap.naturalHeight ?? bitmap.height;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.min(
    1,
    THUMB_MAX_EDGE / Math.max(sourceWidth, sourceHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const adjusted = applyAdjustments(canvas, adjustments);
  return {
    url: adjusted.toDataURL(),
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Swatches for every preset, rendered from the layer's own bitmap so a look is
 * judged on the actual picture rather than a stock tile.
 *
 * Regenerated only when the image identity changes; the module cache makes
 * revisiting an image free. Returns `{}` until a bitmap is available, which is
 * the caller's cue to draw placeholders.
 *
 * @param {CanvasImageSource|null} bitmap the decoded layer image
 * @param {string|null} imageKey stable identity of that image, for caching
 */
export function usePresetThumbs(bitmap, imageKey) {
  const [thumbs, setThumbs] = useState({});

  useEffect(() => {
    if (!bitmap || !imageKey) {
      setThumbs({});
      return;
    }
    const next = {};
    for (const category of FILTER_CATEGORIES) {
      for (const preset of category.presets) {
        const cacheKey = `${imageKey}|${preset.key}`;
        let thumb = thumbCache.get(cacheKey);
        if (!thumb) {
          thumb = renderThumb(bitmap, preset.adjustments);
          if (thumb) {
            if (thumbCache.size >= THUMB_CACHE_LIMIT) {
              thumbCache.delete(thumbCache.keys().next().value);
            }
            thumbCache.set(cacheKey, thumb);
          }
        }
        if (thumb) next[preset.key] = thumb;
      }
    }
    setThumbs(next);
  }, [bitmap, imageKey]);

  return thumbs;
}

/**
 * Which preset the layer currently matches, by the same structural signature
 * the renderer caches on — or null once the user has edited away from it.
 */
export function useActivePresetKey(adjustments) {
  return useMemo(() => {
    const signature = buildToneLut(adjustments).signature;
    for (const category of FILTER_CATEGORIES) {
      for (const preset of category.presets) {
        if (PRESET_SIGNATURES.get(preset.key) === signature) return preset.key;
      }
    }
    return null;
  }, [adjustments]);
}
