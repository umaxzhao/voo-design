import React from "react";

// A tiny React harness: the preset form is driven through its handlers the way
// the other first-run inline tests do it, without a DOM.
const hooks = vi.hoisted(() => ({ active: false, values: [], refs: [], index: 0, refIndex: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual,
    useReducer: (reducer, initial) => {
      if (!hooks.active) return actual.useReducer(reducer, initial);
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = initial;
      return [hooks.values[index], action => { hooks.values[index] = reducer(hooks.values[index], action); }];
    },
    useRef: (value) => {
      if (!hooks.active) return actual.useRef(value);
      const index = hooks.refIndex++;
      return hooks.refs[index] ??= { current: value };
    },
    useEffect: (...args) => { if (!hooks.active) return actual.useEffect(...args); },
  };
});

// No real provider registry / network: the shared custom-provider pipeline is
// the single seam between this form and 127.0.0.1:4399.
const setup = vi.hoisted(() => ({ fetchCustomProviderModels: vi.fn() }));
vi.mock("../../src/canvas/components/onboarding/custom_provider_setup.js", () => setup);

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CLOUD_PROVIDER_PRESETS,
  DSH_MODEL_PROVIDER_PRESET,
} from "../../src/canvas/components/onboarding/cloud_provider_presets.js";
import CustomProviderInline from "../../src/canvas/components/onboarding/custom_provider_inline.jsx";
import DeepSeekConnectorInline from "../../src/canvas/components/onboarding/deepseek_connector_inline.jsx";
import { ProviderLogo, hasProviderLogo } from "../../src/canvas/components/provider_icons.jsx";
import { isValidCustomBaseUrl } from "../../src/shared/custom_providers.js";
import { loadLocale, t } from "../../src/shared/i18n.js";

const h = React.createElement;
const PRESET = DSH_MODEL_PROVIDER_PRESET;
const CJK = /[\u3400-\u9fff\uff00-\uffef]/;

function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(elements)];
}

describe("DeepSeek Harness model preset", () => {
  it("is a loopback shortcut for the existing custom-provider pipeline", () => {
    expect(Object.isFrozen(PRESET)).toBe(true);
    expect(PRESET).toMatchObject({
      id: "deepseek-harness-models",
      customProviderId: "custom:onboarding-deepseek-harness",
      labelKey: "firstRun.provider.deepseekHarnessModels",
      baseUrl: "http://127.0.0.1:4399/v1",
      presetApiKey: "voo-local",
      hintKey: "firstRun.provider.deepseekHarnessHint",
    });
    const endpoint = new URL(PRESET.baseUrl);
    expect(endpoint.protocol).toBe("http:");
    expect(endpoint.hostname).toBe("127.0.0.1");
    expect(endpoint.port).toBe("4399");
    expect(endpoint.pathname).toBe("/v1");
    expect(isValidCustomBaseUrl(PRESET.baseUrl)).toBe(true);
  });

  it("is the only new card on the first-run API row", () => {
    const ids = CLOUD_PROVIDER_PRESETS.map(preset => preset.id);
    expect(ids.filter(id => id === "deepseek-harness-models")).toHaveLength(1);
    expect(CLOUD_PROVIDER_PRESETS.at(-1)).toBe(PRESET);
    // The key is a loopback placeholder, never a secret and never shared.
    expect(PRESET.presetApiKey).toBe("voo-local");
    const customIds = CLOUD_PROVIDER_PRESETS.map(preset => preset.customProviderId);
    expect(new Set(customIds).size).toBe(customIds.length);
    expect(customIds).toContain(PRESET.customProviderId);
  });

  it("reuses the DeepSeek mark for the new card", () => {
    expect(hasProviderLogo(PRESET.id)).toBe(true);
    const html = renderToStaticMarkup(h(ProviderLogo, { providerId: PRESET.id, size: 28 }));
    expect(html).toContain("brand-icons/deepseek.svg");
  });

  it.each(["en", "zh"])("translates the card label, hint and connected panel note in %s", async (locale) => {
    await loadLocale(locale);
    const label = t(PRESET.labelKey);
    const hint = t(PRESET.hintKey);
    const modelHint = t("firstRun.deepseek.modelHint");
    for (const value of [label, hint, modelHint]) {
      expect(value).toBeTruthy();
      expect(value).not.toMatch(/^(firstRun|settings)\./);
    }
    if (locale === "zh") {
      expect(label).toBe("DeepSeek Harness 模型");
      expect(label).toMatch(CJK);
      expect(modelHint).toMatch(CJK);
    } else {
      expect(label).toBe("DeepSeek Harness models");
      expect(label).not.toMatch(CJK);
      expect(modelHint).not.toMatch(CJK);
    }
    await loadLocale("en");
  });
});

describe("DSH preset prefilled form", () => {
  let props;
  let tree;
  const draw = () => {
    hooks.index = 0; hooks.refIndex = 0;
    tree = CustomProviderInline(props);
    return tree;
  };
  const byId = id => elements(tree).find(el => el.props?.["data-testid"] === id);
  const type = (id, value) => { byId(id).props.onChange({ target: { value } }); draw(); };

  beforeEach(async () => {
    await loadLocale("en");
    hooks.active = true;
    hooks.values = []; hooks.refs = [];
    setup.fetchCustomProviderModels.mockReset();
    props = {
      t, groups: [], selectedModel: "", onSelectModel: vi.fn(), onConfigured: vi.fn(),
      preset: PRESET,
    };
    draw();
  });
  afterEach(() => {
    hooks.active = false;
    vi.unstubAllGlobals();
  });

  it("prefills the bridge endpoint and the local placeholder key, editable", () => {
    expect(byId("first-run-custom-url").props.value).toBe("http://127.0.0.1:4399/v1");
    expect(byId("first-run-custom-key").props.type).toBe("password");
    expect(byId("first-run-custom-key").props.value).toBe("voo-local");
    expect(byId("first-run-custom-hint").props.children).toBe(t(PRESET.hintKey));
    expect(byId("first-run-custom-fetch").props.children).toContain("Fetch models");
    // Prefilled but still editable: the field is a controlled input.
    type("first-run-custom-key", "my-bridge-key");
    expect(byId("first-run-custom-key").props.value).toBe("my-bridge-key");
  });

  it("fetches the bridge models through the existing custom-provider pipeline", async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    setup.fetchCustomProviderModels.mockResolvedValue({ providerId: PRESET.customProviderId, models: [] });
    await byId("first-run-custom-fetch").props.onClick();
    draw();
    expect(setup.fetchCustomProviderModels).toHaveBeenCalledWith({
      providerId: null,
      baseUrl: PRESET.baseUrl,
      apiKey: "voo-local",
      name: t(PRESET.labelKey),
      newProviderId: PRESET.customProviderId,
    });
    expect(fetchStub).not.toHaveBeenCalled();
    expect(props.onConfigured).toHaveBeenCalledOnce();
    // The key is handed to the provider layer, then never shown again.
    expect(byId("first-run-custom-key").props.value).toBe("");
  });

  it("uses an edited key instead of the placeholder", async () => {
    setup.fetchCustomProviderModels.mockResolvedValue({ providerId: PRESET.customProviderId, models: [] });
    type("first-run-custom-key", "my-bridge-key");
    await byId("first-run-custom-fetch").props.onClick();
    draw();
    expect(setup.fetchCustomProviderModels).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "my-bridge-key" }));
  });

  it("shows the translated offline error and keeps the placeholder when the bridge is down", async () => {
    setup.fetchCustomProviderModels.mockRejectedValue(Object.assign(new Error("down"), { code: "providerRequestFailed" }));
    await byId("first-run-custom-fetch").props.onClick();
    draw();
    expect(byId("first-run-custom-error").props.children).toBe(t("error.providerRequestFailed"));
    expect(props.onConfigured).not.toHaveBeenCalled();
    expect(byId("first-run-custom-url").props.value).toBe(PRESET.baseUrl);
    expect(byId("first-run-custom-key").props.value).toBe("voo-local");
    expect(byId("first-run-custom-url-error")).toBeUndefined();
  });
});

describe("connected DeepSeek panel points at the model card", () => {
  it.each(["en", "zh"])("renders the model hint next to the install hint in %s", async (locale) => {
    await loadLocale(locale);
    const status = {
      status: "ready",
      installed: true,
      authenticated: true,
      ready: true,
      dsh: { appInstalled: true, appPath: "/Applications/DeepSeek Harness.app", pluginInstalled: true },
    };
    const html = renderToStaticMarkup(
      h(DeepSeekConnectorInline, { t, status, detection: { phase: "done", refresh: () => {} } }),
    );
    expect(html).toContain('data-state="ready"');
    expect(html).toContain('data-testid="deepseek-installed-hint"');
    expect(html).toContain('data-testid="deepseek-model-hint"');
    expect(html).toContain(t("firstRun.deepseek.modelHint"));
    expect(html).not.toContain("firstRun.");
    await loadLocale("en");
  });
});
