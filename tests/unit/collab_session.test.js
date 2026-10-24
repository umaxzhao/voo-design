import assert from "node:assert/strict";
import { test } from "vitest";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

import { MSG, encode } from "../../src/canvas/collab/protocol.js";
import { encodeBinaryFrame } from "../../src/canvas/collab/chunking.js";
import { STATUS, createCollabSession } from "../../src/canvas/collab/session.js";

/** A transport that records what was sent and lets a test play peers back. */
function fakeTransport() {
  const sent = [];
  let handlers = null;
  return {
    sent,
    get handlers() {
      return handlers;
    },
    connect: (room, next) => {
      handlers = next;
      return {
        send: (peerId, wire) => sent.push({ to: peerId, wire }),
        broadcast: (wire) => sent.push({ to: "*", wire }),
        close: () => sent.push({ to: null, wire: "close" }),
      };
    },
  };
}

const types = (transport) =>
  transport.sent
    .filter((entry) => entry.wire !== "close")
    .map((entry) => JSON.parse(entry.wire).t);

test("starting a session puts you in your own roster", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    name: "Ada",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  const room = session.start();
  const state = session.getSnapshot();
  assert.equal(state.roomId, room);
  assert.equal(state.status, STATUS.CONNECTING);
  assert.deepEqual(
    state.peers.map((p) => p.peerId),
    ["me"],
  );
  assert.ok(state.link.endsWith(room), state.link);
});

test("starting an already-live room reuses the same id, not a new one", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  // Host shares once — a room id is minted and the link is stable.
  const room = session.start();
  assert.equal(session.getSnapshot().roomId, room);
  // Pressing "Copy collab link" again reuses the live room's id, so the link
  // handed to a peer never goes stale when the host re-copies.
  const again = session.start(room);
  assert.equal(again, room);
  assert.equal(session.getSnapshot().roomId, room);
});

test("the snapshot reports active only once a room is live", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  // Before any room exists the toolbar must not think it can re-share.
  assert.equal(session.getSnapshot().active, false);
  assert.equal(session.getSnapshot().link, null);

  session.start("abcdefgh");
  const live = session.getSnapshot();
  // The toolbar uses active + link to decide "copy collab link" over "share".
  assert.equal(live.active, true);
  assert.ok(live.link.includes("abcdefgh"));

  session.stop();
  assert.equal(session.getSnapshot().active, false);
});

test("a peer arriving is greeted and asked for the document", () => {
  // A peer that just joined holds nothing; waiting for the next edit to carry
  // the document would leave it staring at an empty canvas.
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");
  transport.handlers.onPeer("conn-1");

  assert.deepEqual(types(transport), [MSG.HELLO, MSG.DOC_REQUEST]);
  // A connection is not yet a person: it joins the roster when its HELLO says
  // whose it is, so an avatar never appears for a half-open channel.
  assert.deepEqual(
    session.getSnapshot().peers.map((p) => p.peerId),
    ["me"],
  );
});

test("two windows of one person are one face in the room", () => {
  // The whole reason presence is keyed by user rather than by connection: a
  // second editor window is the same colleague, not a second one.
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");

  const hello = encode(MSG.HELLO, {
    peerId: "grace",
    name: "Grace",
    colour: "#7fd4a8",
  });
  transport.handlers.onMessage("conn-1", hello);
  transport.handlers.onMessage("conn-2", hello);

  assert.deepEqual(
    session.getSnapshot().peers.map((p) => p.peerId),
    ["me", "grace"],
  );

  // Closing one window leaves her here; closing the last one takes her out.
  transport.handlers.onPeerGone("conn-1");
  assert.deepEqual(
    session.getSnapshot().peers.map((p) => p.peerId),
    ["me", "grace"],
  );
  transport.handlers.onPeerGone("conn-2");
  assert.deepEqual(
    session.getSnapshot().peers.map((p) => p.peerId),
    ["me"],
  );
});

test("a HELLO fills in the name and colour the avatars show", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");
  transport.handlers.onMessage(
    "other",
    encode(MSG.HELLO, { peerId: "other", name: "Grace", colour: "#7fd4a8" }),
  );
  const peer = session.getSnapshot().peers.find((p) => p.peerId === "other");
  assert.equal(peer.name, "Grace");
  assert.equal(peer.colour, "#7fd4a8");
});

test("document and stroke messages reach the handlers that apply them", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  const seen = [];
  session.setHandlers({
    onDocument: (message) => seen.push(["doc", message.workflowId]),
    onStroke: (message) => seen.push(["stroke", message.nodeId]),
    onDocRequest: (from) => seen.push(["req", from]),
  });
  session.start("abcdefgh");
  transport.handlers.onMessage(
    "other",
    encode(MSG.DOC, { workflowId: "w1", document: { nodes: [] } }),
  );
  transport.handlers.onMessage(
    "other",
    encode(MSG.STROKE, { nodeId: "layer-1", points: [[0, 0]] }),
  );
  transport.handlers.onMessage("other", encode(MSG.DOC_REQUEST, {}));

  assert.deepEqual(seen, [
    ["doc", "w1"],
    ["stroke", "layer-1"],
    ["req", "other"],
  ]);
});

test("a message from a peer on another build is dropped, not fatal", () => {
  // Links get shared; a peer running yesterday's build must not be able to
  // take the session down by sending something this one cannot read.
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");
  assert.doesNotThrow(() => transport.handlers.onMessage("other", "{nonsense"));
  assert.doesNotThrow(() =>
    transport.handlers.onMessage("other", JSON.stringify({ t: "doc", v: 99 })),
  );
});

test("stopping says goodbye, closes, and empties the roster", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");
  transport.handlers.onPeer("other");
  session.stop();

  assert.ok(types(transport).includes(MSG.BYE));
  assert.equal(transport.sent.at(-1).wire, "close");
  const state = session.getSnapshot();
  assert.equal(state.status, STATUS.OFF);
  assert.equal(state.roomId, null);
  assert.deepEqual(state.peers, []);
});

test("subscribers hear every change and can unsubscribe", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  const seen = [];
  const off = session.subscribe((state) => seen.push(state.peers.length));
  session.start("abcdefgh");
  transport.handlers.onMessage(
    "conn-a",
    encode(MSG.HELLO, { peerId: "a", name: "A", colour: "#fff" }),
  );
  off();
  transport.handlers.onMessage(
    "conn-b",
    encode(MSG.HELLO, { peerId: "b", name: "B", colour: "#fff" }),
  );
  assert.ok(seen.length > 0);
  assert.equal(Math.max(...seen), 2, "stopped hearing after unsubscribe");
});

test("nothing is sent before a session starts", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  assert.equal(session.broadcast(MSG.DOC_REQUEST, {}), false);
  assert.equal(session.sendTo("x", MSG.DOC_REQUEST, {}), false);
  assert.deepEqual(transport.sent, []);
});

test("flow control delegates to a transport that offers it", async () => {
  // Senders await `whenWritable` unconditionally; a transport without flow
  // control must behave as "always writable" so the fakes stay simple.
  const bare = createCollabSession({
    connect: () => ({ send: () => {}, broadcast: () => {}, close: () => {} }),
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  bare.start("abcdefgh");
  assert.equal(bare.bufferedAmount("peer"), 0);
  await bare.whenWritable("peer");

  const gate = Promise.resolve();
  const session = createCollabSession({
    connect: () => ({
      send: () => {},
      broadcast: () => {},
      close: () => {},
      bufferedAmount: (peerId) => (peerId === "peer" ? 42 : 0),
      whenWritable: () => gate,
    }),
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");
  assert.equal(session.bufferedAmount("peer"), 42);
  assert.equal(
    session.whenWritable("peer"),
    gate,
    "the transport's own promise",
  );
});

test("a peer's HELLO advertises what wire formats it can take", () => {
  // The capability handshake is what lets a newer build send binary frames
  // without stranding peers that still run an older one.
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");
  transport.handlers.onMessage(
    "conn-new",
    encode(MSG.HELLO, {
      peerId: "new",
      name: "N",
      colour: "#fff",
      caps: ["blobBin"],
    }),
  );
  transport.handlers.onMessage(
    "conn-old",
    encode(MSG.HELLO, { peerId: "old", name: "O", colour: "#fff" }),
  );
  assert.equal(session.peerSupports("conn-new", "blobBin"), true);
  assert.equal(
    session.peerSupports("conn-old", "blobBin"),
    false,
    "no HELLO field, no new formats",
  );
});

test("our own HELLO advertises binary blobs", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");
  transport.handlers.onPeer("conn-1");
  const hello = JSON.parse(transport.sent[0].wire);
  assert.deepEqual(hello.caps, ["blobBin"]);
});

test("a binary frame reaches the blob chunk handler", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");
  const received = [];
  session.setHandlers({
    onBlobChunk: (meta, bytes, from) => received.push({ meta, bytes, from }),
  });
  transport.handlers.onMessage(
    "conn-1",
    encodeBinaryFrame(
      { t: MSG.BLOB_DATA, v: 1, id: "img", seq: 0, total: 1 },
      new Uint8Array([7, 8]),
    ),
  );
  assert.equal(received.length, 1);
  assert.equal(received[0].meta.id, "img");
  assert.deepEqual([...received[0].bytes], [7, 8]);
  assert.equal(received[0].from, "conn-1");
});

test("two-way HELLO handshake: receiving a HELLO prompts a reply greeting back", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");

  // An incoming HELLO without reply: false must be answered
  transport.handlers.onMessage(
    "conn-x",
    encode(MSG.HELLO, { peerId: "alex", name: "Alex", colour: "#7fd4a8" }),
  );
  const replies = transport.sent.filter((s) => s.to === "conn-x");
  assert.ok(replies.length > 0, "sent reply HELLO");
  const replyMsg = JSON.parse(replies[0].wire);
  assert.equal(replyMsg.t, MSG.HELLO);
  assert.equal(replyMsg.reply, false, "reply greeting does not ask for infinite loop");

  // An incoming HELLO with reply: false must NOT prompt another reply
  const beforeCount = transport.sent.length;
  transport.handlers.onMessage(
    "conn-y",
    encode(MSG.HELLO, { peerId: "bob", name: "Bob", colour: "#ffb27f", reply: false }),
  );
  assert.equal(transport.sent.length, beforeCount, "no extra reply for reply: false");
});

test("unknown peer message recovery: receiving a non-HELLO message prompts HELLO", () => {
  const transport = fakeTransport();
  const session = createCollabSession({
    connect: transport.connect,
    userId: "me",
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start("abcdefgh");

  // A document arrives from an unknown connection that hasn't said HELLO yet
  transport.handlers.onMessage(
    "unknown-peer",
    encode(MSG.DOC, { workflowId: "w1", document: { nodes: [] } }),
  );
  const sentToUnknown = transport.sent.filter((s) => s.to === "unknown-peer");
  assert.ok(sentToUnknown.length > 0, "prompted unknown peer with HELLO");
  const msg = JSON.parse(sentToUnknown[0].wire);
  assert.equal(msg.t, MSG.HELLO);
  assert.equal(msg.reply, true, "asks the unknown peer to identify itself");
});
