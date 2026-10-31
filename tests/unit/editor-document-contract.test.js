import { describe, expect, it } from "vitest";

import {
  EDITOR_DOCUMENT_INVARIANTS,
  EditorSnapshotContractError,
  validateDocumentReferences,
  validateEditorDocumentSnapshot,
  verifyEditorHistoryInvariants,
} from "../../src/shared/editor-document-contract.js";

const validSnapshot = {
  doc: {
    version: 2,
    width: 1440,
    height: 900,
    backgroundColor: "#ffffff",
    nodes: [],
  },
  pixelSelection: null,
};

const node = (id, extra = {}) => ({ id, kind: "rect", x: 0, y: 0, width: 10, height: 10, ...extra });

describe("validateEditorDocumentSnapshot", () => {
  it("accepts a complete design snapshot", () => {
    const result = validateEditorDocumentSnapshot("design", validSnapshot);
    expect(result).toEqual({ valid: true, domain: "design", missingFields: [], errors: [] });
    // Also accepts a JSON string, the shape history snapshots are stored in.
    expect(validateEditorDocumentSnapshot("design", JSON.stringify(validSnapshot)).valid).toBe(true);
  });

  it("throws for a snapshot missing required fields", () => {
    const missing = { doc: { nodes: [] } };
    expect(() => validateEditorDocumentSnapshot("design", missing)).toThrow(EditorSnapshotContractError);
    try {
      validateEditorDocumentSnapshot("design", missing);
    } catch (error) {
      expect(error.name).toBe("EditorSnapshotContractError");
      expect(error.domain).toBe("design");
      expect(error.missingFields).toEqual(
        expect.arrayContaining(["pixelSelection", "doc.version", "doc.width", "doc.height", "doc.backgroundColor"]),
      );
    }
  });

  it("reports the same violation without throwing when asked", () => {
    const result = validateEditorDocumentSnapshot("design", { doc: { nodes: {} } }, { throwIfInvalid: false });
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("pixelSelection");
    expect(result.errors).toContain("doc.nodes must be an Array");
  });

  it("rejects malformed snapshots and unknown domains", () => {
    expect(() => validateEditorDocumentSnapshot("design", "{not json")).toThrow(EditorSnapshotContractError);
    expect(validateEditorDocumentSnapshot("design", null, { throwIfInvalid: false }).valid).toBe(false);
    expect(() => validateEditorDocumentSnapshot("motion", validSnapshot)).toThrow(TypeError);
  });
});

describe("validateDocumentReferences", () => {
  it("accepts a well-formed tree with a clipped follower", () => {
    const doc = {
      nodes: [
        node("frame"),
        node("a", { parentId: "frame" }),
        node("b", { parentId: "frame", clipTo: "a" }),
      ],
    };
    expect(validateDocumentReferences(doc)).toEqual({ valid: true, errors: [] });
    expect(validateDocumentReferences(doc, { throwIfInvalid: true }).valid).toBe(true);
  });

  it("reports an orphaned parentId", () => {
    const result = validateDocumentReferences({ nodes: [node("a", { parentId: "missing" })] });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain('node "a" parentId "missing" does not exist');
  });

  it("reports an orphaned clipTo", () => {
    const result = validateDocumentReferences({ nodes: [node("a"), node("b", { clipTo: "gone" })] });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain('node "b" clipTo "gone" does not exist');
  });

  it("detects a cyclic parentId chain", () => {
    const result = validateDocumentReferences({
      nodes: [
        node("a", { parentId: "c" }),
        node("b", { parentId: "a" }),
        node("c", { parentId: "b" }),
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("parentId chain is cyclic");
    expect(result.errors.join("\n")).toContain("a → c → b → a");
  });

  it("detects a node parented to itself", () => {
    const result = validateDocumentReferences({ nodes: [node("self", { parentId: "self" })] });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("self → self");
  });

  it("reports duplicate ids, and rejects malformed documents", () => {
    const duplicates = validateDocumentReferences({ nodes: [node("a"), node("a")] });
    expect(duplicates.valid).toBe(false);
    expect(duplicates.errors.join("\n")).toContain('duplicate node id "a"');

    expect(validateDocumentReferences(null).valid).toBe(false);
    expect(validateDocumentReferences({ nodes: "no" }).valid).toBe(false);
    expect(validateDocumentReferences({ nodes: [null] }).valid).toBe(false);
  });

  it("throws a contract error when throwIfInvalid is set", () => {
    const doc = { nodes: [node("a", { parentId: "missing" })] };
    expect(() => validateDocumentReferences(doc, { throwIfInvalid: true })).toThrow(EditorSnapshotContractError);
    try {
      validateDocumentReferences(doc, { throwIfInvalid: true });
    } catch (error) {
      expect(error.domain).toBe("references");
      expect(error.errors.join("\n")).toContain("parentId");
    }
  });
});

describe("verifyEditorHistoryInvariants", () => {
  it("rejects an in-flight depth change", () => {
    expect(() =>
      verifyEditorHistoryInvariants({ initialDepth: 3, inFlightDepth: 4, finalDepth: 4, changed: true }),
    ).toThrow(EDITOR_DOCUMENT_INVARIANTS.INTERMEDIATE_ZERO_COMMIT.id);
  });

  it("rejects a final depth change for a cancelled or unchanged gesture", () => {
    expect(() =>
      verifyEditorHistoryInvariants({ initialDepth: 3, inFlightDepth: 3, finalDepth: 4, changed: false }),
    ).toThrow(EDITOR_DOCUMENT_INVARIANTS.GESTURE_FINAL_COMMIT.id);
    expect(() =>
      verifyEditorHistoryInvariants({ initialDepth: 3, inFlightDepth: 3, finalDepth: 3, changed: true, cancelled: true }),
    ).not.toThrow();
  });

  it("lands exactly one history entry for a completed change", () => {
    expect(
      verifyEditorHistoryInvariants({ initialDepth: 3, inFlightDepth: 3, finalDepth: 4, changed: true }),
    ).toBe(true);
    expect(() =>
      verifyEditorHistoryInvariants({ initialDepth: 3, inFlightDepth: 3, finalDepth: 5, changed: true }),
    ).toThrow(EDITOR_DOCUMENT_INVARIANTS.GESTURE_FINAL_COMMIT.id);
  });
});
