import { expect, it } from "vitest";
import { createOwnerIdentity, verifyOwnerIdentity } from "../../src/canvas/collab/owner-identity.js";
import { createCollabSession } from "../../src/canvas/collab/session.js";
import { createRoomSecret } from "../../src/canvas/collab/room.js";
import { proofFor } from "../../src/canvas/collab/room-security.js";
import { encode, MSG } from "../../src/canvas/collab/protocol.js";

it("binds an owner proof to the room, connection, access and fresh challenge", async () => {
  const owner = await createOwnerIdentity();
  const proof = await owner.sign("room", "connection", "owner", "view", "challenge-a");
  expect(await verifyOwnerIdentity(owner.publicKey, proof, "room", "connection", "owner", "view", "challenge-a")).toBe(true);
  for (const args of [
    ["room", "other", "owner", "view", "challenge-a"],
    ["room", "connection", "owner", "edit", "challenge-a"],
    ["room", "connection", "owner", "view", "challenge-b"],
    ["other", "connection", "owner", "view", "challenge-a"],
  ]) expect(await verifyOwnerIdentity(owner.publicKey, proof, ...args)).toBe(false);
});

it("accepts the signed owner in view mode and rejects forgery and a replay after reconnect", async () => {
  const owner = await createOwnerIdentity(), secret = createRoomSecret(), sent = [];
  let handlers, documents = 0;
  const guest = createCollabSession({ userId: "guest", connect: (_room, next) => {
    handlers = next; return { send: (peer, wire) => sent.push({ peer, wire: JSON.parse(wire) }), broadcast() {}, close() {} };
  } });
  guest.setHandlers({ onDocument: () => { documents += 1; } });
  const nextHello = async (peer, after) => {
    const deadline = Date.now() + 2000;
    while (!sent.slice(after).some(item => item.peer === peer && item.wire.challenge)) {
      if (Date.now() > deadline) throw new Error("Challenge not sent");
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    return sent.slice(after).find(item => item.peer === peer && item.wire.challenge).wire.challenge;
  };
  try {
    guest.start("abcdefgh", { secret, ownerKey: owner.publicKey }); guest.setAccess("view");
    handlers.onPeer("owner-connection");
    const challenge = await nextHello("owner-connection", 0);
    const hello = { peerId: "owner", name: "Owner", colour: "#000000", access: "view", readOnly: false,
      proof: await proofFor(secret, "owner"), ownerChallenge: challenge,
      ownerProof: await owner.sign("abcdefgh", "owner-connection", "owner", "view", challenge) };
    await handlers.onMessage("owner-connection", encode(MSG.HELLO, hello));
    await handlers.onMessage("owner-connection", encode(MSG.DOC, { document: { nodes: [] } }));
    expect(documents).toBe(1);
    handlers.onPeer("attacker-connection");
    await nextHello("attacker-connection", 0);
    await handlers.onMessage("attacker-connection", encode(MSG.HELLO, { ...hello, access: "edit" }));
    await handlers.onMessage("attacker-connection", encode(MSG.DOC, { document: { nodes: [] } }));
    expect(documents).toBe(1);
    expect(guest.getSnapshot().access).toBe("view");
    handlers.onPeerGone("owner-connection");
    const index = sent.length; handlers.onPeer("owner-connection");
    expect(await nextHello("owner-connection", index)).not.toBe(challenge);
    await handlers.onMessage("owner-connection", encode(MSG.HELLO, hello));
    await handlers.onMessage("owner-connection", encode(MSG.DOC, { document: { nodes: [] } }));
    expect(documents).toBe(1);
  } finally { guest.stop(); }
});
