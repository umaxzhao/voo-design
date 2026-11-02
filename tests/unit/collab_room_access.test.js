import assert from "node:assert/strict";
import { test } from "vitest";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

import { MSG } from "../../src/canvas/collab/protocol.js";
import { createCollabSession } from "../../src/canvas/collab/session.js";
import { roomSecretFromLink } from "../../src/canvas/collab/room.js";

function fakeTransport() {
  const sent = [];
  let handlers;
  return {
    sent,
    get handlers() { return handlers; },
    connect: (_room, next) => {
      handlers = next;
      return {
        send: (peerId, wire) => sent.push({ peerId, wire }),
        broadcast: (wire) => sent.push({ peerId: "*", wire }),
        close: () => {},
      };
    },
  };
}

async function proof(secret, peerId) {
  const source = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: new TextEncoder().encode("voo-room-proof-v1") },
    source, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(peerId));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hello(peerId, proofValue) {
  return JSON.stringify({
    t: MSG.HELLO, v: 1, peerId, name: peerId, colour: "#123456", proof: proofValue,
  });
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("valid HELLO proof admits peer and permits DOC exchange", async () => {
  const wire = fakeTransport();
  let resolveAdmission;
  const admitted = new Promise((resolve) => { resolveAdmission = resolve; });
  const session = createCollabSession({
    connect: wire.connect,
    userId: "host",
    onChange: (snapshot) => {
      if (snapshot.peers.some((peer) => peer.peerId === "guest")) resolveAdmission();
    },
    setInterval: () => 1,
    clearInterval: () => {},
  });
  session.start();
  const secret = roomSecretFromLink(session.getSnapshot().link);
  wire.handlers.onPeer("guest-connection");
  const guestProof = await proof(secret, "guest");
  wire.handlers.onMessage("guest-connection", hello("guest", guestProof));
  await admitted;

  assert.equal(session.sendTo("guest-connection", MSG.DOC, { workflowId: "w", document: { nodes: [] } }), true);
  assert.ok(wire.sent.some((entry) => entry.peerId === "guest-connection" && JSON.parse(entry.wire).t === MSG.DOC));
  assert.ok(wire.sent.some((entry) => JSON.parse(entry.wire).t === MSG.DOC_REQUEST));
});

test("wrong or missing proof is ignored and receives no DOC or BLOB", async () => {
  const wire = fakeTransport();
  const session = createCollabSession({
    connect: wire.connect, userId: "host", setInterval: () => 1, clearInterval: () => {},
  });
  session.start();
  wire.handlers.onPeer("untrusted");
  await settle();
  const before = wire.sent.length;
  wire.handlers.onMessage("untrusted", hello("guest", "0".repeat(64)));
  await settle();
  session.sendTo("untrusted", MSG.DOC, { document: {} });
  session.sendTo("untrusted", MSG.BLOB_DATA, { id: "image", dataUrl: "data:image/png;base64,AA==" });
  await settle();
  const after = wire.sent.slice(before).map((entry) => {
    try { return JSON.parse(entry.wire).t; } catch { return null; }
  });
  assert.equal(after.includes(MSG.DOC), false);
  assert.equal(after.includes(MSG.BLOB_DATA), false);
  assert.equal(after.includes(MSG.DOC_REQUEST), false);
});

test("joiner without fragment secret sends no valid proof to protected room", async () => {
  const hostWire = fakeTransport();
  const host = createCollabSession({
    connect: hostWire.connect, userId: "host", setInterval: () => 1, clearInterval: () => {},
  });
  host.start();
  const protectedSecret = roomSecretFromLink(host.getSnapshot().link);
  hostWire.handlers.onPeer("joiner");
  await settle();

  const joinerWire = fakeTransport();
  const joiner = createCollabSession({
    connect: joinerWire.connect, userId: "guest", setInterval: () => 1, clearInterval: () => {},
  });
  joiner.start(host.getSnapshot().roomId, { secret: null });
  joinerWire.handlers.onPeer("host");
  await settle();
  const sentHello = joinerWire.sent.find((entry) => JSON.parse(entry.wire).t === MSG.HELLO);
  assert.equal(Object.hasOwn(JSON.parse(sentHello.wire), "proof"), false);

  hostWire.handlers.onMessage("joiner", sentHello.wire);
  await settle();
  assert.equal(host.isPeerKnown("joiner"), false);
  assert.ok(protectedSecret);
});
