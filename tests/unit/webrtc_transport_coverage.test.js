import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

import { MSG, encode } from "../../src/canvas/collab/protocol.js";
import { STATUS } from "../../src/canvas/collab/session.js";
import { HOSTED_SIGNALING_URL } from "../../src/shared/vps_origin.js";
import {
  createWebRtcTransport,
  resolveIceServers,
  signalingUrl,
  DEFAULT_ICE,
  BUFFER_HIGH_WATER,
  BUFFER_LOW_WATER,
} from "../../src/canvas/collab/webrtc_transport.js";

/**
 * webrtc_transport_coverage — the transport paths collab_reconnect.test.js does
 * not reach: the receive side (answerer), the returned send/broadcast/
 * bufferedAmount/whenWritable surface, channel lifecycle events, the decode
 * guard, and resolveIceServers / signalingUrl toggle branches.
 *
 * Each scenario drives the REAL state machine with a scriptable WebSocket /
 * RTCPeerConnection, so a broken transition would fail the assertion instead of
 * fake-greening.
 */

// ---- config helpers ---------------------------------------------------------
function fakeWebSockets() {
  const instances = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.closeThrows = false;
      instances.push(this);
    }
    send(wire) {
      this.sent.push(JSON.parse(wire));
    }
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    close() {
      this.readyState = 3;
      if (this.closeThrows) throw new Error("socket already closing");
      this.onclose?.();
    }
    receive(message) {
      return this.onmessage?.({ data: encode(message.t, message) });
    }
    receiveRaw(data) {
      return this.onmessage?.({ data });
    }
  }
  return { FakeWebSocket, instances };
}

function makeChannel({ readyState = "connecting", bufferedAmount = 0 } = {}) {
  const listeners = {};
  const channel = {
    readyState,
    bufferedAmount,
    sent: [],
    bufferedAmountLowThreshold: 0,
    binaryType: "",
    send(wire) {
      this.sent.push(wire);
    },
    close() {
      // Idempotent, and deliberately NOT re-entrant: the real channel fires
      // onclose asynchronously, so the transport's dropPeer must not recurse
      // back into channel.close() synchronously. The transport's own close
      // handler is triggered by calling channel.onclose() in the test.
      if (this.readyState === "closed") return;
      this.readyState = "closed";
      this.emit("close");
    },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    emit(type) {
      (listeners[type] || []).forEach((fn) => fn());
    },
    open() {
      this.readyState = "open";
      this.onopen?.();
    },
    message(data) {
      this.onmessage?.({ data });
    },
    error() {
      this.onerror?.();
    },
  };
  return channel;
}

function fakePeerConnections() {
  const instances = [];
  class FakePeerConnection {
    constructor() {
      this.connectionState = "new";
      this.channels = [];
      this.closeThrows = false;
      this.addIceThrows = false;
      instances.push(this);
    }
    createDataChannel() {
      const channel = makeChannel();
      this.channels.push(channel);
      return channel;
    }
    async createOffer() {
      return { type: "offer", sdp: "fake-offer" };
    }
    async createAnswer() {
      return { type: "answer", sdp: "fake-answer" };
    }
    async setLocalDescription(desc) {
      this.localDescription = desc;
    }
    async setRemoteDescription(desc) {
      this.remoteDescription = desc;
    }
    async addIceCandidate(candidate) {
      if (this.addIceThrows) throw new Error("ice candidate rejected");
      (this.addedCandidates ||= []).push(candidate);
    }
    close() {
      this.connectionState = "closed";
      if (this.closeThrows) throw new Error("already torn down");
    }
    fail() {
      this.connectionState = "failed";
      this.onconnectionstatechange?.();
    }
    // The remote side's data channel arrives as an ondatachannel event.
    receiveDataChannel(channel) {
      this.ondatachannel?.({ channel });
    }
    emitCandidate(candidate) {
      this.onicecandidate?.({ candidate });
    }
  }
  return { FakePeerConnection, instances };
}

function fakeTimers() {
  const pending = [];
  return {
    pending,
    setTimeout: (fn, ms) => {
      pending.push({ fn, ms });
      return pending.length;
    },
    clearTimeout: (id) => {
      pending[id - 1] = null;
    },
    fire(index) {
      const timer = pending[index];
      pending[index] = null;
      timer.fn();
    },
  };
}

function setup({ selfId = "zzz", handlers = {} } = {}) {
  const sockets = fakeWebSockets();
  const connections = fakePeerConnections();
  const timers = fakeTimers();
  const statuses = [];
  const transport = createWebRtcTransport(
    "room",
    {
      onStatus: (status) => statuses.push(status),
      onPeer: (id) => handlers.onPeer?.(id),
      onPeerGone: (id) => handlers.onPeerGone?.(id),
      onMessage: (id, data) => handlers.onMessage?.(id, data),
      ...handlers,
    },
    {
      WebSocketImpl: sockets.FakeWebSocket,
      PeerConnectionImpl: connections.FakePeerConnection,
      url: "wss://example.test/collab",
      selfId,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    },
  );
  return { transport, sockets, connections, timers, statuses };
}

const offers = (sockets) =>
  sockets.instances[0].sent.filter(
    (m) => m.t === MSG.SIGNAL && m.data?.sdp?.type === "offer",
  );

// ---- pure helpers -----------------------------------------------------------
test("resolveIceServers: returns the default STUN list, honours a config override", () => {
  const key = "__VOO_ICE_SERVERS__";
  const previous = globalThis[key];
  try {
    delete globalThis[key];
    assert.deepEqual(resolveIceServers(), DEFAULT_ICE);

    const custom = [{ urls: "stun:custom.example:3478" }];
    globalThis[key] = custom;
    assert.deepEqual(resolveIceServers(), custom);

    // An empty (or non-array) override falls back to the defaults.
    globalThis[key] = [];
    assert.deepEqual(resolveIceServers(), DEFAULT_ICE);
    globalThis[key] = "not-an-array";
    assert.deepEqual(resolveIceServers(), DEFAULT_ICE);
  } finally {
    delete globalThis[key];
    if (previous !== undefined) globalThis[key] = previous;
  }
});

test("signalingUrl: derives a ws url from the page origin and honours overrides", () => {
  const urlKey = "__VOO_SIGNALING_URL__";
  const locationKey = "location";
  const previousUrl = globalThis[urlKey];
  const previousLocation = globalThis[locationKey];
  try {
    delete globalThis[urlKey];
    vi.stubGlobal(locationKey, undefined);
    assert.equal(
      signalingUrl(),
      HOSTED_SIGNALING_URL,
      "the default page origin (voo.run) uses the VPS signalling socket",
    );

    vi.stubGlobal(locationKey, { origin: "http://localhost:5173" });
    assert.equal(
      signalingUrl(),
      "ws://localhost:5173/collab",
      "http origin is swapped to ws",
    );

    vi.stubGlobal(locationKey, { origin: "https://voo.run" });
    assert.equal(
      signalingUrl(),
      HOSTED_SIGNALING_URL,
      "the site on voo.run has no socket of its own: use the VPS",
    );

    vi.stubGlobal(locationKey, { origin: "https://www.voo.run" });
    assert.equal(
      signalingUrl(),
      HOSTED_SIGNALING_URL,
      "www is the site too",
    );

    vi.stubGlobal(locationKey, { origin: "https://staging.example.com" });
    assert.equal(
      signalingUrl(),
      "wss://staging.example.com/collab",
      "another https origin is swapped to wss and keeps its own /collab",
    );

    // The desktop app runs under the custom `voo://app` scheme: a non-http
    // origin must fall back to the hosted signalling server because WebSocket
    // only accepts ws/wss and `voo://app/collab` is not connectable.
    vi.stubGlobal(locationKey, { origin: "voo://app" });
    assert.equal(
      signalingUrl(),
      HOSTED_SIGNALING_URL,
      "custom non-http origin falls back to hosted signalling",
    );

    globalThis[urlKey] = "wss://custom.example/collab";
    assert.equal(
      signalingUrl(),
      "wss://custom.example/collab",
      "explicit override wins over origin",
    );
  } finally {
    vi.unstubAllGlobals();
    delete globalThis[urlKey];
    delete globalThis[locationKey];
    if (previousUrl !== undefined) globalThis[urlKey] = previousUrl;
    if (previousLocation !== undefined)
      globalThis[locationKey] = previousLocation;
  }
});

// ---- send / broadcast / writability surface --------------------------------
test("an offered peer: bufferedAmount, send, broadcast and writability all behave", async () => {
  const peersGone = [];
  const messages = [];
  const { transport, sockets, connections, timers } = setup({
    selfId: "zzz",
    handlers: {
      onPeerGone: (id) => peersGone.push(id),
      onMessage: (id, d) => messages.push([id, d]),
    },
  });
  sockets.instances[0].open();
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  assert.equal(offers(sockets).length, 1, "larger id offered");

  const connection = connections.instances[0];
  const channel = connection.channels[0];

  // Channel still connecting: nothing can be sent yet, and bufferedAmount is 0.
  assert.equal(transport.bufferedAmount("aaa"), 0);
  transport.send("aaa", "not-yet");
  assert.deepEqual(channel.sent, [], "send is a no-op while connecting");
  await transport.whenWritable("aaa"); // resolves immediately (not open)

  // A candidate emitted for the connecting connection is signalled to the peer.
  connection.emitCandidate({ candidate: "c1" });
  const signalled = sockets.instances[0].sent.find(
    (m) => m.t === MSG.SIGNAL && m.data?.candidate,
  );
  assert.ok(signalled, "ICE candidate is relayed over the socket");

  // Open the channel -> CONNECTED + onPeer fire, and the buffer drains.
  channel.open();
  await assert.doesNotReject(transport.whenWritable("aaa")); // open, below high-water
  transport.send("aaa", "hello");
  assert.deepEqual(channel.sent, ["hello"]);
  transport.broadcast("hi");
  assert.deepEqual(channel.sent, ["hello", "hi"]);

  // Queued bytes above the high-water mark: whenWritable waits, then resolves
  // when the buffer drains.
  channel.bufferedAmount = BUFFER_HIGH_WATER + 1;
  const drained = transport.whenWritable("aaa");
  let settled = false;
  drained.then(() => {
    settled = true;
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false, "waits while above high-water");
  channel.emit("bufferedamountlow");
  await drained;
  assert.equal(settled, true, "resolves once the buffer drains");

  // A message arriving on the channel is delivered to the handler.
  channel.message("payload");
  assert.deepEqual(messages, [["aaa", "payload"]]);

  // Unknown / gone peers are safe no-ops.
  transport.send("nobody", "x");
  transport.broadcast("no-peers-left-after-close");

  // Closing the transport tears the peer down and reports onPeerGone.
  transport.close();
  assert.deepEqual(peersGone, ["aaa"]);
});

test("whenWritable resolves immediately for a connection at/under the high-water mark", async () => {
  const { transport, sockets, connections } = setup({ selfId: "zzz" });
  sockets.instances[0].open();
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  const channel = connections.instances[0].channels[0];
  channel.open();
  channel.bufferedAmount = BUFFER_HIGH_WATER; // exactly at high-water
  await assert.doesNotReject(transport.whenWritable("aaa"));
  // A peer that never existed resolves immediately too.
  await assert.doesNotReject(transport.whenWritable("ghost"));
});

test("a peer that vanishes (channel close/error) is dropped and reported", async () => {
  const peersGone = [];
  const { transport, sockets, connections } = setup({
    selfId: "zzz",
    handlers: { onPeerGone: (id) => peersGone.push(id) },
  });
  sockets.instances[0].open();
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  const channels = connections.instances[0].channels;
  channels[0].open();
  // A peer is dropped only once every one of its (parallel) channels is gone.
  channels.forEach((channel) => channel.error());
  assert.deepEqual(peersGone, ["aaa"], "closing every channel drops the peer");
  assert.equal(transport.bufferedAmount("aaa"), 0, "peer is gone");
});

// ---- receive side (answerer) ----------------------------------------------
test("the smaller id waits for the offer, then answers and handles candidates", async () => {
  const { transport, sockets, connections } = setup({ selfId: "aaa" });
  sockets.instances[0].open();

  // selfId (aaa) < peer (zzz): the smaller side does not offer, it waits.
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["zzz"] });
  assert.equal(offers(sockets).length, 0, "smaller id does not offer");
  assert.equal(
    connections.instances.length,
    1,
    "a pending connection was created",
  );

  // The remote sends an offer -> we create/answer and relay it.
  await sockets.instances[0].receive({
    t: MSG.SIGNAL,
    to: "aaa",
    from: "zzz",
    data: { sdp: { type: "offer", sdp: "zzz-offer" } },
  });
  const answer = sockets.instances[0].sent.find(
    (m) => m.t === MSG.SIGNAL && m.data?.sdp?.type === "answer",
  );
  assert.ok(answer, "an answer is relayed back");
  assert.equal(connections.instances[0].remoteDescription.sdp, "zzz-offer");

  // A candidate for the remote arrives and is applied.
  await sockets.instances[0].receive({
    t: MSG.SIGNAL,
    to: "aaa",
    from: "zzz",
    data: { candidate: { candidate: "c1" } },
  });
  assert.deepEqual(connections.instances[0].addedCandidates, [
    { candidate: "c1" },
  ]);

  // An answer-typed SDP (not an offer) is only applied, never re-answered.
  await sockets.instances[0].receive({
    t: MSG.SIGNAL,
    to: "aaa",
    from: "zzz",
    data: { sdp: { type: "answer", sdp: "zzz-answer" } },
  });
  assert.equal(connections.instances[0].remoteDescription.sdp, "zzz-answer");
  assert.equal(
    sockets.instances[0].sent.filter((m) => m.t === MSG.SIGNAL).length,
    1,
    "no extra answer for an answer-typed sdp",
  );

  transport.close();
});

test("a candidate arriving before the offer is buffered, not dropped, and applied after the remote description", async () => {
  // Cross-environment peers (desktop ↔ web) can trickle their TURN relay
  // candidate before either side has set the remote description. The old path
  // dropped it (addIceCandidate throws before setRemoteDescription), which
  // could kill the only route across symmetric NATs — the data channel then
  // never opened and the guest saw no avatar/cursor.
  const { transport, sockets, connections } = setup({ selfId: "aaa" });
  sockets.instances[0].open();
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["zzz"] });
  const pc = () => connections.instances[0];

  // The relay candidate arrives FIRST, before any offer/remote description.
  await sockets.instances[0].receive({
    t: MSG.SIGNAL,
    to: "aaa",
    from: "zzz",
    data: { candidate: { candidate: "relay-c1" } },
  });
  assert.equal(
    pc().addedCandidates?.length ?? 0,
    0,
    "not applied before the remote description is set",
  );

  // Now the offer lands: it must apply the buffered candidate too.
  await sockets.instances[0].receive({
    t: MSG.SIGNAL,
    to: "aaa",
    from: "zzz",
    data: { sdp: { type: "offer", sdp: "zzz-offer" } },
  });
  assert.deepEqual(
    pc().addedCandidates,
    [{ candidate: "relay-c1" }],
    "the buffered candidate was flushed after setRemoteDescription",
  );

  // A later candidate arrives after the description is set — applied directly.
  await sockets.instances[0].receive({
    t: MSG.SIGNAL,
    to: "aaa",
    from: "zzz",
    data: { candidate: { candidate: "relay-c2" } },
  });
  assert.deepEqual(pc().addedCandidates, [
    { candidate: "relay-c1" },
    { candidate: "relay-c2" },
  ]);

  transport.close();
});

test("a candidate that fails to apply is swallowed, not thrown", async () => {
  const { transport, sockets, connections } = setup({ selfId: "aaa" });
  sockets.instances[0].open();
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["zzz"] });
  connections.instances[0].addIceThrows = true;
  await assert.doesNotReject(
    sockets.instances[0].receive({
      t: MSG.SIGNAL,
      to: "aaa",
      from: "zzz",
      data: { candidate: { candidate: "bad" } },
    }),
  );
  transport.close();
});

test("a data channel received on the answerer side wires up events", async () => {
  const peers = [];
  const peersGone = [];
  const messages = [];
  const { transport, sockets, connections } = setup({
    selfId: "aaa",
    handlers: {
      onPeer: (id) => peers.push(id),
      onPeerGone: (id) => peersGone.push(id),
      onMessage: (id, d) => messages.push([id, d]),
    },
  });
  sockets.instances[0].open();
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["zzz"] });

  // The remote's data channel arrives; attachChannel wires it up.
  const channel = makeChannel({ readyState: "open" });
  connections.instances[0].receiveDataChannel(channel);
  channel.open(); // fires onopen -> CONNECTED + onPeer
  assert.ok(
    peers.includes("zzz"),
    "the peer is announced once the channel opens",
  );

  channel.message("from-z");
  assert.deepEqual(messages, [["zzz", "from-z"]]);

  // The remote closing the channel drops the peer.
  channel.onclose?.();
  assert.deepEqual(peersGone, ["zzz"]);
});

// ---- socket robustness -----------------------------------------------------
test("a malformed socket frame is ignored instead of crashing the transport", async () => {
  const { transport, sockets } = setup({ selfId: "zzz" });
  sockets.instances[0].open();
  // decode("not-json") throws; the onmessage guard swallows it.
  assert.doesNotThrow(() => sockets.instances[0].receiveRaw("not-json"));
  transport.close();
});

test("a socket close reports CONNECTED when peers remain, and CONNECTING otherwise", async () => {
  const statuses = [];
  const s2 = setup({
    selfId: "zzz",
    handlers: { onStatus: (st) => statuses.push(st) },
  });
  s2.sockets.instances[0].open();
  await s2.sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  const channel = s2.connections.instances[0].channels[0];
  channel.open();

  // Peers remain: a dropped socket keeps the room "connected" (introductions paused).
  s2.sockets.instances[0].onclose();
  assert.ok(
    statuses.includes(STATUS.CONNECTED),
    "stays connected while peers remain",
  );
  s2.transport.close();
});

test("closing the transport tolerates a throwing socket and a throwing connection", async () => {
  const { transport, sockets, connections } = setup({ selfId: "zzz" });
  sockets.instances[0].open();
  sockets.instances[0].closeThrows = true;

  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  connections.instances[0].closeThrows = true;
  assert.doesNotThrow(() => transport.close());
});

test("the transport refuses to signal a peer while the socket is closed", async () => {
  const { transport, sockets, connections } = setup({ selfId: "zzz" });
  // Socket never opened: an offer attempt must not throw.
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  assert.equal(
    sockets.instances[0].sent.length,
    0,
    "nothing signalled with a closed socket",
  );
  transport.close();
});

test("re-negotiation backoff re-offers from the smaller side (waits) after an ICE failure", async () => {
  const { transport, sockets, connections, timers } = setup({ selfId: "aaa" });
  sockets.instances[0].open();
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["bbb"] });
  assert.equal(offers(sockets).length, 0, "aaa is smaller: it waits for bbb");

  connections.instances[0].fail();
  const timerIndex = timers.pending.findIndex(Boolean);
  assert.ok(timerIndex >= 0, "an ICE retry is scheduled");
  timers.fire(timerIndex);
  await new Promise((r) => setImmediate(r));
  // The retry on the smaller side re-arms a fresh wait (peerFor), not an offer.
  assert.equal(offers(sockets).length, 0, "still no offer from the smaller id");
  assert.ok(
    connections.instances.length >= 2,
    "a fresh connection is created to wait",
  );
  transport.close();
});

test("opening the channel clears a pending ICE retry timer for that peer", async () => {
  const { transport, sockets, connections, timers } = setup({ selfId: "zzz" });
  sockets.instances[0].open();
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  connections.instances[0].fail();
  const timerIndex = timers.pending.findIndex(Boolean);
  assert.ok(timerIndex >= 0, "an ICE retry is scheduled for aaa");

  // Re-introduced before the timer fires: a fresh handshake starts, and when
  // its channel opens the stale retry timer must be cancelled (clearIceRetry).
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  const fresh = connections.instances[1];
  fresh.channels[0].open();
  assert.equal(
    timers.pending[timerIndex],
    null,
    "the pending retry was unscheduled",
  );
  transport.close();
});
