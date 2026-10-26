import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/canvas/agent/image_generation.js", () => ({
  runImageJob: vi.fn(async () => ({ taskId: "task-1", urls: ["https://cdn.example.com/edited.png"] })),
}));

import { editImage } from "../../src/canvas/agent/canvas_tools_assets.js";
import { runImageJob } from "../../src/canvas/agent/image_generation.js";
import { setSetting } from "../../src/shared/settings.js";

const IMAGE_NODE = {
  id: "img",
  kind: "image",
  name: "Portrait",
  src: "https://cdn.example.com/source.jpg",
  x: 40,
  y: 60,
  width: 320,
  height: 400,
};

function installEditor(nodes = [IMAGE_NODE]) {
  const updated = [];
  globalThis.window = globalThis.window ?? {};
  globalThis.window.__vooEditor = {
    getDoc: () => ({ nodes }),
    insertImage: async (url) => ({ id: "edited-image", url }),
    updateNode: (id, patch) => updated.push({ id, patch }),
    commitEditorDocument: () => {},
  };
  return updated;
}

describe("edit_image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSetting("agent.imageProviderId", "dashscope");
    setSetting("agent.imageModelId", "qwen-image-edit");
  });
  afterEach(() => {
    if (globalThis.window) delete globalThis.window.__vooEditor;
  });

  it("submits a transparent-background edit and places the result", async () => {
    const updated = installEditor();
    const result = await editImage({ operation: "remove-background", layerId: "img" });
    expect(result).toMatchObject({ ok: true, layerId: "edited-image", operation: "remove-background", sourceLayerId: "img" });
    expect(runImageJob).toHaveBeenCalledTimes(1);
    const call = runImageJob.mock.calls[0][0];
    expect(call.providerId).toBe("dashscope");
    expect(call.request).toMatchObject({
      model: "qwen-image-edit",
      images: ["https://cdn.example.com/source.jpg"],
      background: "transparent",
      output_format: "png",
    });
    expect(updated.some((entry) => entry.patch.x > IMAGE_NODE.x)).toBe(true);
  });

  it("requires a prompt for background replacement", async () => {
    installEditor();
    await expect(editImage({ operation: "replace-background", layerId: "img" })).rejects.toMatchObject({
      code: "agentInvalidArgs",
    });
    expect(runImageJob).not.toHaveBeenCalled();
  });

  it("passes the replacement prompt to the provider", async () => {
    installEditor();
    await editImage({ operation: "replace-background", layerId: "img", prompt: "On a wet slate slab" });
    expect(runImageJob.mock.calls[0][0].request.prompt).toContain("wet slate");
    expect(runImageJob.mock.calls[0][0].request.background).toBeUndefined();
  });

  it("rejects a non-http source image", async () => {
    installEditor([{ ...IMAGE_NODE, src: "data:image/png;base64,xx" }]);
    await expect(editImage({ operation: "remove-background", layerId: "img" })).rejects.toMatchObject({
      code: "agentImageSourceRequired",
    });
    expect(runImageJob).not.toHaveBeenCalled();
  });

  it("reports a missing image provider", async () => {
    installEditor();
    setSetting("agent.imageProviderId", "");
    setSetting("agent.imageModelId", "");
    await expect(editImage({ operation: "remove-background", layerId: "img" })).rejects.toMatchObject({
      code: "agentNoImageModel",
    });
  });

  it("rejects an unknown operation", async () => {
    installEditor();
    await expect(editImage({ operation: "recolor", layerId: "img" })).rejects.toMatchObject({
      code: "agentInvalidArgs",
    });
  });
});
