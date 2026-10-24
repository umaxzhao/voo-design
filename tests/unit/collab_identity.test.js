import assert from "node:assert/strict";
import { test } from "vitest";

/**
 * collab/identity.js: the per-device collaboration identity — a name plus a
 * DiceBear avatar seed, kept in localStorage, invented on first use.
 *
 * Everything global the module touches (localStorage, crypto) is stubbed per
 * test and restored in a finally, deleting globals that were not there before
 * rather than assigning undefined back.
 */

import {
  avatarUrl,
  loadIdentity,
  randomSeed,
  saveIdentity,
} from "../../src/canvas/collab/identity.js";

/** Installs fake globals; returns a restore() that puts back exactly what was there. */
function installFakes({ storage, cryptoImpl } = {}) {
  // NOTE: globalThis.crypto is a getter-only accessor in Node, so plain
  // assignment throws — property descriptors are the only way in and out.
  const storageDesc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const cryptoDesc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const define = (name, value) =>
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  if (storage !== undefined) define("localStorage", storage);
  if (cryptoImpl !== undefined) define("crypto", cryptoImpl);
  return () => {
    if (storageDesc) Object.defineProperty(globalThis, "localStorage", storageDesc);
    else delete globalThis.localStorage;
    if (cryptoDesc) Object.defineProperty(globalThis, "crypto", cryptoDesc);
    else delete globalThis.crypto;
  };
}

/** A recording localStorage stand-in. */
function makeFakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  const calls = { getItem: [], setItem: [] };
  return {
    store,
    calls,
    getItem(key) {
      calls.getItem.push(key);
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      calls.setItem.push([key, value]);
      store.set(key, value);
    },
  };
}

/** Deterministic crypto: each getRandomValues fills incrementing bytes. */
function makeFakeCrypto(start = 1) {
  const calls = [];
  let counter = start;
  return {
    calls,
    getRandomValues(arr) {
      calls.push(arr);
      for (let i = 0; i < arr.length; i += 1) {
        arr[i] = counter % 256;
        counter += 1;
      }
      return arr;
    },
  };
}

const STORAGE_KEY = "voo.collab.identity";

test("avatarUrl: null/undefined fall back to an empty seed; special characters are percent-encoded", () => {
  // The DiceBear base URL is a module-private constant, so only its origin is
  // pinned literally; the seed — the part this function actually computes —
  // is derived through encodeURIComponent itself.
  for (const seed of [null, undefined]) {
    const url = avatarUrl(seed);
    assert.ok(url.startsWith("https://api.dicebear.com/"));
    assert.ok(url.endsWith(`?seed=${encodeURIComponent("")}`));
  }
  const seed = "a b&c=d?e/字";
  assert.ok(
    avatarUrl(seed).endsWith(`?seed=${encodeURIComponent(seed)}`),
    "the seed must go through encodeURIComponent",
  );
  // And a plain seed survives unescaped, as a sanity anchor.
  assert.ok(avatarUrl("plain-seed_1").endsWith("?seed=plain-seed_1"));
});

test("randomSeed: 6 random bytes, base36-joined — variable length, [0-9a-z] only", () => {
  const cryptoImpl = makeFakeCrypto(1);
  const restore = installFakes({ cryptoImpl });
  try {
    const seed = randomSeed();
    // getRandomValues received exactly one Uint8Array of length 6.
    assert.equal(cryptoImpl.calls.length, 1);
    assert.ok(cryptoImpl.calls[0] instanceof Uint8Array);
    assert.equal(cryptoImpl.calls[0].length, 6);
    // Expected value derived the same way the code computes it: bytes 1..6.
    const expected = [1, 2, 3, 4, 5, 6].map((b) => b.toString(36)).join("");
    assert.equal(seed, expected);
    // Charset and non-emptiness — the LENGTH is deliberately not pinned:
    // each byte yields one or two base36 characters, so length varies.
    assert.ok(seed.length > 0);
    assert.match(seed, /^[0-9a-z]+$/);

    // Bytes >= 36 produce two-character chunks, proving the variable length.
    const cryptoBig = makeFakeCrypto(250); // 250..255, all >= 36
    Object.defineProperty(globalThis, "crypto", {
      value: cryptoBig,
      writable: true,
      configurable: true,
    });
    const bigSeed = randomSeed();
    const expectedBig = [250, 251, 252, 253, 254, 255]
      .map((b) => b.toString(36))
      .join("");
    assert.equal(bigSeed, expectedBig);
    assert.ok(bigSeed.length > 6);
  } finally {
    restore();
  }
});

test("loadIdentity: empty storage invents an identity and writes it back", () => {
  const storage = makeFakeStorage();
  const restore = installFakes({ storage, cryptoImpl: makeFakeCrypto(1) });
  try {
    const identity = loadIdentity();
    assert.equal(typeof identity.userId, "string");
    assert.ok(identity.userId.length > 0);
    assert.equal(identity.name, "");
    assert.equal(typeof identity.avatarSeed, "string");
    assert.ok(identity.avatarSeed.length > 0);

    // Written back under the module's storage key, payload mirrors the return.
    assert.equal(storage.calls.setItem.length, 1);
    const [key, value] = storage.calls.setItem[0];
    assert.equal(key, STORAGE_KEY);
    assert.deepEqual(JSON.parse(value), identity);
  } finally {
    restore();
  }
});

test("loadIdentity: a valid stored identity is returned as-is, with no write-back", () => {
  const stored = { userId: "u-1", name: "Ada", avatarSeed: "seed-1" };
  const storage = makeFakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
  const restore = installFakes({ storage });
  try {
    const identity = loadIdentity();
    assert.deepEqual(identity, stored);
    assert.equal(storage.calls.setItem.length, 0);
  } finally {
    restore();
  }
});

test("loadIdentity: corrupt JSON still yields a usable identity and never throws", () => {
  const storage = makeFakeStorage({ [STORAGE_KEY]: "{not json" });
  const restore = installFakes({ storage, cryptoImpl: makeFakeCrypto(7) });
  try {
    const identity = loadIdentity();
    assert.equal(typeof identity.userId, "string");
    assert.ok(identity.userId.length > 0);
    assert.equal(identity.name, "");
    assert.ok(identity.avatarSeed.length > 0);
  } finally {
    restore();
  }
});

test("loadIdentity: a throwing getItem is caught the same way", () => {
  const storage = {
    getItem() {
      throw new Error("blocked storage");
    },
    setItem() {},
  };
  const restore = installFakes({ storage, cryptoImpl: makeFakeCrypto(7) });
  try {
    const identity = loadIdentity();
    assert.ok(identity.userId.length > 0);
    assert.equal(identity.name, "");
  } finally {
    restore();
  }
});

test("loadIdentity: per-field validation — name may be empty, userId/avatarSeed may not", () => {
  // userId valid -> kept, and because it is kept there is NO write-back even
  // though avatarSeed had to be re-invented (the write-back condition only
  // watches userId). name as a non-string falls back to "".
  const stored = { userId: "u-keep", name: 123, avatarSeed: "" };
  const storage = makeFakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
  const restore = installFakes({ storage, cryptoImpl: makeFakeCrypto(7) });
  try {
    const identity = loadIdentity();
    assert.equal(identity.userId, "u-keep");
    assert.equal(identity.name, "");
    assert.ok(identity.avatarSeed.length > 0);
    assert.equal(storage.calls.setItem.length, 0);
  } finally {
    restore();
  }
});

test("loadIdentity: an invalid userId is replaced AND that triggers the write-back", () => {
  for (const badUserId of [42, "", null, undefined]) {
    const stored = { userId: badUserId, name: "Ada", avatarSeed: "seed-1" };
    const storage = makeFakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
    const restore = installFakes({ storage, cryptoImpl: makeFakeCrypto(7) });
    try {
      const identity = loadIdentity();
      assert.ok(identity.userId.length > 0);
      assert.notEqual(identity.userId, badUserId);
      // The valid name and avatarSeed survive; only userId was re-invented.
      assert.equal(identity.name, "Ada");
      assert.equal(identity.avatarSeed, "seed-1");
      // userId changed -> line ~58 writes the repaired identity back.
      assert.equal(storage.calls.setItem.length, 1);
      assert.deepEqual(JSON.parse(storage.calls.setItem[0][1]), identity);
    } finally {
      restore();
    }
  }
});

test("saveIdentity: writes a three-field JSON; null/missing fields fall back", () => {
  const storage = makeFakeStorage();
  const restore = installFakes({ storage, cryptoImpl: makeFakeCrypto(1) });
  try {
    saveIdentity({ userId: "u-9", name: "Grace", avatarSeed: "s-9" });
    const [key, value] = storage.calls.setItem.at(-1);
    assert.equal(key, STORAGE_KEY);
    const parsed = JSON.parse(value); // parse it back — never compare strings
    assert.deepEqual(Object.keys(parsed).sort(), ["avatarSeed", "name", "userId"]);
    assert.deepEqual(parsed, { userId: "u-9", name: "Grace", avatarSeed: "s-9" });

    // null identity: ?? fallbacks — fresh seeds for userId/avatarSeed, "" name.
    saveIdentity(null);
    const fallback = JSON.parse(storage.calls.setItem.at(-1)[1]);
    assert.ok(fallback.userId.length > 0);
    assert.equal(fallback.name, "");
    assert.ok(fallback.avatarSeed.length > 0);

    // Partial identity: only the missing fields are invented.
    saveIdentity({ name: "only-name" });
    const partial = JSON.parse(storage.calls.setItem.at(-1)[1]);
    assert.ok(partial.userId.length > 0);
    assert.equal(partial.name, "only-name");
    assert.ok(partial.avatarSeed.length > 0);
  } finally {
    restore();
  }
});

test("saveIdentity: a throwing setItem is silently swallowed", () => {
  const storage = {
    getItem: () => null,
    setItem() {
      throw new Error("quota exceeded");
    },
  };
  const restore = installFakes({ storage });
  try {
    assert.doesNotThrow(() => saveIdentity({ userId: "u", name: "n", avatarSeed: "s" }));
  } finally {
    restore();
  }
});

test("loadIdentity and saveIdentity both work with localStorage entirely absent", () => {
  // Drive the optional-chaining branch by defining localStorage away. If the
  // host has a non-configurable localStorage, define it to undefined instead —
  // `undefined?.getItem` is the same branch as a missing global.
  const restore = installFakes(); // installs nothing, restores descriptors
  const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  delete globalThis.localStorage;
  if ("localStorage" in globalThis) {
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }
  try {
    assert.equal(globalThis.localStorage, undefined);
    const identity = loadIdentity(); // must not throw
    assert.ok(identity.userId.length > 0);
    assert.doesNotThrow(() => saveIdentity(identity));
  } finally {
    delete globalThis.localStorage;
    if (desc) Object.defineProperty(globalThis, "localStorage", desc);
    restore();
  }
});
