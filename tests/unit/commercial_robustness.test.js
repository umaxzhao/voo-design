import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  checkImageDimensions,
  MAX_DECODE_PIXELS,
  MAX_DECODE_DIMENSION,
} from "../../src/shared/image_size_guard.js";
import {
  captureError,
  clearDiagnostics,
  getDiagnosticSnapshot,
  installGlobalErrorHandlers,
} from "../../src/shared/error_collector.js";
import {
  saveCrashDraft,
  loadCrashDraft,
  clearCrashDraft,
  hasNewerCrashDraft,
} from "../../src/shared/crash_recovery.js";

describe("image_size_guard", () => {
  it("accepts ordinary dimensions", () => {
    expect(checkImageDimensions(1920, 1080).ok).toBe(true);
  });

  it("rejects oversize dimensions and megapixel budgets", () => {
    expect(checkImageDimensions(MAX_DECODE_DIMENSION + 1, 100).ok).toBe(false);
    const side = Math.ceil(Math.sqrt(MAX_DECODE_PIXELS)) + 1;
    expect(checkImageDimensions(side, side).ok).toBe(false);
    expect(checkImageDimensions(0, 10).code).toBe("image-invalid-size");
  });
});

describe("installGlobalErrorHandlers", () => {
  beforeEach(() => clearDiagnostics());
  afterEach(() => clearDiagnostics());

  it("captures unhandledrejection into the collector", () => {
    const target = new EventTarget();
    const dispose = installGlobalErrorHandlers(target);
    const event = new Event("unhandledrejection");
    Object.defineProperty(event, "reason", {
      value: new Error("boom-reject"),
    });
    target.dispatchEvent(event);
    const snap = getDiagnosticSnapshot();
    expect(snap.errors.some((e) => e.source === "unhandledrejection")).toBe(
      true,
    );
    dispose();
  });

  it("captureError remains sanitizing", () => {
    captureError({
      error: new Error('token=sk-abcdefghijklmnopqrst key="/Users/alice/secret"'),
      source: "test",
    });
    const msg = getDiagnosticSnapshot().errors.at(-1)?.message ?? "";
    expect(msg).not.toMatch(/sk-abcdefghijklmnop/);
    expect(msg).not.toMatch(/\/Users\/alice/);
  });
});

describe("crash_recovery", () => {
  const id = "doc-test-1";

  beforeEach(async () => {
    await clearCrashDraft(id);
  });

  afterEach(async () => {
    await clearCrashDraft(id);
  });

  it("round-trips a structure-only draft via localStorage fallback", async () => {
    const ok = await saveCrashDraft(
      id,
      { canvasId: id, nodes: [{ id: "n1", type: "rect" }] },
      { label: "unit" },
    );
    expect(ok).toBe(true);
    const draft = await loadCrashDraft(id);
    expect(draft?.document?.nodes?.[0]?.id).toBe("n1");
    expect(await hasNewerCrashDraft(id, 0)).toBe(true);
    expect(await hasNewerCrashDraft(id, Date.now() + 10_000)).toBe(false);
  });
});
