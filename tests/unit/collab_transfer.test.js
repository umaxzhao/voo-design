import assert from "node:assert/strict";
import { test } from "vitest";
import {
  BINARY_CHUNK_SIZE, CHUNK_SIZE, createByteReassembler, createReassembler,
  decodeBinaryFrame, encodeBinaryFrame, splitPayload,
} from "../../src/canvas/collab/chunking.js";
import { createEditor, attachEditorBridge } from "./collab_test_helpers.js";
import { MSG } from "../../src/canvas/collab/protocol.js";

function fakeSession() {
  let handlers = {};
  const sent = [];
  return {
    sent,
    get handlers() { return handlers; },
    setHandlers: (next) => { handlers = next ?? {}; },
    getSnapshot: () => ({ readOnly: false }),
    peerSupports: () => false,
    whenWritable: async () => {},
    broadcast: (type, payload) => sent.push({ to: "*", type, payload }),
    sendTo: (to, type, payload) => sent.push({ to, type, payload }),
    sendRaw: (to, bytes) => sent.push({ to, type: "raw", bytes }),
  };
}
function fixture(document = { nodes: [], pages: [], settings: {} }, db = {}) {
  const state = { images: {}, document };
  const store = { getState: () => state };
  const editor = createEditor(store);
  const session = fakeSession();
  attachEditorBridge(session, store, editor, db);
  return { state, store, editor, session };
}

test("small and empty payloads each form one numbered chunk", () => {
  assert.deepEqual(splitPayload("hi", 10), [{ seq: 0, total: 1, chunk: "hi" }]);
  assert.deepEqual(splitPayload("", 10), [{ seq: 0, total: 1, chunk: "" }]);
});

test("large payload round-trips through out-of-order chunks", () => {
  const payload = "x".repeat(CHUNK_SIZE * 2 + 17);
  const pieces = splitPayload(payload);
  const reassembler = createReassembler();
  let result = null;
  for (const piece of [...pieces].reverse()) result = reassembler.add("peer", "asset", piece);
  assert.equal(result, payload);
  assert.equal(reassembler.size, 0);
});

test("binary image frames preserve metadata and bytes", () => {
  const bytes = new Uint8Array([1, 3, 5]);
  const frame = encodeBinaryFrame({ t: MSG.BLOB_DATA, v: 1, id: "asset", seq: 0, total: 1 }, bytes);
  const decoded = decodeBinaryFrame(frame);
  assert.equal(decoded.meta.id, "asset");
  assert.deepEqual([...decoded.bytes], [...bytes]);
});

test("byte reassembly isolates peers and image ids", () => {
  const join = createByteReassembler();
  const data = new Uint8Array(BINARY_CHUNK_SIZE + 2);
  const first = join.add("peer-a", "asset", { seq: 0, total: 2, chunk: data.slice(0, BINARY_CHUNK_SIZE) });
  const done = join.add("peer-a", "asset", { seq: 1, total: 2, chunk: data.slice(BINARY_CHUNK_SIZE) });
  assert.equal(first, null);
  assert.equal(done.byteLength, data.byteLength);
});

test("a joining peer receives the editor snapshot without image data", () => {
  const document = { nodes: [{ id: "node-1", imageId: "image-1", src: "data:image/png;base64,SECRET" }], pages: [{ id: "page-1" }], settings: {} };
  const { session } = fixture(document);
  session.handlers.onDocRequest("newcomer");
  const sent = session.sent.find((entry) => entry.type === MSG.DOC);
  assert.deepEqual(sent.payload.document.nodes[0], { id: "node-1", imageId: "image-1" });
  assert.equal("workflowId" in sent.payload, false);
});

test("a remote editor document is adopted through engine.setDoc", async () => {
  const { session, editor } = fixture();
  await session.handlers.onDocument({ document: { nodes: [{ id: "remote-layer" }], pages: [], settings: {} } }, "peer");
  assert.equal(editor.getDocument().nodes[0].id, "remote-layer");
});
