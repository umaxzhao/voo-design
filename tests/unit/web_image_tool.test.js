import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/canvas/agent/web_image_gen.js", () => ({
  generateImageWeb: vi.fn(),
  webImageStatusLine: (provider, stage) => `${provider}:${stage}`,
}));

import { generateImageWeb } from "../../src/canvas/agent/web_image_gen.js";
import { executeCanvasTool } from "../../src/canvas/agent/canvas_tools.js";

describe("generate_image_web tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.window = new EventTarget();
  });

  it("places each image through placeImage, offset horizontally", async () => {
    generateImageWeb.mockResolvedValue({
      ok: true,
      provider: "chatgpt",
      images: [
        { dataUrl: "data:image/png;base64,aaa", width: 100, height: 50 },
        { dataUrl: "data:image/png;base64,bbb", width: 100, height: 40 },
      ],
    });
    const inserted = [];
    const editor = {
      insertImage: vi.fn(async (url, point) => {
        const id = `layer-${inserted.length + 1}`;
        inserted.push({ id, url, point });
        return { id };
      }),
      updateNode: vi.fn(),
    };
    globalThis.window.__vooEditor = editor;

    const result = await executeCanvasTool("generate_image_web", {
      provider: "chatgpt",
      prompt: "two posters",
      count: 2,
      x: 10,
      y: 20,
      width: 100,
    });

    expect(result.layerIds).toEqual(["layer-1", "layer-2"]);
    expect(editor.insertImage).toHaveBeenNthCalledWith(1, "data:image/png;base64,aaa", { x: 10, y: 20 });
    expect(editor.insertImage).toHaveBeenNthCalledWith(2, "data:image/png;base64,bbb", { x: 134, y: 20 });
    expect(editor.updateNode).toHaveBeenCalledWith("layer-1", { width: 100, height: 50 });
    expect(editor.updateNode).toHaveBeenCalledWith("layer-2", { width: 100, height: 40 });
  });

  it("surfaces the desktop-app error when the bridge is missing", async () => {
    generateImageWeb.mockResolvedValue({
      ok: false,
      code: "needsDesktopApp",
      error: "Web image generation needs the VOO Design desktop app (Electron); it is not available in the browser build.",
    });
    globalThis.window.__vooEditor = { insertImage: vi.fn() };
    await expect(
      executeCanvasTool("generate_image_web", { provider: "gemini", prompt: "a lamp" }),
    ).rejects.toMatchObject({ code: "needsDesktopApp" });
  });
});
