import { describe, it, expect, vi } from "vitest";
import {
  IMAGE_GENERATION_ERROR,
  placeImageInEditor,
  runImageJob,
} from "../../src/canvas/agent/image_generation.js";

const noSleep = async () => {};

describe("runImageJob", () => {
  it("returns urls straight away when the provider completes synchronously", async () => {
    const submit = vi.fn(async () => ({ taskId: "t1", status: "completed", urls: ["https://x/a.png"] }));
    const fetch = vi.fn();
    const result = await runImageJob({ providerId: "p", request: {}, submit, fetch, sleep: noSleep });
    expect(result).toEqual({ taskId: "t1", urls: ["https://x/a.png"] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("polls a pending job until it completes", async () => {
    const submit = vi.fn(async () => ({ taskId: "t2", status: "processing" }));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "completed", urls: ["https://x/b.png"] });
    const result = await runImageJob({ providerId: "p", request: {}, submit, fetch, sleep: noSleep });
    expect(result.urls).toEqual(["https://x/b.png"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fails fast when the provider reports failure", async () => {
    const submit = vi.fn(async () => ({ taskId: "t3", status: "failed", error: "quota" }));
    await expect(
      runImageJob({ providerId: "p", request: {}, submit, fetch: vi.fn(), sleep: noSleep }),
    ).rejects.toMatchObject({ code: IMAGE_GENERATION_ERROR.FAILED });
  });

  it("times out instead of polling forever", async () => {
    const submit = vi.fn(async () => ({ taskId: "t4", status: "processing" }));
    const fetch = vi.fn(async () => ({ status: "processing" }));
    await expect(
      runImageJob({ providerId: "p", request: {}, submit, fetch, sleep: noSleep, maxPolls: 3 }),
    ).rejects.toMatchObject({ code: IMAGE_GENERATION_ERROR.TIMEOUT });
  });
});

describe("placeImageInEditor", () => {
  it("inserts the image through the live engine", async () => {
    const editor = { insertImage: vi.fn(async () => {}) };
    const result = await placeImageInEditor(editor, "https://x/c.png", { x: 1, y: 2 });
    expect(editor.insertImage).toHaveBeenCalledWith("https://x/c.png", { x: 1, y: 2 });
    expect(result.placed).toBe(true);
  });

  it("refuses to pretend when no editor is open", async () => {
    await expect(placeImageInEditor(null, "https://x/d.png")).rejects.toMatchObject({
      code: IMAGE_GENERATION_ERROR.NO_EDITOR,
    });
  });
});


describe("image generation cancellation", () => {
  it("stops polling immediately when cancelled during the wait", async () => {
    const controller = new AbortController();
    const fetch = vi.fn();
    let waiting;
    const asleep = new Promise((resolve) => { waiting = resolve; });
    const job = runImageJob({ providerId: "p", request: {}, signal: controller.signal,
      submit: async () => ({ taskId: "pending", status: "processing" }), fetch,
      sleep: () => { waiting(); return new Promise(() => {}); },
    });
    await asleep;
    controller.abort();
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores a provider result delivered after cancellation", async () => {
    const controller = new AbortController();
    let finish;
    const job = runImageJob({ providerId: "p", request: {}, signal: controller.signal,
      submit: () => new Promise((resolve) => { finish = resolve; }),
    });
    await Promise.resolve();
    controller.abort();
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    finish({ status: "completed", urls: ["late.png"] });
  });
});
