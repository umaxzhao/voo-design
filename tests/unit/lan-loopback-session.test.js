import { expect, it } from "vitest";
import { WebSocket } from "ws";
import { startLoopbackSignaling } from "../../electron/lan-loopback-signaling.js";
import { createLoopbackTransport } from "../../src/canvas/collab/loopback_transport.js";
import { createCollabSession } from "../../src/canvas/collab/session.js";
import { roomSecretFromLink } from "../../src/canvas/collab/room.js";
import { MSG } from "../../src/canvas/collab/protocol.js";
import { proofFor } from "../../src/canvas/collab/room-security.js";
import { encode } from "../../src/canvas/collab/protocol.js";

const until = async condition => {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error("Loopback session condition timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

it("exchanges authenticated documents both ways over the isolated loopback transport", async () => {
  const service = await startLoopbackSignaling();
  const url = `ws://127.0.0.1:${service.port}`;
  const connect = (room, handlers) => createLoopbackTransport(room, handlers, {
    url, WebSocketImpl: WebSocket, token: handlers.connectionId === "host-connection" ? service.hostToken : service.guestToken,
    initialAccess: handlers.connectionId === "host-connection" ? "edit" : undefined,
  });
  const host = createCollabSession({ connect, userId: "host", connectionId: "host-connection" });
  const guest = createCollabSession({ connect, userId: "guest", connectionId: "guest-connection" });
  const hostDocs = [], guestDocs = [];
  host.setHandlers({ onDocument: message => hostDocs.push(message.document) });
  guest.setHandlers({ onDocument: message => guestDocs.push(message.document) });
  try {
    const room = host.start(service.room, { secret: service.guestToken, viaLink: false });
    guest.start(room, { secret: roomSecretFromLink(host.getSnapshot().link) });
    await until(() => host.isPeerKnown("guest-connection") && guest.isPeerKnown("host-connection"));
    host.sendTo("guest-connection", MSG.DOC, { document: { nodes: [{ id: "from-host" }] } });
    guest.sendTo("host-connection", MSG.DOC, { document: { nodes: [{ id: "from-guest" }] } });
    await until(() => hostDocs.length === 1 && guestDocs.length === 1);
    expect(hostDocs[0].nodes[0].id).toBe("from-guest");
    expect(guestDocs[0].nodes[0].id).toBe("from-host");
  } finally {
    host.stop(); guest.stop();
    await service.close();
  }
});

it("rejects a modified peer claiming edit access when the host has selected view", async () => {
  let handlers, received = 0;
  const host = createCollabSession({
    userId: "host", connect: (_room, next) => {
      handlers = next;
      return { send() {}, broadcast() {}, close() {} };
    },
  });
  host.setHandlers({ onDocument: () => { received += 1; } });
  try {
    host.start(); host.setAccess("view");
    const secret = roomSecretFromLink(host.getSnapshot().link);
    await handlers.onMessage("guest", encode(MSG.HELLO, {
      peerId: "guest", name: "Guest", colour: "#000000", readOnly: false,
      proof: await proofFor(secret, "guest"),
    }));
    expect(host.isPeerKnown("guest")).toBe(true);
    await handlers.onMessage("guest", encode(MSG.DOC, { document: { nodes: [] } }));
    expect(received).toBe(0);
  } finally { host.stop(); }
});
