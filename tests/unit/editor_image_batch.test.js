import { describe, expect, it, vi } from "vitest";
import { importEditorImageBatch } from "../../src/canvas/components/editor_image_batch.js";
function fixture() {
  let document = {
    nodes: [{
      id: "original"
    }]
  };
  const engine = {
    getDocument: () => document,
    getSelectedIds: () => ["original"],
    beginBatch: vi.fn(),
    endBatch: vi.fn(),
    selectExactly: vi.fn(),
    setDoc: vi.fn(next => {
      document = next;
    }),
    prepareImageInsertion: vi.fn(async file => ({
      imageId: file.name
    })),
    prepareSvgInsertion: vi.fn(async text => ({
      text
    })),
    insertPreparedImages: vi.fn(([{
      prepared
    }]) => {
      const node = {
        id: prepared.imageId
      };
      document = {
        nodes: [...document.nodes, node]
      };
      return [node];
    }),
    insertPreparedSvg: vi.fn(() => {
      const node = {
        id: "vector"
      };
      document = {
        nodes: [...document.nodes, node]
      };
      return [node];
    })
  };
  return engine;
}
describe("image file batch publication", () => {
  it("does not capture intervening edits while decoding and commits one mixed batch", async () => {
    const engine = fixture();
    let resolve;
    engine.prepareImageInsertion.mockReturnValueOnce(new Promise(done => {
      resolve = done;
    }));
    const pending = importEditorImageBatch(engine, [{
      name: "Photo.png",
      type: "image/png"
    }, {
      name: "Icon.svg",
      type: "image/svg+xml",
      text: async () => "<svg/>"
    }]);
    expect(engine.beginBatch).not.toHaveBeenCalled();
    engine.setDoc({
      nodes: [{
        id: "original"
      }, {
        id: "concurrent"
      }]
    });
    resolve({
      imageId: "photo"
    });
    await pending;
    expect(engine.getDocument().nodes.map(node => node.id)).toEqual(["original", "concurrent", "photo", "vector"]);
    expect(engine.beginBatch).toHaveBeenCalledOnce();
    expect(engine.endBatch).toHaveBeenCalledOnce();
    expect(engine.setDoc).toHaveBeenLastCalledWith(engine.getDocument(), {
      name: "editor.layer.add"
    });
  });
  it("leaves document and history untouched if any image fails decoding", async () => {
    const engine = fixture();
    engine.prepareImageInsertion.mockResolvedValueOnce({
      imageId: "valid"
    }).mockRejectedValueOnce(new Error("decode failed"));
    await expect(importEditorImageBatch(engine, [{
      name: "Valid.png"
    }, {
      name: "Broken.png"
    }])).rejects.toThrow("decode failed");
    expect(engine.getDocument().nodes).toEqual([{
      id: "original"
    }]);
    expect(engine.beginBatch).not.toHaveBeenCalled();
    expect(engine.insertPreparedImages).not.toHaveBeenCalled();
  });
  it("rolls back synchronous publication failures without undoing earlier user edits", async () => {
    const engine = fixture();
    engine.insertPreparedImages.mockImplementationOnce(() => {
      throw new Error("publish failed");
    });
    await expect(importEditorImageBatch(engine, [{
      name: "Photo.png"
    }])).rejects.toThrow("publish failed");
    expect(engine.getDocument().nodes).toEqual([{
      id: "original"
    }]);
    expect(engine.endBatch).toHaveBeenCalledOnce();
    expect(engine.setDoc).toHaveBeenLastCalledWith(engine.getDocument(), {
      commit: false
    });
  });
});
