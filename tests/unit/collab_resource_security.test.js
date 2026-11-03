import assert from "node:assert/strict";
import { expect, test, vi } from "vitest";
import { createDocumentBridge } from "../../src/canvas/collab/document_bridge.js";
import { MSG } from "../../src/canvas/collab/protocol.js";
import { decodeBinaryFrame } from "../../src/canvas/collab/chunking.js";

function imageDocument(ids) {
  return {
    nodes: [{ id: "image-layer", imageId: ids[0] }],
    style: { fill: { imageKey: ids[1] } },
    pages: [],
    settings: {},
  };
}

function createBridge({
  document,
  images,
  db: dbOverrides = {},
  supportsBinary = false,
}) {
  let currentDocument = structuredClone(document);
  let handlers = {};
  let binarySupported = supportsBinary;
  const sent = [];
  const reads = [];
  const session = {
    getSnapshot: () => ({ readOnly: false }),
    setHandlers(value) { handlers = value ?? {}; },
    peerSupports: () => binarySupported,
    broadcast(type, payload) { sent.push({ route: "broadcast", type, payload }); },
    sendTo(peer, type, payload) {
      sent.push({ route: "peer", peer, type, payload });
    },
    sendRaw(peer, bytes) { sent.push({ route: "peer", peer, type: "raw", bytes }); },
    whenWritable: async () => {},
  };
  const engine = {
    getDocument: () => currentDocument,
    snapshotDoc: () => JSON.stringify(currentDocument),
  };
  const store = { getState: () => ({ images }) };
  const db = {
    async getImageBlobMap() { return new Map(); },
    async getImageDataUrls(ids) {
      reads.push([...ids]);
      return Object.fromEntries(
        ids.map((id) => [id, `data:image/png;base64,${id}`]),
      );
    },
    ...dbOverrides,
  };
  const cleanup = createDocumentBridge({ session, engine, store, db });
  return {
    db,
    handlers: () => handlers,
    reads,
    sent,
    setDocument(next) { currentDocument = structuredClone(next); },
    setBinarySupport(value) { binarySupported = value; },
    cleanup,
  };
}

const blobsSent = (sent) => sent.filter((entry) => entry.type === MSG.BLOB_DATA);
const binaryBlobsSent = (sent) => sent.filter((entry) => entry.type === "raw");

test("announces only in-memory images referenced by the current shared document", () => {
  const bridge = createBridge({
    document: imageDocument(["shared-image", "shared-fill-image"]),
    images: {
      "shared-image": "data:shared",
      "shared-fill-image": "data:fill",
      "other-document-image": "data:unrelated",
    },
  });

  bridge.handlers().onDocRequest("room-peer");

  assert.deepEqual(
    bridge.sent.find((entry) => entry.type === MSG.BLOB_HAVE)?.payload.ids,
    ["shared-image", "shared-fill-image"],
  );
  bridge.cleanup();
});

test("BLOB_WANT and original requests read and send only currently shared images", async () => {
  const bridge = createBridge({
    document: imageDocument(["shared-image", "shared-fill-image"]),
    images: { "shared-image": "data:shared", "other-document-image": "data:unrelated" },
  });
  const wanted = ["shared-image", "other-document-image"];

  bridge.handlers().onBlobWant(wanted, "room-peer");
  await vi.waitFor(() =>
    assert.deepEqual(
      blobsSent(bridge.sent).map(({ payload }) => payload.id),
      ["shared-image"],
    ),
  );
  assert.deepEqual(bridge.reads, [["shared-image"]]);

  bridge.sent.length = 0;
  bridge.reads.length = 0;
  bridge.setBinarySupport(true);
  bridge.db.getImageBlobMap = async (ids) => {
    bridge.reads.push([...ids]);
    return new Map(ids.map((id) => [id, new Blob(["shared-bytes"], { type: "image/png" })]));
  };
  bridge.db.getImageDataUrls = async () => {
    throw new Error("binary-capable peers must receive the original blob path");
  };
  bridge.handlers().onBlobWantOriginal(wanted, "room-peer");
  await vi.waitFor(() => assert.equal(binaryBlobsSent(bridge.sent).length, 1));
  assert.deepEqual(bridge.reads, [["shared-image"]]);
  assert.equal(decodeBinaryFrame(binaryBlobsSent(bridge.sent)[0].bytes).meta.id, "shared-image");
  bridge.cleanup();
});

test("document switches revoke stale outgoing reads and scope later announcements and wants", async () => {
  let resolveOldRead;
  const oldRead = new Promise((resolve) => { resolveOldRead = resolve; });
  const reads = [];
  const bridge = createBridge({
    document: imageDocument(["old-document-image", "old-fill-image"]),
    images: { "old-document-image": "data:old", "new-document-image": "data:new" },
    db: {
      async getImageDataUrls(ids) {
        reads.push([...ids]);
        return oldRead;
      },
    },
  });

  bridge.handlers().onBlobWant(["old-document-image"], "room-peer");
  await vi.waitFor(() => assert.deepEqual(reads, [["old-document-image"]]));
  bridge.setDocument(imageDocument(["new-document-image", "new-fill-image"]));
  resolveOldRead({ "old-document-image": "data:image/png;base64,old" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    blobsSent(bridge.sent),
    [],
    "a document switch cancels a pending send for its former resource",
  );

  bridge.sent.length = 0;
  bridge.handlers().onDocRequest("room-peer");
  assert.deepEqual(
    bridge.sent.find((entry) => entry.type === MSG.BLOB_HAVE)?.payload.ids,
    ["new-document-image"],
  );

  reads.length = 0;
  bridge.db.getImageDataUrls = async (ids) => {
    reads.push([...ids]);
    return Object.fromEntries(ids.map((id) => [id, `data:image/png;base64,${id}`]));
  };
  bridge.handlers().onBlobWant(
    ["old-document-image", "new-document-image", "unreferenced"],
    "room-peer",
  );
  await vi.waitFor(() =>
    assert.deepEqual(
      blobsSent(bridge.sent).map(({ payload }) => payload.id),
      ["new-document-image"],
    ),
  );
  assert.deepEqual(reads, [["new-document-image"]]);
  bridge.cleanup();
});

// Workflow-level per-peer authorization remains unverified; these tests cover
// only the existing current-document resource-sharing boundary.
test.skip("workflow-level resource authorization needs an explicit sharing policy", () => {});
