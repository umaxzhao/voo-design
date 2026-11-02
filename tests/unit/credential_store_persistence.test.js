import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  credentialArea,
  setCredentialAreaFactory,
  setSafeStorageBridge,
} from "../../src/shared/providers/credential_store.js";
import {
  clearProviderConfig,
  getProviderConfig,
  saveProviderConfig,
  submitProviderJob,
  streamProviderJob,
  testProvider,
} from "../../src/shared/providers/provider_client.js";
import { PROVIDER_ID } from "../../src/shared/providers.js";

// In-memory web storage mock
function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get size() {
      return store.size;
    },
    raw: (key) => store.get(key),
  };
}

describe("credential_store persistence & provider_client adapter", () => {
  let mockLocalStorage;
  let mockSessionStorage;

  beforeEach(() => {
    mockLocalStorage = createMemoryStorage();
    mockSessionStorage = createMemoryStorage();

    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("sessionStorage", mockSessionStorage);
    vi.stubGlobal("chrome", undefined);

    setCredentialAreaFactory(null);
    setSafeStorageBridge(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setCredentialAreaFactory(null);
    setSafeStorageBridge(null);
  });

  describe("credential_store web storage fallback & restart persistence", () => {
    it("falls back to localStorage when chrome.storage is unavailable", async () => {
      const area = credentialArea("local");
      expect(area).not.toBeNull();

      await area.set({ "test.key": { apiKey: "sk-12345" } });
      expect(mockLocalStorage.getItem("test.key")).toBeTruthy();

      const result = await area.get("test.key");
      expect(result["test.key"]).toEqual({ apiKey: "sk-12345" });
    });

    it("persists credentials across simulated restarts in local storage", async () => {
      const area = credentialArea("local");
      await area.set({ "ciw.provider.deepseek.local": { apiKey: "sk-deepseek-abc" } });

      // Simulate restart: session storage is wiped, but localStorage survives
      mockSessionStorage.clear();

      // Read after restart
      const freshArea = credentialArea("local");
      const readBack = await freshArea.get("ciw.provider.deepseek.local");
      expect(readBack["ciw.provider.deepseek.local"]).toEqual({ apiKey: "sk-deepseek-abc" });
    });

    it("does not persist session-scoped credentials across restarts", async () => {
      const sessionArea = credentialArea("session");
      await sessionArea.set({ "ciw.provider.deepseek.session": { apiKey: "sk-temp-key" } });

      const beforeRestart = await sessionArea.get("ciw.provider.deepseek.session");
      expect(beforeRestart["ciw.provider.deepseek.session"]).toEqual({ apiKey: "sk-temp-key" });

      // Simulate app restart / window close
      mockSessionStorage.clear();

      const afterRestart = await sessionArea.get("ciw.provider.deepseek.session");
      expect(afterRestart["ciw.provider.deepseek.session"]).toBeUndefined();
    });

    it("removes credentials from storage", async () => {
      const area = credentialArea("local");
      await area.set({ "ciw.provider.302ai.local": { apiKey: "sk-302-delete" } });
      expect(await area.get("ciw.provider.302ai.local")).toEqual({
        "ciw.provider.302ai.local": { apiKey: "sk-302-delete" },
      });

      await area.remove("ciw.provider.302ai.local");
      expect(mockLocalStorage.getItem("ciw.provider.302ai.local")).toBeNull();
      const readBack = await area.get("ciw.provider.302ai.local");
      expect(readBack["ciw.provider.302ai.local"]).toBeUndefined();
    });
  });

  describe("Electron safeStorage encryption", () => {
    it("encrypts credentials when safeStorage bridge is available", async () => {
      const mockBridge = {
        isAvailable: vi.fn().mockResolvedValue(true),
        encryptString: vi.fn().mockImplementation((plain) =>
          Promise.resolve(Buffer.from(`enc_${plain}`).toString("base64")),
        ),
        decryptString: vi.fn().mockImplementation((b64) => {
          const raw = Buffer.from(b64, "base64").toString("utf-8");
          return Promise.resolve(raw.replace(/^enc_/, ""));
        }),
      };

      setSafeStorageBridge(mockBridge);

      const area = credentialArea("local");
      await area.set({ "ciw.provider.deepseek.local": { apiKey: "sk-super-secret" } });

      expect(mockBridge.isAvailable).toHaveBeenCalled();
      expect(mockBridge.encryptString).toHaveBeenCalled();

      // Ensure raw value stored in localStorage is encrypted and does not contain plain text key
      const storedRaw = mockLocalStorage.getItem("ciw.provider.deepseek.local");
      expect(storedRaw).toContain("__voo_encrypted");
      expect(storedRaw).not.toContain("sk-super-secret");

      // Verify readback decrypts transparently
      const readBack = await area.get("ciw.provider.deepseek.local");
      expect(readBack["ciw.provider.deepseek.local"]).toEqual({ apiKey: "sk-super-secret" });
      expect(mockBridge.decryptString).toHaveBeenCalled();
    });

    it("persists and decrypts credentials across simulated restarts with safeStorage", async () => {
      const mockBridge = {
        isAvailable: vi.fn().mockResolvedValue(true),
        encryptString: vi.fn().mockImplementation((plain) =>
          Promise.resolve(Buffer.from(`enc_${plain}`).toString("base64")),
        ),
        decryptString: vi.fn().mockImplementation((b64) => {
          const raw = Buffer.from(b64, "base64").toString("utf-8");
          return Promise.resolve(raw.replace(/^enc_/, ""));
        }),
      };

      setSafeStorageBridge(mockBridge);
      const area = credentialArea("local");
      await area.set({ "ciw.provider.302ai.local": { apiKey: "sk-302-persistent" } });

      // Simulate restart: session wiped
      mockSessionStorage.clear();

      // Read back in new session with same safeStorage bridge
      const restoredArea = credentialArea("local");
      const result = await restoredArea.get("ciw.provider.302ai.local");
      expect(result["ciw.provider.302ai.local"]).toEqual({ apiKey: "sk-302-persistent" });
    });

    it("falls back to plain JSON when safeStorage is unavailable", async () => {
      const mockBridge = {
        isAvailable: vi.fn().mockResolvedValue(false),
        encryptString: vi.fn(),
        decryptString: vi.fn(),
      };

      setSafeStorageBridge(mockBridge);

      const area = credentialArea("local");
      await area.set({ "ciw.provider.openrouter.local": { apiKey: "sk-openrouter-key" } });

      expect(mockBridge.isAvailable).toHaveBeenCalled();
      expect(mockBridge.encryptString).not.toHaveBeenCalled();

      const readBack = await area.get("ciw.provider.openrouter.local");
      expect(readBack["ciw.provider.openrouter.local"]).toEqual({ apiKey: "sk-openrouter-key" });
    });
  });

  describe("readback verification on credential storage", () => {
    it("throws storage verification error if readback fails", async () => {
      // Mock storage that fails to store items
      const failingStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      };
      vi.stubGlobal("localStorage", failingStorage);

      const area = credentialArea("local");
      await expect(
        area.set({ "ciw.provider.deepseek.local": { apiKey: "sk-test" } }),
      ).rejects.toThrow(/readback verification failed/i);
    });

    it("throws storage verification error if readback value mismatches", async () => {
      // Mock storage that returns corrupted value on read
      const corruptedStorage = {
        getItem: () => JSON.stringify({ apiKey: "corrupted" }),
        setItem: () => {},
        removeItem: () => {},
      };
      vi.stubGlobal("localStorage", corruptedStorage);

      const area = credentialArea("local");
      await expect(
        area.set({ "ciw.provider.deepseek.local": { apiKey: "sk-real" } }),
      ).rejects.toThrow(/readback verification failed/i);
    });

    it("does not leak secret keys in error messages", async () => {
      const secret = "sk-super-confidential-token-9999";
      const failingStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      };
      vi.stubGlobal("localStorage", failingStorage);

      const area = credentialArea("local");
      try {
        await area.set({ "ciw.provider.deepseek.local": { apiKey: secret } });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err.message).not.toContain(secret);
        expect(err.message).toContain("ciw.provider.deepseek.local");
      }
    });
  });

  describe("provider_client standalone adapter (Fix QA bug 3)", () => {
    it("returns valid unconfigured config object and never returns null", async () => {
      const config = await getProviderConfig({ providerId: PROVIDER_ID.DEEPSEEK });

      expect(config).not.toBeNull();
      expect(typeof config).toBe("object");
      expect(config.configured).toBe(false);
      expect(config.providerId).toBe(PROVIDER_ID.DEEPSEEK);
      expect(config.persistence).toBe("session");
      expect(config.maskedKey).toBe("");
    });

    it("safely allows dereferencing .configured without TypeError", async () => {
      for (const id of [PROVIDER_ID.DEEPSEEK, PROVIDER_ID.AI_302, PROVIDER_ID.DASHSCOPE]) {
        const config = await getProviderConfig({ providerId: id });
        expect(config.configured).toBe(false);
      }
    });

    it("saves provider configuration, verifies readback, and survives restarts", async () => {
      const saved = await saveProviderConfig({
        providerId: PROVIDER_ID.DEEPSEEK,
        apiKey: "sk-deepseek-persist-1234",
        remember: true,
      });

      expect(saved.configured).toBe(true);
      expect(saved.persistence).toBe("local");
      expect(saved.maskedKey).toContain("1234");
      expect(saved.maskedKey).not.toContain("persist");

      // Verify getProviderConfig reflects the saved state
      const current = await getProviderConfig({ providerId: PROVIDER_ID.DEEPSEEK });
      expect(current.configured).toBe(true);
      expect(current.maskedKey).toContain("1234");

      // Simulate app restart: wipe session storage
      mockSessionStorage.clear();

      const afterRestart = await getProviderConfig({ providerId: PROVIDER_ID.DEEPSEEK });
      expect(afterRestart.configured).toBe(true);
      expect(afterRestart.maskedKey).toContain("1234");
    });

    it("clears provider configuration correctly", async () => {
      await saveProviderConfig({
        providerId: PROVIDER_ID.AI_302,
        apiKey: "sk-302-temp-9999",
        remember: false,
      });

      const before = await getProviderConfig({ providerId: PROVIDER_ID.AI_302 });
      expect(before.configured).toBe(true);

      const cleared = await clearProviderConfig({ providerId: PROVIDER_ID.AI_302 });
      expect(cleared.configured).toBe(false);

      const after = await getProviderConfig({ providerId: PROVIDER_ID.AI_302 });
      expect(after.configured).toBe(false);
    });

    it("throws unconfigured error when submitting job without keys in standalone mode", async () => {
      await expect(
        submitProviderJob({ providerId: PROVIDER_ID.OPENAI, request: {} }),
      ).rejects.toThrow("Cloud AI generation runtime is not configured in standalone mode.");
    });

    it("throws unconfigured error when streaming job without keys in standalone mode", async () => {
      await expect(
        streamProviderJob({ providerId: PROVIDER_ID.OPENAI, request: {} }),
      ).rejects.toThrow("Cloud AI generation runtime is not configured in standalone mode.");
    });

    it("does not throw unconfigured error when keys are provided", async () => {
      // Mock global fetch so the provider call does not attempt real internet requests
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "test response" } }],
          output: { text: "test response" },
        }),
        text: async () => "test response",
        headers: new Headers({ "content-type": "application/json" }),
      });
      globalThis.fetch = mockFetch;

      try {
        await saveProviderConfig({
          providerId: PROVIDER_ID.DEEPSEEK,
          apiKey: "sk-deepseek-mock-valid-key",
          remember: true,
        });

        // Calling submitProviderJob with configured key must not throw 'not configured in standalone mode'
        const jobPromise = submitProviderJob({
          providerId: PROVIDER_ID.DEEPSEEK,
          mediaType: "text",
          request: {
            model: "deepseek-chat",
            prompt: "hello",
          },
        });

        await expect(jobPromise).resolves.not.toThrow();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("testProvider returns standalone message when unconfigured and runs test when configured", async () => {
      const unconfigured = await testProvider({ providerId: PROVIDER_ID.DEEPSEEK });
      expect(unconfigured.success).toBe(false);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ models: [] }),
        headers: new Headers(),
      });

      try {
        await saveProviderConfig({
          providerId: PROVIDER_ID.DEEPSEEK,
          apiKey: "sk-test-key",
          remember: true,
        });

        const configured = await testProvider({ providerId: PROVIDER_ID.DEEPSEEK });
        expect(configured.success).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
