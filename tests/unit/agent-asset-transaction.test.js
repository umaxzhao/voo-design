import { describe, expect, it, vi } from "vitest";
import { commitAssetExpansion } from "../../src/canvas/agent/agent-asset-transaction.js";
describe("asset expansion history boundary", () => {
  const setup = () => {
    let document = {
      nodes: [{
        id: "original"
      }]
    };
    const editor = {
      getDocument: () => document,
      getSelectedIds: () => ["original"],
      beginBatch: vi.fn(),
      endBatch: vi.fn(),
      selectExactly: vi.fn(),
      setDoc: vi.fn(next => {
        document = next;
      })
    };
    return {
      editor
    };
  };
  it("publishes one completed document after closing the batch", () => {
    const {
      editor
    } = setup();
    const value = commitAssetExpansion(editor, () => {
      editor.setDoc({
        nodes: [{
          id: "created"
        }]
      }, {
        commit: false
      });
      return "created";
    }, "Insert asset");
    expect(value).toBe("created");
    expect(editor.beginBatch).toHaveBeenCalledOnce();
    expect(editor.endBatch).toHaveBeenCalledOnce();
    expect(editor.setDoc).toHaveBeenLastCalledWith({
      nodes: [{
        id: "created"
      }]
    }, {
      name: "Insert asset"
    });
  });
  it("restores the document and selection on partial creation failure without a commit", () => {
    const {
      editor
    } = setup();
    expect(() => commitAssetExpansion(editor, () => {
      editor.setDoc({
        nodes: [{
          id: "partial"
        }]
      }, {
        commit: false
      });
      throw new Error("host failed");
    }, "Insert asset")).toThrow("host failed");
    expect(editor.getDocument()).toEqual({
      nodes: [{
        id: "original"
      }]
    });
    expect(editor.selectExactly).toHaveBeenCalledWith(["original"]);
    expect(editor.endBatch).toHaveBeenCalledOnce();
    expect(editor.setDoc.mock.calls.every(([, options]) => options.commit === false)).toBe(true);
  });
});
