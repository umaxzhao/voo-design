/**
 * Importing a bitmap from the workspace has no canvas yet. Create one document
 * for the picture, wait for its engine, then place the file as a normal image
 * layer so it lands in history and can be saved like any other design.
 */

const BITMAP_MIME = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  ico: "image/x-icon",
});

/** Wait for the freshly created document's engine without blocking the picker. */
export async function waitForEditorEngine({
  host = globalThis.window,
  timeoutMs = 8000,
  intervalMs = 25,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const engine = host?.__vooEditor;
    if (engine?.insertImage) return engine;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export async function openBitmapAsProject({
  store,
  bytes,
  name,
  setWelcomeOpen,
  host = globalThis.window,
  timeoutMs = 8000,
}) {
  if (!store?.newVooProject) throw new Error("store-unavailable");
  const filename = String(name || "Imported image");
  const extension = filename.split(".").pop().toLowerCase();
  const file = new File([bytes], filename, {
    type: BITMAP_MIME[extension] || "application/octet-stream",
  });
  const label = filename.replace(/\.[^.]+$/, "").trim() || "Imported image";
  store.newVooProject({ label });
  setWelcomeOpen?.(false);
  const engine = await waitForEditorEngine({ host, timeoutMs });
  if (!engine) throw new Error("editor-not-ready");
  await engine.insertImage(file);
  return file;
}
