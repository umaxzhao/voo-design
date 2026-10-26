import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => ({ listRegisteredProviderModels: vi.fn() }));
vi.mock("../../src/shared/providers/provider_registry.js", () => registry);

import { fetchCustomProviderModels } from "../../src/canvas/components/onboarding/custom_provider_setup.js";
import { getProviderConfig } from "../../src/canvas/provider_client.js";
import { customModelGroups } from "../../src/canvas/agent/agent_provider.js";
import { customAgentStatus, AGENT_STATUS } from "../../src/canvas/components/onboarding/agent_status_model.js";
import { getStoredCustomProviders } from "../../src/shared/custom_providers.js";
import { PROVIDER_MODELS_KEY } from "../../src/shared/provider_models.js";
import { getSetting, setSetting } from "../../src/shared/settings.js";

const API_KEY = "sk-secret-key-1234";
const BASE_URL = "https://gateway.example.com/v1";

function memoryStorage() {
  const store = new Map();
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    dump: () => JSON.stringify([...store]),
  };
}

describe("first-run custom provider setup", () => {
  let local;
  let session;
  beforeEach(async () => {
    local = memoryStorage();
    session = memoryStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    await setSetting(PROVIDER_MODELS_KEY, null);
    registry.listRegisteredProviderModels.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("stores the provider, key and fetched models where Settings reads them", async () => {
    registry.listRegisteredProviderModels.mockResolvedValue({ models: [{ id: "m-1", label: "m-1" }, { id: "m-2", label: "m-2" }] });
    const result = await fetchCustomProviderModels({ baseUrl: BASE_URL, apiKey: API_KEY });

    expect(registry.listRegisteredProviderModels).toHaveBeenCalledWith({ providerId: result.providerId, mediaType: "text" });
    expect(result.models.map(model => model.id)).toEqual(["m-1", "m-2"]);
    expect(getStoredCustomProviders()).toEqual([expect.objectContaining({ id: result.providerId, name: "gateway.example.com", defaultBaseUrl: BASE_URL })]);
    const config = await getProviderConfig({ providerId: result.providerId });
    expect(config).toMatchObject({ configured: true, persistence: "local", baseUrl: BASE_URL });
    expect(config.maskedKey).not.toContain("secret");
    expect(getSetting(PROVIDER_MODELS_KEY)[result.providerId].text.map(model => model.id)).toEqual(["m-1", "m-2"]);

    const groups = customModelGroups();
    expect(groups).toHaveLength(1);
    expect(customAgentStatus(groups.some(group => group.models.length > 0))).toBe(AGENT_STATUS.CONFIGURED);
  });

  it("reuses the provider on retry and keeps the stored key when none is typed", async () => {
    registry.listRegisteredProviderModels.mockResolvedValue({ models: [{ id: "m-1", label: "m-1" }] });
    const first = await fetchCustomProviderModels({ baseUrl: BASE_URL, apiKey: API_KEY });
    registry.listRegisteredProviderModels.mockResolvedValue({ models: [{ id: "m-1", label: "m-1" }, { id: "m-3", label: "m-3" }] });
    const second = await fetchCustomProviderModels({ providerId: first.providerId, baseUrl: BASE_URL, apiKey: "" });

    expect(second.providerId).toBe(first.providerId);
    expect(getStoredCustomProviders()).toHaveLength(1);
    expect((await getProviderConfig({ providerId: first.providerId })).configured).toBe(true);
    expect(second.models.map(model => model.id)).toEqual(["m-1", "m-3"]);
  });

  it("stores a branded shortcut under a stable provider id and preserves its display name", async () => {
    registry.listRegisteredProviderModels.mockResolvedValue({ models: [{ id: "qwen-model", label: "Qwen model" }] });
    const result = await fetchCustomProviderModels({ baseUrl: BASE_URL, apiKey: API_KEY,
      name: "Alibaba Cloud", newProviderId: "custom:onboarding-dashscope" });
    expect(result.providerId).toBe("custom:onboarding-dashscope");
    expect(getStoredCustomProviders()).toEqual([expect.objectContaining({ id: result.providerId, name: "Alibaba Cloud" })]);
    expect(customModelGroups()[0].models[0].id).toBe("api:custom%3Aonboarding-dashscope:qwen-model");
  });

  it("rolls back a new branded shortcut when model fetching fails", async () => {
    registry.listRegisteredProviderModels.mockResolvedValue({ models: [] });
    await expect(fetchCustomProviderModels({ baseUrl: BASE_URL, apiKey: API_KEY,
      name: "Volcengine", newProviderId: "custom:onboarding-volcengine" })).rejects.toMatchObject({ code: "providerRequestFailed" });
    expect(getStoredCustomProviders()).toEqual([]);
    expect(local.dump()).not.toContain(API_KEY);
  });

  it("rolls back a new provider when the registry returns no models", async () => {
    registry.listRegisteredProviderModels.mockResolvedValue({ models: [] });
    await expect(fetchCustomProviderModels({ baseUrl: BASE_URL, apiKey: API_KEY })).rejects.toMatchObject({ code: "providerRequestFailed" });
    expect(getStoredCustomProviders()).toEqual([]);
    expect(customModelGroups()).toEqual([]);
  });

  it("rethrows the registry error code and leaves no credentials behind", async () => {
    registry.listRegisteredProviderModels.mockRejectedValue(Object.assign(new Error("denied"), { code: "providerUnauthorized" }));
    const before = getStoredCustomProviders();
    await expect(fetchCustomProviderModels({ baseUrl: BASE_URL, apiKey: API_KEY })).rejects.toMatchObject({ code: "providerUnauthorized" });
    expect(getStoredCustomProviders()).toEqual(before);
    expect(local.dump()).not.toContain(API_KEY);
    expect(session.dump()).not.toContain(API_KEY);
  });

  it("keeps an existing provider when a retry fails", async () => {
    registry.listRegisteredProviderModels.mockResolvedValue({ models: [{ id: "m-1", label: "m-1" }] });
    const first = await fetchCustomProviderModels({ baseUrl: BASE_URL, apiKey: API_KEY });
    registry.listRegisteredProviderModels.mockResolvedValue({ models: [] });
    await expect(fetchCustomProviderModels({ providerId: first.providerId, baseUrl: BASE_URL, apiKey: "" })).rejects.toMatchObject({ code: "providerRequestFailed" });
    expect(getStoredCustomProviders()).toHaveLength(1);
    expect((await getProviderConfig({ providerId: first.providerId })).configured).toBe(true);
  });
});
