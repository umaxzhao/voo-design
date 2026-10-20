const EDITABLE_PREVIEW_TYPES = new Set(["image", "video", "model3d", "html"]);

/** Uploaded PPTX files remain preview-only; embedded pages carry editable sources. */
export function hasEditableSlides(data) {
  const pages =
    Array.isArray(data?.pages) && data.pages.length ? data.pages : data?.slides;
  return (
    Array.isArray(pages) &&
    pages.length > 0 &&
    pages.every((page) => {
      if (typeof page === "string") return Boolean(page.trim());
      if (!page || typeof page !== "object") return false;
      return (
        Array.isArray((page.doc ?? page.editorDoc ?? page.scene)?.nodes) ||
        Boolean(
          page.html ||
          page.srcdoc ||
          page.imageId ||
          page.assetId ||
          page.src ||
          page.url,
        )
      );
    })
  );
}

export function isEditablePreviewType(mediaType, data) {
  return mediaType === "slides"
    ? hasEditableSlides(data)
    : EDITABLE_PREVIEW_TYPES.has(mediaType ?? "image");
}
