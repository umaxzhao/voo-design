import assert from "node:assert/strict";
import { test } from "vitest";

import {
  emitLocalStroke,
  emitRemoteStroke,
  onLocalStroke,
  onRemoteStroke,
} from "../../src/canvas/collab/stroke_bus.js";

test("a local stroke reaches the wire, a remote one reaches the editor", () => {
  // The two directions are separate on purpose: a replayed stroke must never
  // come back out, or two peers bounce the same paint between them for ever.
  const outbound = [];
  const inbound = [];
  const offLocal = onLocalStroke((stroke) => outbound.push(stroke));
  const offRemote = onRemoteStroke((stroke) => inbound.push(stroke));

  emitLocalStroke({ nodeId: "a" });
  emitRemoteStroke({ nodeId: "b" });

  assert.deepEqual(outbound, [{ nodeId: "a" }]);
  assert.deepEqual(inbound, [{ nodeId: "b" }]);

  offLocal();
  offRemote();
  emitLocalStroke({ nodeId: "c" });
  emitRemoteStroke({ nodeId: "d" });
  assert.equal(outbound.length, 1, "unsubscribed");
  assert.equal(inbound.length, 1, "unsubscribed");
});

test("emitting with nobody listening is harmless", () => {
  // A solo editor publishes every stroke; the bus simply has no listeners.
  assert.doesNotThrow(() => emitLocalStroke({ nodeId: "x" }));
  assert.doesNotThrow(() => emitRemoteStroke({ nodeId: "x" }));
});
