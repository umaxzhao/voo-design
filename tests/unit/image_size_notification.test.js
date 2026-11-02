import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageSizeMessage, subscribeImageSizeNotice } from "../../src/canvas/components/image_size_notice.jsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertImageDimensions } from "../../src/shared/image_size_guard.js";
import { subscribePersistenceAlert } from "../../src/canvas/editor/editor_persist_events.js";
import { createBitmapCache, decodeBlobToBitmap } from "../../src/canvas/editor/bitmap_cache.js";
import { loadLocale, t } from "../../src/shared/i18n.js";

let unsubscribe;
afterEach(() => { unsubscribe?.(); vi.unstubAllGlobals(); });
describe("oversize image notifications", () => {
  it.each([[8193, 1], [8001, 8000]])("alerts on rejected %s×%s images", (width, height) => {
    const listener = vi.fn();
    unsubscribe = subscribePersistenceAlert(listener);
    expect(() => assertImageDimensions(width, height)).toThrow();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ type: "image-too-large" });
  });
  it("does not alert for valid or invalid dimensions", () => {
    const listener = vi.fn(); unsubscribe = subscribePersistenceAlert(listener);
    assertImageDimensions(200, 100);
    expect(() => assertImageDimensions(0, 100)).toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
  it("alerts and releases an oversized imported bitmap", async () => {
    const close = vi.fn(), listener = vi.fn();
    unsubscribe = subscribePersistenceAlert(listener);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 9000, height: 10, close }));
    await expect(decodeBlobToBitmap(new Blob())).rejects.toMatchObject({ code: "image-too-large" });
    expect(close).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ type: "image-too-large" });
  });
  it("alerts when the cache refuses an oversized decoded image", async () => {
    const listener = vi.fn(); unsubscribe = subscribePersistenceAlert(listener);
    vi.stubGlobal("Image", class { naturalWidth = 9000; naturalHeight = 10; complete = true; });
    const cache = createBitmapCache();
    cache.get({ src: "data:image/png,test", width: 10, height: 10 });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ type: "image-too-large" }));
    cache.dispose();
  });
  it("routes guard refusals to the toast and unsubscribes cleanly", () => {
    const show = vi.fn();
    const stop = subscribeImageSizeNotice(show);
    expect(() => assertImageDimensions(9000, 1)).toThrow();
    expect(show).toHaveBeenCalledWith("app.imageTooLarge");
    stop();
    expect(() => assertImageDimensions(9000, 1)).toThrow();
    expect(show).toHaveBeenCalledOnce();
  });
  it.each(["en", "zh"])("provides translated toast text in %s", async locale => {
    await loadLocale(locale);
    expect(t("app.imageTooLarge")).not.toBe("app.imageTooLarge");
    const html = renderToStaticMarkup(React.createElement(ImageSizeMessage, { message: "app.imageTooLarge" }));
    expect(html).toContain('role="alert"');
    expect(html).toContain(t("app.imageTooLarge"));
  });
});
