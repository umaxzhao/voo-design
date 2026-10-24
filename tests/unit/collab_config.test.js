import { test, vi } from "vitest";
import assert from "node:assert";

/** A fresh module instance per scenario (query string busts ESM's cache). */
const load = (n) =>
  new URL(`../../src/canvas/collab/collab_config.js?t=${n}`, import.meta.url).href;

// Vitest normalizes query strings on dynamic imports; reset the module cache
// so each scenario exercises a fresh config loader as under node:test.
const resetModules = () => vi.resetModules();

test("loadCollabConfig installs ICE servers and signaling url from a hosted fetch", async () => {
  resetModules();
  const prevIce = globalThis.__VOO_ICE_SERVERS__;
  const prevUrl = globalThis.__VOO_SIGNALING_URL__;
  const prevFetch = globalThis.fetch;
  const prevDesktop = globalThis.vooDesktop;
  try {
    delete globalThis.__VOO_ICE_SERVERS__;
    delete globalThis.__VOO_SIGNALING_URL__;
    globalThis.vooDesktop = undefined;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return {
            iceServers: [
              { urls: "turn:127.0.0.1:3478", username: "voo", credential: "x" },
            ],
            signalingUrl: "wss://voo.run/collab",
          };
        },
      };
    };

    const { loadCollabConfig } = await import(load(1));
    await loadCollabConfig();
    await loadCollabConfig(); // second call must not re-fetch

    assert.equal(calls, 1, "config is fetched exactly once");
    assert.deepEqual(globalThis.__VOO_ICE_SERVERS__, [
      { urls: "turn:127.0.0.1:3478", username: "voo", credential: "x" },
    ]);
    assert.equal(globalThis.__VOO_SIGNALING_URL__, "wss://voo.run/collab");
  } finally {
    globalThis.fetch = prevFetch;
    globalThis.vooDesktop = prevDesktop;
    delete globalThis.__VOO_ICE_SERVERS__;
    delete globalThis.__VOO_SIGNALING_URL__;
    if (prevIce !== undefined) globalThis.__VOO_ICE_SERVERS__ = prevIce;
    if (prevUrl !== undefined) globalThis.__VOO_SIGNALING_URL__ = prevUrl;
  }
});

test("loadCollabConfig keeps defaults (no throw) when the config is unreachable", async () => {
  resetModules();
  const prevFetch = globalThis.fetch;
  const prevDesktop = globalThis.vooDesktop;
  try {
    globalThis.vooDesktop = undefined;
    globalThis.fetch = async () => {
      throw new Error("boom");
    };
    delete globalThis.__VOO_ICE_SERVERS__;
    delete globalThis.__VOO_SIGNALING_URL__;

    const { loadCollabConfig } = await import(load(2));
    await loadCollabConfig();

    assert.equal(globalThis.__VOO_ICE_SERVERS__, undefined, "keeps the built-in STUN list");
    assert.equal(globalThis.__VOO_SIGNALING_URL__, undefined);
  } finally {
    globalThis.fetch = prevFetch;
    globalThis.vooDesktop = prevDesktop;
    delete globalThis.__VOO_ICE_SERVERS__;
    delete globalThis.__VOO_SIGNALING_URL__;
  }
});

test("loadCollabConfig uses the desktop vooDesktop.fetchJson bridge when present", async () => {
  resetModules();
  const prevDesktop = globalThis.vooDesktop;
  try {
    let used = false;
    globalThis.vooDesktop = {
      fetchJson: async () => {
        used = true;
        return { ok: true, data: { iceServers: [{ urls: "turn:t.example" }] } };
      },
    };
    globalThis.fetch = async () => {
      throw new Error("renderer fetch must not be used under voo://app");
    };
    delete globalThis.__VOO_ICE_SERVERS__;

    const { loadCollabConfig } = await import(load(3));
    await loadCollabConfig();

    assert.equal(used, true, "desktop bridge is used");
    assert.deepEqual(globalThis.__VOO_ICE_SERVERS__, [{ urls: "turn:t.example" }]);
  } finally {
    globalThis.vooDesktop = prevDesktop;
    delete globalThis.__VOO_ICE_SERVERS__;
  }
});

test("loadCollabConfig times out gracefully when fetch hangs", async () => {
  resetModules();
  const prevFetch = globalThis.fetch;
  const prevDesktop = globalThis.vooDesktop;
  try {
    globalThis.vooDesktop = undefined;
    // Simulate hanging fetch
    globalThis.fetch = () => new Promise(() => {});
    delete globalThis.__VOO_ICE_SERVERS__;
    delete globalThis.__VOO_SIGNALING_URL__;

    const { loadCollabConfig } = await import(load(4));
    // Provide a small timeout (50ms) for the test
    const started = Date.now();
    await loadCollabConfig({ timeoutMs: 50 });
    const elapsed = Date.now() - started;

    assert.ok(elapsed < 1000, `timed out quickly, took ${elapsed}ms`);
    assert.equal(globalThis.__VOO_ICE_SERVERS__, undefined, "falls back to defaults");
    assert.equal(globalThis.__VOO_SIGNALING_URL__, undefined);
  } finally {
    globalThis.fetch = prevFetch;
    globalThis.vooDesktop = prevDesktop;
    delete globalThis.__VOO_ICE_SERVERS__;
    delete globalThis.__VOO_SIGNALING_URL__;
  }
});
