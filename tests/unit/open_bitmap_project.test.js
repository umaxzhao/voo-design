import { describe, expect, it, vi } from "vitest";
import {
  openBitmapAsProject,
  waitForEditorEngine,
} from "../../src/canvas/components/welcome_dashboard/open_bitmap.js";

describe("bitmap import from the welcome screen", () => {
  it("creates one document and places the picture on its canvas", async () => {
    const insertImage = vi.fn(async () => ({ id: "img-layer" }));
    const store = { newVooProject: vi.fn() };
    const setWelcomeOpen = vi.fn();
    const host = { __vooEditor: { insertImage } };

    const file = await openBitmapAsProject({
      store,
      bytes: new Uint8Array([1, 2, 3]),
      name: "Holiday Photo.png",
      setWelcomeOpen,
      host,
    });

    expect(store.newVooProject).toHaveBeenCalledWith({ label: "Holiday Photo" });
    expect(setWelcomeOpen).toHaveBeenCalledWith(false);
    expect(insertImage).toHaveBeenCalledOnce();
    expect(insertImage.mock.calls[0][0]).toBe(file);
    expect(file.name).toBe("Holiday Photo.png");
    expect(file.type).toBe("image/png");
  });

  it("returns the engine only once it can place an image", async () => {
    const engine = { insertImage: vi.fn() };
    await expect(waitForEditorEngine({ host: { __vooEditor: engine } })).resolves.toBe(engine);
  });

  it("fails clearly when the new document never mounts", async () => {
    const store = { newVooProject: vi.fn() };
    await expect(openBitmapAsProject({
      store,
      bytes: new Uint8Array([1]),
      name: "photo.jpg",
      setWelcomeOpen: vi.fn(),
      host: {},
      timeoutMs: 0,
    })).rejects.toThrow("editor-not-ready");
  });
});
