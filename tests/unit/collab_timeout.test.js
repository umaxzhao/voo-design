import assert from "node:assert/strict";
import { test } from "vitest";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

import { STATUS, createCollabSession } from "../../src/canvas/collab/session.js";
import coreEn from "../../src/shared/i18n/core-en.js";
import coreZh from "../../src/shared/i18n/core-zh.js";

function createHangingTransport() {
  let handlers = null;
  return {
    get handlers() {
      return handlers;
    },
    connect: (_room, h) => {
      handlers = h;
      return {
        send: () => {},
        broadcast: () => {},
        close: () => {},
      };
    },
  };
}

test("C4.1: Connection timeout transitions session to STATUS.FAILED with error 'timeout'", async () => {
  const transport = createHangingTransport();
  let latestSnapshot = null;

  let scheduledFn = null;
  let scheduledMs = null;

  const session = createCollabSession({
    connect: transport.connect,
    userId: "test-user",
    onChange: (snap) => {
      latestSnapshot = snap;
    },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn, ms) => {
      scheduledFn = fn;
      scheduledMs = ms;
      return 42;
    },
    clearTimeout: () => {},
    connectTimeoutMs: 15000,
  });

  session.start("room-hang");
  assert.equal(session.getSnapshot().status, STATUS.CONNECTING);
  assert.equal(session.getSnapshot().error, null);
  assert.equal(scheduledMs, 15000);
  assert.equal(typeof scheduledFn, "function");

  // Trigger the timeout callback
  scheduledFn();

  const failedSnapshot = session.getSnapshot();
  assert.equal(failedSnapshot.status, STATUS.FAILED, "Status must transition to FAILED on timeout");
  assert.equal(failedSnapshot.error, "timeout", "Snapshot error must record 'timeout'");
  assert.equal(latestSnapshot.status, STATUS.FAILED);
  assert.equal(latestSnapshot.error, "timeout");

  // Clean up
  session.stop();
  assert.equal(session.getSnapshot().status, STATUS.OFF);
  assert.equal(session.getSnapshot().error, null);
});

test("C4.2: Connected status cancels the connection timeout timer", async () => {
  const transport = createHangingTransport();
  let timerCleared = false;
  let scheduledFn = null;

  const session = createCollabSession({
    connect: transport.connect,
    userId: "test-user-2",
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn) => {
      scheduledFn = fn;
      return 99;
    },
    clearTimeout: (id) => {
      if (id === 99) timerCleared = true;
    },
    connectTimeoutMs: 15000,
  });

  session.start("room-connect-success");
  assert.equal(session.getSnapshot().status, STATUS.CONNECTING);

  // Transport connects successfully before timer expires
  transport.handlers.onStatus(STATUS.CONNECTED);

  assert.equal(timerCleared, true, "clearTimeout must be called on successful connection");
  assert.equal(session.getSnapshot().status, STATUS.CONNECTED);
  assert.equal(session.getSnapshot().error, null);

  // If the timer callback were to fire anyway, it must not overwrite CONNECTED
  if (scheduledFn) {
    scheduledFn();
  }
  assert.equal(session.getSnapshot().status, STATUS.CONNECTED);
  assert.equal(session.getSnapshot().error, null);

  session.stop();
});

test("C4.3: session.stop() clears any pending connection timeout timer", async () => {
  const transport = createHangingTransport();
  let timerCleared = false;

  const session = createCollabSession({
    connect: transport.connect,
    userId: "test-user-3",
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 101,
    clearTimeout: (id) => {
      if (id === 101) timerCleared = true;
    },
    connectTimeoutMs: 15000,
  });

  session.start("room-stop-early");
  assert.equal(session.getSnapshot().status, STATUS.CONNECTING);

  session.stop();
  assert.equal(timerCleared, true, "clearTimeout must be called on stop()");
  assert.equal(session.getSnapshot().status, STATUS.OFF);
  assert.equal(session.getSnapshot().error, null);
});

test("C4.4: i18n dictionaries provide consistent and non-empty collab.timeout strings", () => {
  assert.ok(coreEn["collab.timeout"], "core-en must define collab.timeout");
  assert.ok(coreZh["collab.timeout"], "core-zh must define collab.timeout");
  assert.ok(coreEn["collab.timeout"].length > 0);
  assert.ok(coreZh["collab.timeout"].length > 0);
});
