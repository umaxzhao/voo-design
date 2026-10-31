import { describe, expect, it, beforeEach } from "vitest";
import {
  createVersionRecord,
  listVersions,
  loadVersion,
  deleteVersion,
} from "../../src/canvas/store/version_store.js";

describe("Document Version History Store", () => {
  const docId = "test-doc-123";

  it("creates, lists, and loads version records", async () => {
    const v1 = await createVersionRecord({
      documentId: docId,
      name: "Initial Draft",
      vooFile: { version: 1, document: { nodes: [1, 2] } },
      layerCount: 2,
      autoSave: false,
    });
    expect(v1).toBeDefined();
    expect(v1.id).toMatch(/^ver-/);
    expect(v1.name).toBe("Initial Draft");
    expect(v1.documentId).toBe(docId);

    const v2 = await createVersionRecord({
      documentId: docId,
      name: "After Redesign",
      vooFile: { version: 1, document: { nodes: [1, 2, 3] } },
      layerCount: 3,
      autoSave: false,
    });
    expect(v2).toBeDefined();

    const list = await listVersions(docId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    // Newest first
    expect(list[0].id).toBe(v2.id);
    expect(list[1].id).toBe(v1.id);

    const loaded = await loadVersion(v1.id);
    expect(loaded).toBeDefined();
    expect(loaded.name).toBe("Initial Draft");
    expect(loaded.layerCount).toBe(2);
  });

  it("deletes a version record", async () => {
    const v = await createVersionRecord({
      documentId: docId,
      name: "Temporary Version",
      vooFile: { version: 1, document: { nodes: [] } },
    });
    expect(v).toBeDefined();

    const before = await loadVersion(v.id);
    expect(before).toBeDefined();

    const ok = await deleteVersion(v.id);
    expect(ok).toBe(true);

    const after = await loadVersion(v.id);
    expect(after).toBeNull();
  });
});
