import { describe, it, expect, vi, afterEach } from "vitest";
import { resourceCopies, selectionResource, insertComponentResource } from "../../src/canvas/resources/resource_nodes.js";
import { decodeResource, isolateResourceAssets, saveWorkspaceResource } from "../../src/canvas/resources/workspace_resources.js";
import { createDocument } from "../../src/canvas/editor/scene_doc_factory.js";

import { workspaceStorage } from "../../src/services/workspace_storage.js";

afterEach(() => vi.restoreAllMocks());
describe("workspace resource isolation", () => {
  const doc = { ...createDocument(500, 400, "#fff"), nodes: [
    { id: "frame", kind: "group", isFrame: true, x: -50, y: 20, width: 200, height: 100 },
    { id: "child", kind: "rect", parentId: "frame", x: -40, y: 30, width: 20, height: 20, effects: { shadow: { blur: 4 } } },
    { id: "other", kind: "rect", x: 300, y: 0, width: 50, height: 50 },
  ] };
  it("saves a complete selection subtree and severs external ancestry", () => {
    expect(selectionResource(doc, ["frame"]).nodes.map(n => n.id)).toEqual(["frame", "child"]);
    expect(selectionResource(doc, ["child"]).nodes[0].parentId).toBeNull();
  });
  it("inserts independent IDs with internal parents and signed relative geometry", () => {
    const before = structuredClone(doc);
    const copies = resourceCopies(selectionResource(doc, ["frame"]), { x: 600, y: 0 }, "Card");
    expect(copies.map(n => n.id)).not.toContain("frame");
    expect(copies[1].parentId).toBe(copies[0].id);
    expect([copies[1].x, copies[1].y]).toEqual([610, 10]);
    copies[1].effects.shadow.blur = 99;
    expect(doc).toEqual(before);
  });
  it("isolates bitmap identifiers from existing files before hydration", () => {
    const source = { document: { nodes: [{ imageId: "same-id", maskId: "same-mask" }] }, images: { "same-id": "data:image/png;base64,AA==", "same-mask": "data:image/png;base64,AQ==" } };
    const copy = isolateResourceAssets(source);
    expect(copy.document.nodes[0].imageId).not.toBe("same-id");
    expect(copy.images[copy.document.nodes[0].imageId]).toBe(source.images["same-id"]);
    expect(source.document.nodes[0].imageId).toBe("same-id");
  });
  it("rejects component cycles before changing the host document", () => {
    const host = { canvasId: "host", nodes: [] };
    const source = { canvasId: "source", nodes: [{kind:"canvasInstance",sourceCanvasId:"host"}] };
    expect(() => insertComponentResource({getDocument:()=>host}, {id:"source"}, source, {x:0,y:0})).toThrow("resource-component-cycle");
    expect(host.nodes).toEqual([]);
  });
  it("moves root-written native files into the shared Resources folder", async () => {
    vi.spyOn(workspaceStorage, "listFolders").mockResolvedValue([{name:"Resources"}]);
    vi.spyOn(workspaceStorage, "writeFileBytes").mockResolvedValue({ok:true,id:"Native.voo",path:"/workspace/Native.voo"});
    const move = vi.spyOn(workspaceStorage, "moveToFolder").mockResolvedValue({ok:true,file:{id:"Resources/Native.voo"}});
    const result = await saveWorkspaceResource({format:"voo",version:1,document:doc,images:{}},"Native");
    expect(move).toHaveBeenCalledWith("/workspace/Native.voo","Resources");
    expect(result.folder).toBe("Resources");
  });
  it("rejects empty or invalid .voo envelopes rather than inserting blank content", () => {
    expect(() => decodeResource(new TextEncoder().encode('{}'))).toThrow();
    expect(() => resourceCopies({ nodes: [] }, { x: 0, y: 0 })).toThrow();
    expect(() => selectionResource(doc, [])).toThrow();
  });
});
