import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

import {
  createRoomId,
  createRoomSecret,
  isValidRoomId,
  parseRoomId,
  roomIdFromLocation,
  roomSecretFromLink,
  roomUrl,
} from "../../src/canvas/collab/room.js";
import {
  MSG,
  PROTOCOL_VERSION,
  ProtocolError,
  decode,
  encode,
} from "../../src/canvas/collab/protocol.js";
import {
  colourFor,
  createPresence,
  initialsFor,
  PEER_TIMEOUT_MS,
} from "../../src/canvas/collab/presence.js";

// ------------------------------------------------------------------- rooms

test("a generated room id is valid and unambiguous to retype", () => {
  const id = createRoomId();
  assert.ok(isValidRoomId(id), id);
  assert.equal(id.length, 20);
  // These are the characters people mix up reading an id off a screen.
  assert.ok(!/[01ilo]/.test(id), id);
});

test("room ids do not repeat over many draws", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(createRoomId());
  assert.equal(seen.size, 500);
});

test("the id alphabet is used evenly rather than favouring its start", () => {
  // Rejection sampling exists for this: `byte % 31` would over-pick the first
  // few characters, quietly shrinking the id space.
  const counts = new Map();
  for (let i = 0; i < 2000; i += 1) {
    for (const ch of createRoomId()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  const values = [...counts.values()];
  const expected = (2000 * 20) / 31;
  assert.ok(Math.min(...values) > expected * 0.6, "no character is starved");
  assert.ok(Math.max(...values) < expected * 1.4, "no character dominates");
});

test("a room link round-trips", () => {
  const id = createRoomId();
  assert.equal(parseRoomId(roomUrl(id, "https://voo.run")), id);
});

test("room secrets are 128-bit base64url values and round-trip in the fragment", () => {
  const id = createRoomId();
  const secret = createRoomSecret();
  const link = roomUrl(id, "https://voo.run", "view", secret);
  assert.match(secret, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(new URL(link).searchParams.get("access"), "view");
  assert.match(link, /#k=[A-Za-z0-9_-]{22}$/);
  assert.equal(roomSecretFromLink(link), secret);
});

test("a room link without a secret has no join secret", () => {
  const id = createRoomId();
  const link = roomUrl(id, "https://voo.run");
  assert.equal(roomSecretFromLink(link), null);
  assert.equal(roomSecretFromLink(`${link}#k=short`), null);
});

test("a pasted link survives the mess chat apps add", () => {
  const id = "23456789abcdefghjkmn"; // 20-char, valid alphabet
  assert.equal(parseRoomId(`https://voo.run/r/${id}`), id);
  assert.equal(parseRoomId(`https://voo.run/r/${id}/`), id);
  assert.equal(parseRoomId(`  https://voo.run/r/${id}?utm=x  `), id);
  assert.equal(parseRoomId(`/r/${id}`), id);
  assert.equal(parseRoomId(id), id);
  assert.equal(parseRoomId(`https://voo.run/editor/?r=${id}#k=abcdefghijklmnopqrstuv`), id);
  assert.equal(parseRoomId(`/editor/?room=${id}`), id);
  assert.equal(parseRoomId("https://voo.run/editor/?r=SHORT"), null);
});

test("a link that is not a room is not mistaken for one", () => {
  assert.equal(parseRoomId("https://voo.run/editor/"), null);
  assert.equal(parseRoomId("https://voo.run/r/SHORT"), null);
  assert.equal(
    parseRoomId("https://voo.run/r/0000oooo"),
    null,
    "excluded chars",
  );
  assert.equal(parseRoomId(""), null);
  assert.equal(parseRoomId(null), null);
});

test("the room in a page address is read from the path or the r parameter", () => {
  const id = "23456789abcdefghjkmn"; // 20-char, valid alphabet
  const at = (pathname, search = "") => ({ pathname, search });
  assert.equal(roomIdFromLocation(at(`/r/${id}`)), id, "the shared link path");
  assert.equal(
    roomIdFromLocation(at("/editor/", `?r=${id}`)),
    id,
    "the parameter the landing page hands the editor",
  );
  // The web sidebar used to write this one. Nothing reads it, so a room joined
  // through that button was never rejoined — keep it pinned as unread.
  assert.equal(roomIdFromLocation(at("/editor/", `?room=${id}`)), null);
  assert.equal(roomIdFromLocation(at("/editor/")), null);
  assert.equal(roomIdFromLocation(null), null);
});

// ---------------------------------------------------------------- protocol

test("a message round-trips with its type spelled out", () => {
  const wire = encode(MSG.HELLO, { peerId: "p1", name: "Ada", colour: "#fff" });
  assert.deepEqual(decode(wire), {
    type: MSG.HELLO,
    peerId: "p1",
    name: "Ada",
    colour: "#fff",
  });
});

test("a message missing a required field never reaches the wire", () => {
  assert.throws(() => encode(MSG.HELLO, { peerId: "p1" }), ProtocolError);
  assert.throws(() => encode("nonsense", {}), /unknownType/);
});

test("null does not pass as an object field", () => {
  // typeof null === "object"; without the explicit check a null document
  // would encode cleanly and blow up in the merge instead.
  assert.throws(() => encode(MSG.DOC, { workflowId: "w", document: null }));
});

test("a peer on a different protocol version is named, not ignored", () => {
  const wire = JSON.stringify({
    t: MSG.BYE,
    v: PROTOCOL_VERSION + 1,
    peerId: "p",
  });
  assert.throws(() => decode(wire), /versionMismatch/);
});

test("garbage off the channel raises rather than crashing the reader", () => {
  assert.throws(() => decode("not json"), /notJson/);
  assert.throws(() => decode("[]"), /unknownType/);
  assert.throws(
    () => decode(JSON.stringify({ t: MSG.DOC, v: 1 })),
    /missingField/,
  );
});

// ---------------------------------------------------------------- presence

test("a peer keeps its colour across reconnects", () => {
  assert.equal(colourFor("peer-abc"), colourFor("peer-abc"));
});

test("initials read sensibly for latin and for CJK", () => {
  assert.equal(initialsFor("Ada Lovelace"), "AL");
  assert.equal(initialsFor("ada"), "AD");
  assert.equal(initialsFor("赵大宝"), "赵");
  assert.equal(initialsFor("  "), "?");
});

test("the roster lists you first, then arrivals in order", () => {
  const presence = createPresence("me");
  presence.upsert("b", { name: "B" });
  presence.upsert("me", { name: "Me" });
  presence.upsert("a", { name: "A" });
  assert.deepEqual(
    presence.list().map((p) => p.peerId),
    ["me", "b", "a"],
  );
});

test("a cursor update does not reshuffle the avatars", () => {
  const presence = createPresence("me");
  presence.upsert("me", {});
  presence.upsert("a", {});
  presence.upsert("b", {});
  const before = presence.list().map((p) => p.peerId);
  presence.setCursor("b", { x: 1, y: 2 });
  assert.deepEqual(
    presence.list().map((p) => p.peerId),
    before,
  );
});

test("a cursor for someone who is not here is ignored", () => {
  const presence = createPresence("me");
  assert.equal(presence.setCursor("ghost", { x: 0, y: 0 }), null);
  assert.equal(presence.size, 0);
});

test("a peer that goes quiet is dropped; you never are", () => {
  // Closing a tab sends no BYE, so silence has to be what removes a peer.
  let clock = 1000;
  const presence = createPresence("me", () => clock);
  presence.upsert("me", {});
  presence.upsert("gone", {});
  clock += PEER_TIMEOUT_MS + 1;
  assert.deepEqual(presence.sweep(), ["gone"]);
  assert.deepEqual(
    presence.list().map((p) => p.peerId),
    ["me"],
  );
});

test("a peer that keeps talking is kept", () => {
  let clock = 1000;
  const presence = createPresence("me", () => clock);
  presence.upsert("chatty", {});
  clock += PEER_TIMEOUT_MS - 1;
  presence.touch("chatty");
  clock += PEER_TIMEOUT_MS - 1;
  assert.deepEqual(presence.sweep(), []);
});


test.each([
  "http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173",
  "http://192.168.1.5:5173", "voo://app", "chrome-extension://test",
  "https://preview.example.com", "https://www.voo.run", "https://voo.run",
])("room links use the published origin when created on %s", origin => {
  const id = "23456789abcdefghjkmn";
  const secret = "abcdefghijklmnopqrstuv";
  vi.stubGlobal("location", { origin });
  try {
    for (const access of ["edit", "view"]) {
      const expected = `https://voo.run/editor/?r=${id}${access === "view" ? "&access=view" : ""}#k=${secret}`;
      assert.equal(roomUrl(id, undefined, access, secret), expected);
      assert.equal(roomUrl(id, origin, access, secret), expected, "legacy origin argument cannot leak a private host");
      assert.equal(parseRoomId(expected), id);
      assert.equal(roomSecretFromLink(expected), secret);
    }
  } finally { vi.unstubAllGlobals(); }
});
