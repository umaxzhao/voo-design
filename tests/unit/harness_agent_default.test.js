import { describe, expect, it, vi } from "vitest";
import {
  ensureHarnessAgentModel,
  HARNESS_PROVIDER_NAME,
} from "../../src/canvas/components/onboarding/harness_agent_default.js";
import { DSH_MODEL_PROVIDER_PRESET } from "../../src/canvas/components/onboarding/cloud_provider_presets.js";
import { AGENT_SETTING } from "../../src/canvas/agent/agent-settings.js";
import { getSetting } from "../../src/shared/settings.js";

describe("harness panel agent default", () => {
  it("configures the loopback Harness provider and selects its first model", async () => {
    const fetchModels = vi.fn(async ({ baseUrl, apiKey, name, newProviderId }) => {
      expect(baseUrl).toBe(DSH_MODEL_PROVIDER_PRESET.baseUrl);
      expect(apiKey).toBe(DSH_MODEL_PROVIDER_PRESET.presetApiKey);
      expect(name).toBe(HARNESS_PROVIDER_NAME);
      expect(newProviderId).toBe(DSH_MODEL_PROVIDER_PRESET.customProviderId);
      return { providerId: "custom:harness-test", models: [{ id: "kimi-k3", label: "Kimi" }] };
    });
    const result = await ensureHarnessAgentModel({ fetchModels, readSetting: () => null });
    expect(result).toEqual({ configured: true });
    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(getSetting(AGENT_SETTING.MODEL)).toBe(
      `api:${encodeURIComponent("custom:harness-test")}:${encodeURIComponent("kimi-k3")}`,
    );
  });

  it("keeps a model the user already chose", async () => {
    const fetchModels = vi.fn();
    const result = await ensureHarnessAgentModel({ fetchModels, readSetting: () => "api:other:model" });
    expect(result.configured).toBe(true);
    expect(fetchModels).not.toHaveBeenCalled();
  });

  it("does not fail when the model bridge is offline", async () => {
    const fetchModels = vi.fn(async () => {
      throw new Error("offline");
    });
    const result = await ensureHarnessAgentModel({ fetchModels, readSetting: () => null });
    expect(result.configured).toBe(false);
  });
});
