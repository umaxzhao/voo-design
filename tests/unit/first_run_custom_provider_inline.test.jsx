import React from "react";

// Run the component's hooks against a plain array so handlers can be driven without a DOM.
const hooks = vi.hoisted(() => ({ values: [], refs: [], index: 0, refIndex: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual,
    useReducer: (reducer, initial) => {
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = initial;
      return [hooks.values[index], action => { hooks.values[index] = reducer(hooks.values[index], action); }];
    },
    useRef: (value) => { const index = hooks.refIndex++; return hooks.refs[index] ??= { current: value }; },
    useEffect: () => {},
  };
});
const setup = vi.hoisted(() => ({ fetchCustomProviderModels: vi.fn() }));
vi.mock("../../src/canvas/components/onboarding/custom_provider_setup.js", () => setup);

import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomProviderInline from "../../src/canvas/components/onboarding/custom_provider_inline.jsx";
import { loadLocale, t } from "../../src/shared/i18n.js";

const GROUPS = [{ cliId: "custom:one", name: "gateway.example.com", models: [{ id: "api:custom%3Aone:m-1", label: "m-1" }, { id: "api:custom%3Aone:m-2", label: "m-2" }] }];

function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(elements)];
}

describe("first-run inline custom provider", () => {
  let props, tree;
  const draw = () => {
    hooks.index = 0; hooks.refIndex = 0;
    tree = CustomProviderInline(props);
    return tree;
  };
  const byId = id => elements(tree).find(el => el.props?.["data-testid"] === id);
  const type = (id, value) => { byId(id).props.onChange({ target: { value } }); draw(); };

  beforeEach(async () => {
    await loadLocale("en");
    hooks.values = []; hooks.refs = [];
    setup.fetchCustomProviderModels.mockReset();
    props = { t, groups: [], selectedModel: "", onSelectModel: vi.fn(), onConfigured: vi.fn() };
    draw();
  });

  it("offers endpoint, a masked key field and a Fetch models action", () => {
    expect(byId("first-run-custom-url").props.type).toBe("url");
    expect(byId("first-run-custom-key").props.type).toBe("password");
    expect(byId("first-run-custom-fetch").props.children).toContain("Fetch models");
    expect(byId("first-run-custom-models")).toBeUndefined();
  });

  it("rejects an invalid endpoint without calling the registry path", async () => {
    type("first-run-custom-url", "ftp://nope");
    type("first-run-custom-key", "sk-test");
    await byId("first-run-custom-fetch").props.onClick(); draw();
    expect(setup.fetchCustomProviderModels).not.toHaveBeenCalled();
    expect(byId("first-run-custom-url-error")).toBeTruthy();
  });

  it("asks for a key before fetching a new provider", async () => {
    type("first-run-custom-url", "https://gateway.example.com/v1");
    await byId("first-run-custom-fetch").props.onClick(); draw();
    expect(setup.fetchCustomProviderModels).not.toHaveBeenCalled();
    expect(byId("first-run-custom-error").props.children).toBe("Enter an API Key");
  });

  it("fetches with the typed values, reports configuration and clears the key", async () => {
    setup.fetchCustomProviderModels.mockResolvedValue({ providerId: "custom:one", models: [] });
    type("first-run-custom-url", " https://gateway.example.com/v1 ");
    type("first-run-custom-key", "sk-test");
    const pending = byId("first-run-custom-fetch").props.onClick();
    draw();
    expect(byId("first-run-custom-fetch").props.disabled).toBe(true);
    await pending; draw();
    expect(setup.fetchCustomProviderModels).toHaveBeenCalledWith({ providerId: null, baseUrl: "https://gateway.example.com/v1", apiKey: "sk-test" });
    expect(props.onConfigured).toHaveBeenCalledOnce();
    expect(byId("first-run-custom-key").props.value).toBe("");
    expect(byId("first-run-custom-fetch").props.disabled).toBe(false);
  });

  it("shows the translated error near the button when the fetch fails", async () => {
    setup.fetchCustomProviderModels.mockRejectedValue(Object.assign(new Error("denied"), { code: "providerUnauthorized" }));
    type("first-run-custom-url", "https://gateway.example.com/v1");
    type("first-run-custom-key", "sk-test");
    await byId("first-run-custom-fetch").props.onClick(); draw();
    expect(byId("first-run-custom-error").props.children).toBe("The API Key is invalid or unauthorized");
    expect(props.onConfigured).not.toHaveBeenCalled();
    expect(byId("first-run-custom-key").props.value).toBe("sk-test");
  });

  it("lists the fetched models and reports the picked one", () => {
    props = { ...props, groups: GROUPS, selectedModel: "api:custom%3Aone:m-2" };
    draw();
    // ModelList is its own component: expand it the way React would.
    const list = elements(tree).find(el => typeof el.type === "function" && el.props.groups);
    const models = elements(list.type(list.props)).filter(el => el.props?.["data-testid"] === "first-run-custom-model");
    expect(models.map(el => el.props["aria-checked"])).toEqual([false, true]);
    models[0].props.onClick();
    expect(props.onSelectModel).toHaveBeenCalledWith("api:custom%3Aone:m-1");
  });
});
