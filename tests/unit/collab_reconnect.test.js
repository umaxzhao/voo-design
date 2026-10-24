import assert from "node:assert/strict";
import { test } from "vitest";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

import { MSG, encode } from "../../src/canvas/collab/protocol.js";
import { STATUS } from "../../src/canvas/collab/session.js";
import { createWebRtcTransport } from "../../src/canvas/collab/webrtc_transport.js";

/**
 * A scriptable WebSocket. Instances record what was sent; the test fires
 * open/close/message by hand.
 */
function fakeWebSockets() {
  const instances = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
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
    }

    receive(message) {
      return this.onmessage?.({ data: encode(message.t, message) });
    }
  }
  return { FakeWebSocket, instances };
}

/**
 * A scriptable RTCPeerConnection. `close()` deliberately fires no events —
 * the real thing reports them asynchronously, after the transport has already
 * forgotten the peer, and mirroring that keeps the fake honest about
 * re-entrancy.
 */
function fakePeerConnections() {
  const instances = [];
  class FakePeerConnection {
    constructor() {
      this.connectionState = "new";
      this.channels = [];
      instances.push(this);
    }

    createDataChannel() {
      const channel = {
        readyState: "connecting",
        bufferedAmount: 0,
        sent: [],
        send(wire) {
          this.sent.push(wire);
        },
        close() {
          this.readyState = "closed";
        },
        addEventListener() {},
        removeEventListener() {},
      };
      this.channels.push(channel);
      return channel;
    }

    async createOffer() {
      return { type: "offer", sdp: "fake-offer" };
    }

    async createAnswer() {
      return { type: "answer", sdp: "fake-answer" };
    }

    async setLocalDescription(description) {
      this.localDescription = description;
    }

    async setRemoteDescription() {}

    async addIceCandidate() {}

    close() {
      this.connectionState = "closed";
    }

    fail() {
      this.connectionState = "failed";
      this.onconnectionstatechange?.();
    }
  }
  return { FakePeerConnection, instances };
}

/** Timers the test fires manually, in the order they were scheduled. */
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

function setup({ selfId = "zzz" } = {}) {
  const sockets = fakeWebSockets();
  const connections = fakePeerConnections();
  const timers = fakeTimers();
  const statuses = [];
  const transport = createWebRtcTransport(
    "room1234",
    { onStatus: (status) => statuses.push(status) },
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

test("a dropped signalling socket is redialled with backoff and rejoins", async () => {
  const { transport, sockets, timers, statuses } = setup();
  sockets.instances[0].open();
  assert.deepEqual(sockets.instances[0].sent.map((m) => m.t), [MSG.JOIN]);

  sockets.instances[0].onclose();
  assert.equal(timers.pending.length, 1);
  assert.equal(timers.pending[0].ms, 1000, "first retry a second out");
  assert.ok(statuses.includes(STATUS.CONNECTING), "the session is dialling again");

  timers.fire(0);
  assert.equal(sockets.instances.length, 2, "redialled");
  sockets.instances[1].open();
  assert.deepEqual(sockets.instances[1].sent.map((m) => m.t), [MSG.JOIN], "rejoined the room");

  sockets.instances[1].onclose();
  assert.equal(timers.pending[1].ms, 1000, "a successful connection resets the backoff");

  transport.close();
});

test("closing the transport cancels a pending redial", () => {
  const { transport, sockets, timers } = setup();
  sockets.instances[0].open();
  sockets.instances[0].onclose();
  assert.ok(timers.pending[0], "a redial is pending");
  transport.close();
  assert.equal(timers.pending[0], null, "cancelled");
  assert.equal(sockets.instances.length, 1, "and never fired");
});

test("a failed ICE connection is re-negotiated a few times, then given up", async () => {
  const { transport, sockets, connections, timers, statuses } = setup({ selfId: "zzz" });
  sockets.instances[0].open();
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  const offers = () =>
    sockets.instances[0].sent.filter(
      (m) => m.t === MSG.SIGNAL && m.data?.sdp?.type === "offer",
    ).length;
  assert.equal(offers(), 1, "the larger id offered");
  assert.equal(connections.instances.length, 1);

  // Fail, wait, retry — three times.
  for (const [index, delay] of [1000, 2000, 4000].entries()) {
    connections.instances[index].fail();
    const timerIndex = timers.pending.findIndex(Boolean);
    assert.equal(timers.pending[timerIndex].ms, delay, `retry ${index + 1} after ${delay}ms`);
    timers.fire(timerIndex);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(offers(), index + 2, `offer #${index + 2} went out`);
  }
  assert.equal(connections.instances.length, 4, "each retry is a fresh connection");
  assert.ok(!statuses.includes(STATUS.FAILED), "still retrying, not failed");

  // The fourth failure exhausts the budget: a symmetric NAT cannot be
  // retried away, so the UI is told.
  connections.instances[3].fail();
  assert.ok(statuses.includes(STATUS.FAILED));
  assert.ok(timers.pending.every((timer) => !timer), "no further retries");

  transport.close();
});

test("a peer re-introduced via the roster cancels the scheduled retry", async () => {
  const { transport, sockets, connections, timers } = setup({ selfId: "zzz" });
  sockets.instances[0].open();
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  connections.instances[0].fail();
  assert.ok(timers.pending.some(Boolean), "a retry is pending");

  // The peer comes back through a fresh introduction before the timer fires —
  // the retry must not tear that down with a redundant re-negotiation.
  await sockets.instances[0].receive({ t: MSG.ROSTER, peers: ["aaa"] });
  assert.equal(connections.instances.length, 2, "re-introduced on a fresh connection");
  timers.fire(timers.pending.findIndex(Boolean));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connections.instances.length, 2, "the stale retry fired into a guard");

  transport.close();
});
