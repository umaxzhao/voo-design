import { useEffect, useRef, useState } from "react";
import { isImageFill } from "../../color_picker/texture-fill.js";
const previews = new Map();
const PREVIEW_LIMIT = 64;
const MAX_PREVIEW_SIZE = 512;
function bitmapUrl(bitmap) {
  if (!bitmap) return null;
  if (typeof bitmap.src === "string" && bitmap.src && !bitmap.src.startsWith("blob:")) return bitmap.src;
  const width = bitmap.naturalWidth ?? bitmap.width;
  const height = bitmap.naturalHeight ?? bitmap.height;
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(1, MAX_PREVIEW_SIZE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Fill preview requires a 2D canvas context");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL();
  } catch (error) {
    if (error.name !== "SecurityError") throw error;
    console.warn("[fill-preview] Image source does not permit a preview export", error);
    return null;
  }
}

/** Decode only the selected paint; cancel polling when its row unmounts or changes. */
export function useFillPreview(object, getBitmap) {
  const source = isImageFill(object.fill) ? object.fill : null;
  const imageKey = object.imageId ?? object.src ?? null;
  const [preview, setPreview] = useState(null);
  const current = useRef(object);
  current.current = object;
  useEffect(() => {
    setPreview(null);
    if (source || !imageKey || !getBitmap) return undefined;
    if (previews.has(imageKey)) {
      setPreview(previews.get(imageKey));
      return undefined;
    }
    let cancelled = false,
      attempts = 0,
      timer;
    const poll = () => {
      if (cancelled) return;
      const url = bitmapUrl(getBitmap(current.current));
      if (url) {
        if (previews.size >= PREVIEW_LIMIT) previews.delete(previews.keys().next().value);
        previews.set(imageKey, url);
        setPreview(url);
      } else if (++attempts < 20) timer = setTimeout(poll, 200);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, imageKey, getBitmap]);
  return source ?? preview;
}
