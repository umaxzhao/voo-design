import assert from "node:assert/strict";
import { test } from "vitest";
import { createCollabSession } from "../../src/canvas/collab/session.js";
import { emitLocalStroke, onRemoteStroke } from "../../src/canvas/collab/stroke_bus.js";
import { mergeEditorDocuments } from "../../src/canvas/store/merge.js";
import { createEditor, attachEditorBridge } from "./collab_test_helpers.js";

function createHub() {
  const devices = new Map();
  return { connect(id, handlers) {
    devices.set(id, handlers);
    for (const [otherId, other] of devices) {
      if (otherId === id) continue;
      other.onPeer?.(id);
      handlers.onPeer?.(otherId);
    }
    return {
      send: (to, wire) => devices.get(to)?.onMessage?.(id, wire),
      broadcast: (wire) => { for (const [otherId, other] of devices) if (otherId !== id) other.onMessage?.(id, wire); },
      close: () => { devices.delete(id); for (const other of devices.values()) other.onPeerGone?.(id); },
    };
  } };
}
function device(hub, id) {
  const state = { images: {}, document: { nodes: [], pages: [], settings: {} } };
  const store = { getState: () => state };
  const editor = createEditor(store);
  const session = createCollabSession({ userId: id, connectionId: id, connect: (_room, handlers) => hub.connect(id, handlers), setInterval: () => 0, clearInterval: () => {} });
  attachEditorBridge(session, store, editor);
  return { session, store, editor };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("two devices converge on edits to different editor layers", async () => {
  const hub = createHub();
  const alice = device(hub, "alice");
  const bob = device(hub, "bob");
  alice.session.start("abcdefgh");
  bob.session.start("abcdefgh");
  await settle();
  alice.editor.edit({ nodes: [{ id: "layer-a", x: 1 }], pages: [], settings: {} });
  await settle();
  bob.editor.edit({ nodes: [{ id: "layer-a", x: 1 }, { id: "layer-b", x: 2 }], pages: [], settings: {} });
  await settle();
  assert.deepEqual(bob.editor.getDocument().nodes.map((node) => node.id), ["layer-a", "layer-b"]);
  const merged = mergeEditorDocuments(
    { nodes: [{ id: "layer-a", x: 1 }], pages: [], settings: {} },
    alice.editor.getDocument(),
    bob.editor.getDocument(),
  );
  assert.deepEqual(merged.nodes.map((node) => node.id), ["layer-a", "layer-b"]);
  alice.session.stop();
  bob.session.stop();
});

test("brush strokes cross as point lists", () => {
  const hub = createHub();
  const alice = device(hub, "alice");
  const bob = device(hub, "bob");
  alice.session.start("abcdefgh");
  bob.session.start("abcdefgh");
  let received;
  const unsubscribe = onRemoteStroke((stroke) => { received = stroke; });
  const stroke = { nodeId: "layer-a", points: [[1, 2], [3, 4]] };
  emitLocalStroke(stroke);
  assert.deepEqual(received, { ...stroke, type: "stroke" });
  unsubscribe();
  alice.session.stop();
  bob.session.stop();
});
