import { describe, expect, it } from "vitest";
import { mergeEditorDocuments } from "../../src/canvas/store/merge.js";
import { createDocumentBridge } from "../../src/canvas/collab/document_bridge.js";
import { createCollabSession } from "../../src/canvas/collab/session.js";
import { createEditor } from "./collab_test_helpers.js";

const message = (id, createdAt) => ({ id, createdAt, body: `body-${id}`, author: { name: `author-${id}` } });
const thread = (id, messages) => ({ id, x: 10, y: 20, createdAt: 1, resolved: false, author: { name: "owner" }, messages });
const original = message("original", 1), a = message("reply-a", 2), b = message("reply-b", 3);
const document = comments => ({ nodes: [], comments });

describe("concurrent comment replies", () => {
  it.each(["same", "different"])("converges when replies target %s threads after each peer advances its base", scenario => {
    const initial = document([thread("one", [original]), thread("two", [message("original-two", 1)])]);
    const left = structuredClone(initial), right = structuredClone(initial);
    left.comments[0].messages.push(a);
    right.comments[scenario === "same" ? 0 : 1].messages.push(b);
    const leftMerged = mergeEditorDocuments(left, left, right);
    const rightMerged = mergeEditorDocuments(right, right, left);
    expect(leftMerged.comments).toEqual(rightMerged.comments);
    expect(leftMerged.comments[0].messages).toEqual(scenario === "same" ? [original, a, b] : [original, a]);
    expect(leftMerged.comments[1].messages).toEqual(scenario === "same" ? [message("original-two", 1)] : [message("original-two", 1), b]);
    expect(initial.comments[0].messages).toEqual([original]);
  });
  it("keeps thread deletion semantics and independent metadata updates", () => {
    const base = document([thread("one", [original]), thread("two", [message("original-two", 1)])]);
    const left = document([{ ...base.comments[0], resolved: true }]);
    const right = structuredClone(base); right.comments[0].messages.push(a);
    const merged = mergeEditorDocuments(base, left, right);
    expect(merged.comments).toEqual([{ ...base.comments[0], resolved: true, messages: [original, a] }]);
  });
  it("orders equal-time replies consistently and is idempotent", () => {
    const base = document([thread("one", [original])]);
    const left = document([thread("one", [original, message("z", 5)])]);
    const right = document([thread("one", [original, message("a", 5)])]);
    const merged = mergeEditorDocuments(left, left, right);
    expect(merged.comments[0].messages.map(item => item.id)).toEqual(["original", "a", "z"]);
    expect(mergeEditorDocuments(right, right, left).comments).toEqual(merged.comments);
    expect(mergeEditorDocuments(base, merged, merged)).toEqual(merged);
  });
});

it.each(["same", "different"])("converges through two live document bridges for %s-thread replies", async scenario => {
  const initial = document([thread("one", [original]), thread("two", [message("original-two", 1)])]);
  const connections = new Map(), queued = [];
  let hold = false;
  const make = id => {
    const store = { getState: () => ({ images: {} }) };
    const editor = createEditor(store, { document: structuredClone(initial) });
    const session = createCollabSession({ userId: id, connectionId: id, setInterval: () => 0, clearInterval() {},
      connect: (_room, handlers) => {
        connections.set(id, handlers);
        const send = (to, wire) => {
          if (hold && JSON.parse(wire).t === "doc") queued.push({ from: id, to, wire });
          else void connections.get(to)?.onMessage(id, wire);
        };
        return { send, broadcast: wire => { for (const peer of connections.keys()) if (peer !== id) send(peer, wire); }, close() {} };
      } });
    const detach = createDocumentBridge({ session, engine: editor, store,
      db: { getImageBlobMap: async () => new Map(), getImageDataUrls: async () => ({}), putImages: async () => {} },
      setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout() {} });
    return { editor, session, detach };
  };
  const left = make("left"), right = make("right");
  try {
    left.session.start("abcdefgh"); right.session.start("abcdefgh");
    connections.get("left").onPeer("right"); connections.get("right").onPeer("left");
    await new Promise(resolve => setImmediate(resolve));
    const l = structuredClone(initial), r = structuredClone(initial);
    l.comments[0].messages.push(a); r.comments[scenario === "same" ? 0 : 1].messages.push(b);
    hold = true; left.editor.edit(l); right.editor.edit(r);
    await new Promise(resolve => setImmediate(resolve));
    expect(new Set(queued.map(item => item.from))).toEqual(new Set(["left", "right"]));
    hold = false;
    for (const item of queued.splice(0)) await connections.get(item.to).onMessage(item.from, item.wire);
    await new Promise(resolve => setImmediate(resolve));
    const leftComments = left.editor.getDocument().comments, rightComments = right.editor.getDocument().comments;
    expect(leftComments).toEqual(rightComments);
    expect(leftComments[0].messages).toEqual(scenario === "same" ? [original, a, b] : [original, a]);
    expect(leftComments[1].messages).toEqual(scenario === "same" ? [message("original-two", 1)] : [message("original-two", 1), b]);
  } finally { left.detach(); right.detach(); left.session.stop(); right.session.stop(); }
});
