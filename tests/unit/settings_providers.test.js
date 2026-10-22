import { describe, it, expect, beforeEach } from "vitest";

// Node environment localStorage mock
const mockStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

if (!globalThis.window) {
  globalThis.window = globalThis;
}
globalThis.window.localStorage = mockStorage;
globalThis.localStorage = mockStorage;

import {
  ALL_PROVIDERS,
  DEFAULT_ESSENTIAL_PROVIDERS,
  getStoredUserAddedProviders,
  storeUserAddedProviders,
} from "../../src/canvas/components/provider_definitions.js";
import { getProviderStatusInfo } from "../../src/canvas/components/provider_status_helpers.js";
import { VERIFICATION_STATUS } from "../../src/canvas/components/provider_verification_state.js";
import {
  getStoredCustomProviders,
  saveStoredCustomProvider,
  deleteStoredCustomProvider,
} from "../../src/shared/custom_providers.js";

const mockT = (key) => key;

describe("Settings & AI Provider System for VOO Design", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  describe("Provider Definitions & 3D/Motion Exclusion", () => {
    it("defines essential providers including DeepSeek, 302.AI, and DashScope", () => {
      expect(DEFAULT_ESSENTIAL_PROVIDERS).toContain("deepseek");
      expect(DEFAULT_ESSENTIAL_PROVIDERS).toContain("302ai");
      expect(DEFAULT_ESSENTIAL_PROVIDERS).toContain("dashscope");
    });

    it("ensures ALL_PROVIDERS has text/image models and zero 3D or motion entries", () => {
      expect(ALL_PROVIDERS.length).toBeGreaterThan(5);

      for (const config of ALL_PROVIDERS) {
        // Assert no 3D or video/motion model definitions exist
        expect(config.models?.video).toBeUndefined();
        expect(config.models?.three_d).toBeUndefined();
        expect(config.models?.motion).toBeUndefined();
        expect(config.id).not.toBe("tripo");
        expect(config.id).not.toBe("hunyuan3d");

        // Verify valid id and label
        expect(config.id).toBeTruthy();
        expect(config.label).toBeTruthy();
      }
    });

    it("persists user-added provider IDs correctly", () => {
      expect(getStoredUserAddedProviders()).toEqual(DEFAULT_ESSENTIAL_PROVIDERS);
      storeUserAddedProviders(["anthropic", "openai"]);
      expect(getStoredUserAddedProviders()).toEqual(["anthropic", "openai"]);
    });
  });

  describe("Provider Status Helpers", () => {
    it("returns correct indicator and style for verifying / testing state", () => {
      const info = getProviderStatusInfo(mockT, {
        configured: true,
        verification: { status: VERIFICATION_STATUS.TESTING },
      });
      expect(info.statusText).toBe("provider.status.testing");
      expect(info.dotClass).toContain("bg-amber-400");
      expect(info.isVerified).toBe(false);
    });

    it("returns correct indicator and style for verified state", () => {
      const info = getProviderStatusInfo(mockT, {
        configured: true,
        verification: { status: VERIFICATION_STATUS.VERIFIED },
      });
      expect(info.statusText).toBe("provider.status.verified");
      expect(info.dotClass).toContain("bg-[#a7ffd4]");
      expect(info.isVerified).toBe(true);
    });

    it("returns correct error indicator for failed connection", () => {
      const info = getProviderStatusInfo(mockT, {
        configured: true,
        verification: {
          status: VERIFICATION_STATUS.ERROR,
          error: "providerUnauthorized",
        },
      });
      expect(info.isError).toBe(true);
      expect(info.dotClass).toContain("bg-rose-400");
    });

    it("returns idle status when unconfigured", () => {
      const info = getProviderStatusInfo(mockT, {
        configured: false,
        verification: null,
      });
      expect(info.statusText).toBe("provider.status.idle");
      expect(info.dotClass).toContain("bg-neutral-600");
      expect(info.isVerified).toBe(false);
    });
  });

  describe("Custom Providers Storage", () => {
    it("can save, retrieve, and delete custom OpenAI-compatible providers", () => {
      expect(getStoredCustomProviders()).toEqual([]);

      const customProvider = {
        id: "custom:local_llm",
        name: "Local vLLM",
        defaultBaseUrl: "http://localhost:8000/v1",
        protocol: "openai",
        models: [
          { id: "llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
          { id: "flux-schnell", label: "Flux Schnell" },
        ],
      };

      saveStoredCustomProvider(customProvider);
      const stored = getStoredCustomProviders();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("custom:local_llm");
      expect(stored[0].name).toBe("Local vLLM");
      expect(stored[0].models[0].id).toBe("llama-3.3-70b-instruct");

      deleteStoredCustomProvider("custom:local_llm");
      expect(getStoredCustomProviders()).toEqual([]);
    });
  });
});
