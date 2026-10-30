import { describe, expect, it, vi } from "vitest";
import { duplicateNode } from "../../src/canvas/editor/doc_ops_nodes.js";
import { createClipboard } from "../../src/canvas/editor/editor_clipboard.js";
import { createHistory } from "../../src/canvas/editor/editor_history.js";

const shape = (id, patch = {}) => ({ id, kind: "rect", x: 40, y: 40,
  width: 80, height: 60, fill: "#ff0000", visible: true, ...patch });
const fixture = () => ({ width: 800, height: 600, nodes: [
  shape("frame", { kind: "group", isFrame: true, width: 240, height: 200,
    fills: [{ fill: "#ffffff", opacity: 1, visible: true }] }),
  shape("group", { kind: "group", parentId: "frame", x: 60, y: 70 }),
  shape("mask", { parentId: "group", x: 65, y: 75 }),
  shape("path", { kind: "path", parentId: "group", x: 70, y: 80, clipTo: "mask",
    points: [{ x: 0, y: 0, in: [1, 2], out: [3, 4] }],
    effects: [{ type: "shadow", offset: { x: 2, y: 3 } }],
    fills: [{ fill: "#123456", opacity: 1 }],
    instance: { componentId: "external-master", overrides: { child: { text: "Copy" } } } }),
  shape("hidden", { parentId: "frame", visible: false, locked: true }),
  shape("sibling", { x: 400 }),
] });

function clipboardFixture(doc) {
  let current = doc, selected = ["frame"];
  const setDoc = vi.fn((next) => { current = next; });
  const clipboard = createClipboard({ getDoc: () => current, setDoc,
    selection: { getIds: () => selected }, selectMany: ids => { selected = ids; },
    getPixelSelection: () => null, layerFromSelection: vi.fn() });
  return { clipboard, setDoc, doc: () => current, ids: () => selected };
}

describe("complete Frame duplication", () => {
  it("duplicates a nested subtree in source paint order and remaps internal clip links", () => {
    const doc = fixture(), before = JSON.stringify(doc);
    const result = duplicateNode(doc, "frame", 20);
    const copies = result.doc.nodes.filter(node => !doc.nodes.some(source => source.id === node.id));
    expect(copies).toHaveLength(5);
    const [frame, group, mask, path, hidden] = copies;
    expect(frame.id).toBe(result.id);
    expect(group.parentId).toBe(frame.id);
    expect(mask.parentId).toBe(group.id);
    expect(path.parentId).toBe(group.id);
    expect(path.clipTo).toBe(mask.id);
    expect(hidden.parentId).toBe(frame.id);
    expect(hidden.visible).toBe(false);
    expect(path.instance.componentId).toBe("external-master");
    expect(path.x).toBe(90);
    expect(JSON.stringify(doc)).toBe(before);
  });

  for (const mode of ["node", "clipboard"]) {
    it(`${mode} copies own mutable geometry, paints, effects and instance overrides`, () => {
      const doc = fixture(), before = JSON.stringify(doc);
      const next = mode === "node" ? duplicateNode(doc, "frame", 0).doc : (() => {
        const f = clipboardFixture(doc); f.clipboard.duplicateSelected(); return f.doc();
      })();
      const copy = next.nodes.find(node => node.kind === "path" && node.id !== "path");
      copy.points[0].in[0] = 99;
      copy.fills[0].opacity = 0.5;
      copy.effects[0].offset.x = 99;
      copy.instance.overrides.child.text = "Independent";
      expect(JSON.stringify(doc)).toBe(before);
    });
  }

  it("supports a preview duplicate without committing or repeating Power Duplicate", () => {
    const f = clipboardFixture(fixture());
    f.clipboard.duplicateSelected({ commit: false, repeatTransform: false });
    expect(f.setDoc).toHaveBeenCalledWith(expect.any(Object), { commit: false });
    const first = f.doc().nodes.find(node => node.id === f.ids()[0]);
    first.x += 100;
    f.clipboard.duplicateSelected({ commit: false, repeatTransform: false });
    expect(f.doc().nodes.find(node => node.id === f.ids()[0]).x).toBe(first.x);
  });

  it("copies an external clipping follower with its base and remaps the copied clip", () => {
    const doc = fixture();
    doc.nodes.push(shape("clipped", { clipTo: "frame", x: 50 }));
    const next = duplicateNode(doc, "frame", 0);
    const follower = next.doc.nodes.find(node => node.id !== "clipped" && node.clipTo === next.id);
    expect(follower).toBeDefined();
    expect(doc.nodes.find(node => node.id === "clipped").clipTo).toBe("frame");
  });

  for (const format of ["object", "legacy-string"]) {
    it(`retains Group/leaf selection identity in ${format} history without adding entries`, () => {
      const history = createHistory();
      const snapshot = { doc: fixture(), selectedIds: ["path"], selectedGroupId: "group", pixelSelection: null };
      history.push(format === "object" ? snapshot : JSON.stringify(snapshot));
      history.updateCurrentSelection(["path"], null);
      history.mute(() => history.updateCurrentSelection(["path"], "group"));
      const stored = history.getSnapshots()[0];
      const current = typeof stored === "string" ? JSON.parse(stored) : stored;
      expect(current.selectedIds).toEqual(["path"]);
      expect(current.selectedGroupId).toBeNull();
      expect(history.getCurrentIndex()).toBe(0);
    });
  }
});
