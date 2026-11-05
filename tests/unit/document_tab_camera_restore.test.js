import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { useDesignStore } from "../../src/store/design_store.js";
import { cameraFitDecision } from "../../src/canvas/components/editor_hooks/editor_camera_restore.js";

const store = () => useDesignStore.getState();
const initial = useDesignStore.getInitialState();

beforeEach(() => useDesignStore.setState(initial, true));

describe("document tab camera restore", () => {
  it("restores each tab's own camera and asks the canvas not to re-fit", () => {
    store().newVooProject({ label: "A" });
    const a = store().activeDocumentId;
    store().setEditorCamera({ panX: 123, panY: 456, zoom: 2.5 });

    store().newVooProject({ label: "B" });
    const b = store().activeDocumentId;
    store().setEditorCamera({ panX: -10, panY: 20, zoom: 0.5 });

    store().switchDocument(a);
    expect(store().editorCamera).toEqual({ panX: 123, panY: 456, zoom: 2.5 });
    expect(store().pendingEditorCameraRestore).toBe(true);

    store().switchDocument(b);
    expect(store().editorCamera).toEqual({ panX: -10, panY: 20, zoom: 0.5 });
    expect(store().pendingEditorCameraRestore).toBe(true);
  });

  it("does not leak a restore request into a newly opened document", () => {
    store().newVooProject({ label: "A" });
    const a = store().activeDocumentId;
    store().newVooProject({ label: "B" });
    store().switchDocument(a);
    expect(store().pendingEditorCameraRestore).toBe(true);
    store().newVooProject({ label: "C" });
    expect(store().pendingEditorCameraRestore).toBe(false);
  });

  it("keeps a restored camera instead of the first-open fit", () => {
    const signature = "page-a|page-b";
    expect(cameraFitDecision({ pendingRestore: true, fittedSignature: signature, signature })).toBe("restore");
    expect(cameraFitDecision({ pendingRestore: false, fittedSignature: signature, signature })).toBe("skip");
    expect(cameraFitDecision({ pendingRestore: false, fittedSignature: "other", signature })).toBe("fit");
    expect(cameraFitDecision({ pendingRestore: false, fittedSignature: null, signature })).toBe("fit");
  });

  it("wires the restore decision into the shared camera before fitAll", () => {
    const source = readFileSync(
      new URL("../../src/canvas/components/editor_hooks/use_editor_shared_camera.js", import.meta.url),
      "utf8",
    );
    expect(source).toContain("cameraFitDecision({");
    expect(source).toContain("pendingEditorCameraRestore: false");
    expect(source.indexOf('decision === "restore"')).toBeLessThan(source.indexOf("fitAll();"));
  });
});
