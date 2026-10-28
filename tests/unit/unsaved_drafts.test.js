import { describe, it, expect, vi, beforeEach } from "vitest";

const openVooProject = vi.fn();
const readFileBytes = vi.fn();
const loadDraftBytes = vi.fn();
const setFileName = vi.fn();

vi.mock("../../src/canvas/store/project_io.js", () => ({
  openVooProject: (...a) => openVooProject(...a),
  buildVooFile: vi.fn(),
}));
vi.mock("../../src/canvas/store/open-project.js", () => ({
  openVooProject: (...a) => openVooProject(...a),
}));
vi.mock("../../src/services/workspace_storage.js", () => ({
  workspaceStorage: { readFileBytes: (...a) => readFileBytes(...a) },
}));
vi.mock("../../src/canvas/store/draft_store.js", async (importOriginal) => ({
  ...(await importOriginal()),
  loadDraftBytes: (...a) => loadDraftBytes(...a),
}));
vi.mock("../../src/store/design_store.js", () => ({
  useDesignStore: { getState: () => ({ setFileName }) },
}));

const { openRecentItem, DRAFT_MISSING_KEY, OPEN_FAILED_KEY } = await import(
  "../../src/canvas/components/welcome_dashboard/open_recent.js"
);
const draftStore = await vi.importActual("../../src/canvas/store/draft_store.js");
const { createDraftAutosaver } = await import("../../src/canvas/store/draft_autosave.js");
const en = (await import("../../src/shared/i18n/welcome-en.js")).default;
const zh = (await import("../../src/shared/i18n/welcome-zh.js")).default;

const BYTES = new Uint8Array([1, 2, 3]);

describe("draft_store without IndexedDB", () => {
  it("never throws and reports failure through its return values", async () => {
    expect(typeof indexedDB).toBe("undefined");
    expect(await draftStore.saveDraftBytes("d1", BYTES, "A.voo")).toBe(false);
    expect(await draftStore.loadDraftBytes("d1")).toBeNull();
    expect(await draftStore.deleteDraft("d1")).toBe(false);
  });

  it("ignores calls without an id or bytes", async () => {
    expect(await draftStore.saveDraftBytes("", BYTES, "A.voo")).toBe(false);
    expect(await draftStore.saveDraftBytes("d1", null, "A.voo")).toBe(false);
    expect(await draftStore.loadDraftBytes("")).toBeNull();
  });
});

describe("openRecentItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reports draftMissing and never opens the file picker when no copy exists", async () => {
    readFileBytes.mockRejectedValue(new Error("not found"));
    loadDraftBytes.mockResolvedValue(null);
    const result = await openRecentItem({ id: "voo_doc_1", name: "Gone.voo", path: null });
    expect(result).toEqual({ ok: false, key: DRAFT_MISSING_KEY, reason: "" });
    expect(openVooProject).not.toHaveBeenCalled();
  });

  it("opens the stored draft copy when the workspace has no such file", async () => {
    readFileBytes.mockRejectedValue(new Error("not found"));
    loadDraftBytes.mockResolvedValue({ bytes: BYTES, name: "Kept.voo" });
    openVooProject.mockResolvedValue({ success: true });
    const result = await openRecentItem({ id: "voo_doc_2", name: "Kept.voo", path: null });
    expect(result).toEqual({ ok: true });
    const call = openVooProject.mock.calls[0][0];
    expect(call.fileOrPath).toBeInstanceOf(File);
    expect(call.fileOrPath.name).toBe("Kept.voo");
    expect(setFileName).toHaveBeenCalledWith("Kept.voo");
  });

  it("prefers the workspace file over the draft copy", async () => {
    readFileBytes.mockResolvedValue(BYTES);
    openVooProject.mockResolvedValue({ success: true });
    expect((await openRecentItem({ id: "w1", name: "W.voo", path: null })).ok).toBe(true);
    expect(loadDraftBytes).toHaveBeenCalledWith("w1");
  });

  it("opens a newer autosave before the older workspace copy", async () => {
    readFileBytes.mockResolvedValue(BYTES);
    loadDraftBytes.mockResolvedValue({ bytes: BYTES, name: "W.voo", savedAt: 200 });
    openVooProject.mockResolvedValue({ success: true });
    expect((await openRecentItem({ id: "w1", name: "W.voo", path: null, updatedAt: 100 })).ok).toBe(true);
    expect(readFileBytes).not.toHaveBeenCalled();
    expect(openVooProject).toHaveBeenCalledOnce();
  });

  it("shows openFailed with the reason when opening returns success:false", async () => {
    readFileBytes.mockResolvedValue(BYTES);
    openVooProject.mockResolvedValue({ success: false, error: "Invalid .voo file format" });
    const result = await openRecentItem({ id: "w2", name: "Bad.voo", path: null });
    expect(result).toEqual({ ok: false, key: OPEN_FAILED_KEY, reason: "Invalid .voo file format" });
  });

  it("shows openFailed when opening by path throws", async () => {
    openVooProject.mockRejectedValue(new Error("EACCES"));
    const result = await openRecentItem({ id: "p1", name: "P.voo", path: "/tmp/P.voo" });
    expect(result).toEqual({ ok: false, key: OPEN_FAILED_KEY, reason: "EACCES" });
    expect(openVooProject.mock.calls[0][0].fileOrPath).toBe("/tmp/P.voo");
  });

  it("treats a canceled path open as a failure the user can see", async () => {
    openVooProject.mockResolvedValue({ canceled: true });
    const result = await openRecentItem({ id: "p2", name: "P.voo", path: "/tmp/P.voo" });
    expect(result.ok).toBe(false);
    expect(result.key).toBe(OPEN_FAILED_KEY);
  });
});

describe("createDraftAutosaver", () => {
  function makeTimers() {
    const timers = [];
    return {
      timers,
      setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
      clearTimer: (id) => {
        timers[id - 1].fn = null;
      },
    };
  }

  it("writes once, 1.5 s after the last change", () => {
    const { timers, setTimer, clearTimer } = makeTimers();
    const write = vi.fn();
    const saver = createDraftAutosaver({ write, setTimer, clearTimer });
    saver.notify();
    saver.notify();
    expect(timers.map((t) => t.ms)).toEqual([1500, 1500]);
    timers.forEach((t) => t.fn?.());
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("cancel drops a pending write", () => {
    const { timers, setTimer, clearTimer } = makeTimers();
    const write = vi.fn();
    const saver = createDraftAutosaver({ write, setTimer, clearTimer });
    saver.notify();
    saver.cancel();
    timers.forEach((t) => t.fn?.());
    expect(write).not.toHaveBeenCalled();
  });
});

describe("i18n keys", () => {
  it("exist in both locales, with the reason placeholder on openFailed", () => {
    for (const locale of [en, zh]) {
      expect(locale["welcome.recent.openFailed"]).toContain("{reason}");
      expect(locale["welcome.recent.draftMissing"]).toBeTruthy();
    }
    expect(en["welcome.recent.draftMissing"]).toBe("This unsaved draft is no longer available.");
    expect(zh["welcome.recent.draftMissing"]).toBe("此未保存草稿已不可用。");
  });
});
