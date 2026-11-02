import { describe, expect, it, vi } from "vitest";
import { BG, EVENTS } from "../../src/shared/messages.js";
import { createWebImageService } from "../../electron/web_image_service.js";

function harness({ linked = true, route, ensureChrome } = {}) {
  const relays = new Set();
  const progress = [];
  let clock = 0;
  const bridge = {
    linked,
    route: route ?? (async () => {}),
  };
  const service = createWebImageService({
    ensureChrome: ensureChrome ?? (async () => ({ executable: "/chrome", args: ["https://chatgpt.com/"] })),
    bridge,
    subscribeRelay: (listener) => {
      relays.add(listener);
      return () => relays.delete(listener);
    },
    sleep: async () => {
      clock += 50;
    },
    now: () => clock,
    onProgress: (event) => progress.push(event),
    linkWaitMs: 200,
    loginWaitMs: 100,
  });
  return {
    service,
    progress,
    emit(name, payload) {
      for (const listener of relays) listener(name, payload);
    },
  };
}

const image = { dataUrl: "data:image/png;base64,aaa", width: 512, height: 512, mimeType: "image/png" };

describe("createWebImageService", () => {
  it("launches Chrome, routes the job, and returns relayed images", async () => {
    const ensureChrome = vi.fn(async () => ({ args: ["https://chatgpt.com/"] }));
    let emit = () => {};
    const route = vi.fn(async () => {
      emit(BG.PLATFORM_JOB_DONE, { jobId: "job-1", ok: true, result: { images: [image] } });
    });
    const box = harness({ ensureChrome, route });
    emit = box.emit;
    const result = await box.service.generate({
      provider: "chatgpt",
      prompt: "a red bicycle",
      count: 1,
      jobId: "job-1",
      timeoutMs: 500,
    });
    expect(ensureChrome).toHaveBeenCalledWith({ url: "https://chatgpt.com/" });
    expect(route).toHaveBeenCalledWith(expect.objectContaining({ platform: "chatgpt", jobId: "job-1" }));
    expect(result.images).toEqual([image]);
    expect(box.progress.map((event) => event.stage)).toEqual([
      "launching",
      "opening",
      "submitting",
      "generating",
      "done",
    ]);
  });

  it("reports loginRequired and keeps the failure on the progress stream", async () => {
    let emit = () => {};
    const box = harness({
      route: async () => {
        emit(EVENTS.RUN_PROGRESS, { jobId: "job-login", stage: "login_required" });
        emit(BG.PLATFORM_JOB_DONE, { jobId: "job-login", ok: false, error: "loginRequired" });
      },
    });
    emit = box.emit;
    await expect(
      box.service.generate({ provider: "gemini", prompt: "a poster", jobId: "job-login", timeoutMs: 500 }),
    ).rejects.toMatchObject({ code: "loginRequired" });
    expect(box.progress.some((event) => event.stage === "login_required")).toBe(true);
    expect(box.progress.at(-1)).toMatchObject({ stage: "error", error: "loginRequired" });
  });

  it("times out when the extension never sends a result", async () => {
    const { service } = harness();
    await expect(
      service.generate({ provider: "chatgpt", prompt: "slow", jobId: "job-slow", timeoutMs: 40 }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports noImages when the page finishes empty", async () => {
    let emit = () => {};
    const box = harness({
      route: async () => {
        emit(BG.PLATFORM_JOB_DONE, { jobId: "job-empty", ok: true, result: { images: [] } });
      },
    });
    emit = box.emit;
    await expect(
      box.service.generate({ provider: "chatgpt", prompt: "nothing", jobId: "job-empty", timeoutMs: 500 }),
    ).rejects.toMatchObject({ code: "noImages" });
  });

  it("reports extensionNotLinked without routing a job", async () => {
    const route = vi.fn();
    const { service } = harness({ linked: false, route });
    await expect(
      service.generate({ provider: "chatgpt", prompt: "hi", jobId: "job-off" }),
    ).rejects.toMatchObject({ code: "extensionNotLinked" });
    expect(route).not.toHaveBeenCalled();
  });
});
