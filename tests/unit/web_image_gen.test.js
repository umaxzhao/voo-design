import { describe, expect, it, vi } from "vitest";
import {
  DESKTOP_REQUIRED_MESSAGE,
  generateImageWeb,
  webImageStatusLine,
} from "../../src/canvas/agent/web_image_gen.js";

describe("generateImageWeb", () => {
  it("tells the browser build that the desktop app is required", async () => {
    const result = await generateImageWeb(
      { provider: "chatgpt", prompt: "a chair" },
      { bridge: undefined },
    );
    expect(result).toEqual({
      ok: false,
      code: "needsDesktopApp",
      error: DESKTOP_REQUIRED_MESSAGE,
    });
  });

  it("forwards the job through the desktop bridge and reports progress", async () => {
    const listeners = new Set();
    const webImageGenerate = vi.fn(async () => {
      for (const listener of listeners) listener({ jobId: "job-9", stage: "generating", provider: "chatgpt" });
      return { ok: true, images: [{ dataUrl: "data:image/png;base64,x", width: 8, height: 8 }] };
    });
    const onProgress = vi.fn();
    const result = await generateImageWeb(
      { provider: "chatgpt", prompt: "a chair", count: 1 },
      {
        jobId: "job-9",
        onProgress,
        bridge: {
          webImageGenerate,
          onWebImageProgress: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
      },
    );
    expect(webImageGenerate).toHaveBeenCalledWith({
      provider: "chatgpt",
      prompt: "a chair",
      count: 1,
      jobId: "job-9",
    });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: "generating" }));
    expect(result.ok).toBe(true);
    expect(webImageStatusLine("chatgpt", "generating")).toBe("ChatGPT: generating…");
    expect(webImageStatusLine("chatgpt", "login_required")).toBe(
      "Please sign in to ChatGPT in the Chrome window",
    );
  });
});
