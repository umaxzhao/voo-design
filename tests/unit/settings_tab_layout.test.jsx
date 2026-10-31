// Polyfill window for the node test environment.
if (typeof globalThis.window === "undefined") globalThis.window = new EventTarget();
if (typeof globalThis.Element === "undefined") globalThis.Element = class Element {};

import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Keeps the first useState of AgentSettings (the selected tab) across renders so a key press
// can be followed by a re-render without a DOM. Later useState calls are the real thing.
const harness = vi.hoisted(() => ({ tracking: false, calls: 0, tab: undefined, native: true }));
vi.mock("../../src/canvas/components/agent-panel/use_local_service.js", () => ({
  useLocalService: () => ({ native: harness.native, available: false }),
}));
vi.mock("react", async (original) => {
  const actual = await original();
  return {
    ...actual,
    useState: (initial) => {
      if (!harness.tracking) return actual.useState(initial);
      harness.calls += 1;
      if (harness.calls > 1) return actual.useState(initial);
      if (harness.tab === undefined) harness.tab = initial;
      return [harness.tab, (next) => { harness.tab = next; }];
    },
  };
});
// The real translate function, minus the hook, so components can be called directly.
vi.mock("../../src/canvas/use_i18n.js", async () => {
  const { t, getLocale } = await import("../../src/shared/i18n.js");
  return { useI18n: () => ({ t, locale: getLocale() }) };
});
vi.mock("react-dom", async (original) => ({ ...(await original()), createPortal: (node) => node }));

import AgentSettings from "../../src/canvas/components/agent_settings.jsx";
import SettingsDesignSystems from "../../src/canvas/components/settings_design_systems.jsx";
import SettingsTabStrip, { nextTabIndex } from "../../src/canvas/components/settings_tab_strip.jsx";
import { loadLocale } from "../../src/shared/i18n.js";
import en from "../../src/shared/i18n/en.js";
import zh from "../../src/shared/i18n/zh.js";

const TAB_KEYS = ["tabAssistant", "tabMcp", "tabCli"].map((key) => `settings.assistant.${key}`);
const count = (html, needle) => html.split(needle).length - 1;
const tabButtons = (html) => html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
const selectedTabs = (html) => tabButtons(html).filter((tab) => tab.includes('aria-selected="true"'));

function renderAgent() {
  harness.tracking = true;
  harness.calls = 0;
  try {
    return renderToStaticMarkup(<AgentSettings onOpenProviders={() => {}} onOpenWizard={() => {}} />);
  } finally {
    harness.tracking = false;
  }
}

/** Finds the first element of a given component type without rendering other components. */
function findByType(node, type) {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map((child) => findByType(child, type)).find(Boolean) ?? null;
  if (node.type === type) return node;
  return findByType(node.props?.children, type);
}

/** Presses a key on the agent tablist and returns the markup rendered afterwards. */
function pressOnAgentTabs(key) {
  harness.tracking = true;
  harness.calls = 0;
  let list;
  try {
    const strip = findByType(AgentSettings({}), SettingsTabStrip);
    list = SettingsTabStrip(strip.props);
  } finally {
    harness.tracking = false;
  }
  const prevented = vi.fn();
  list.props.onKeyDown({ key, preventDefault: prevented, currentTarget: { querySelectorAll: () => [] } });
  expect(prevented).toHaveBeenCalled();
  return renderAgent();
}

describe("settings tab layout", () => {
  beforeAll(() => loadLocale("en"));

  describe("Agent settings", () => {
    it("hides Local CLI in a browser without a service", () => {
      harness.native = false;
      try { expect(renderAgent()).not.toContain('data-testid="agent-settings-tab-cli"'); }
      finally { harness.native = true; }
    });
    it("renders a tablist with four tabs in order and Assistant selected by default", () => {
      harness.tab = undefined;
      const html = renderAgent();
      expect(count(html, 'role="tablist"')).toBe(1);
      const tabs = tabButtons(html);
      expect(tabs.map((tab) => tab.match(/data-testid="([^"]+)"/)[1])).toEqual([
        "agent-settings-tab-assistant",
        "agent-settings-tab-models",
        "agent-settings-tab-mcp",
        "agent-settings-tab-cli",
      ]);
      expect(selectedTabs(html)).toHaveLength(1);
      expect(selectedTabs(html)[0]).toContain("agent-settings-tab-assistant");
      // Roving tabindex: only the selected tab is in the tab order.
      expect(tabs.filter((tab) => tab.includes('tabindex="0"'))).toHaveLength(1);
      expect(tabs.filter((tab) => tab.includes('tabindex="-1"'))).toHaveLength(3);
    });

    it("shows the confirm-before-image row on Assistant and no MCP form or other panels", () => {
      harness.tab = undefined;
      const html = renderAgent();
      expect(count(html, 'role="tabpanel"')).toBe(1);
      expect(html).toContain(en["settings.assistant.confirmBeforeImage"]);
      expect(html).toContain(en["settings.assistant.maxSteps"]);
      expect(html).not.toContain("agent-mcp-form-toggle");
      expect(html).not.toContain(en["agent.mcp.title"]);
      expect(html).not.toContain(en["settings.assistant.imageModel"]);
      expect(html).not.toContain(en["titlebar.cliWizard"] ?? "Local CLI setup wizard");
    });

    it("moves the selection with ArrowRight and ArrowLeft and renders only that panel", () => {
      harness.tab = undefined;
      let html = pressOnAgentTabs("ArrowRight");
      expect(selectedTabs(html)[0]).toContain("agent-settings-tab-models");
      expect(count(html, 'role="tabpanel"')).toBe(1);
      expect(html).toContain(en["settings.assistant.imageModel"]);
      expect(html).not.toContain(en["settings.assistant.confirmBeforeImage"]);

      html = pressOnAgentTabs("ArrowRight");
      expect(selectedTabs(html)[0]).toContain("agent-settings-tab-mcp");
      expect(html).toContain('data-testid="agent-mcp-form-toggle"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain("<form");
      expect(html).not.toContain(en["settings.assistant.imageModel"]);

      html = pressOnAgentTabs("ArrowRight");
      expect(selectedTabs(html)[0]).toContain("agent-settings-tab-cli");
      expect(html).toContain("Local CLI setup wizard");
      expect(html).not.toContain("agent-mcp-form-toggle");

      html = pressOnAgentTabs("ArrowRight");
      expect(selectedTabs(html)[0]).toContain("agent-settings-tab-assistant");
      html = pressOnAgentTabs("ArrowLeft");
      expect(selectedTabs(html)[0]).toContain("agent-settings-tab-cli");
    });

    it("has non-empty en and zh labels for every new tab key", () => {
      for (const key of [...TAB_KEYS, "settings.assistant.cliHint"]) {
        expect(en[key]?.trim()).toBeTruthy();
        expect(zh[key]?.trim()).toBeTruthy();
      }
    });
  });

  describe("Design systems settings", () => {
    it("renders a tablist of systems with one selected tab and one panel", () => {
      const html = renderToStaticMarkup(<SettingsDesignSystems />);
      expect(count(html, 'role="tablist"')).toBe(1);
      const tabs = tabButtons(html);
      expect(tabs.length).toBeGreaterThanOrEqual(5);
      for (const id of ["stripe", "linear", "vercel", "anthropic", "notion", "figma"]) {
        expect(html).toContain(`data-testid="design-system-item-${id}"`);
      }
      expect(selectedTabs(html)).toHaveLength(1);
      expect(tabs.filter((tab) => tab.includes('tabindex="0"'))).toHaveLength(1);
      expect(count(html, 'role="tabpanel"')).toBe(1);
      // Only the selected system's editor renders.
      expect(count(html, 'data-testid="design-token-panel"')).toBe(1);
      expect(count(html, "Use for this document")).toBe(1);
      expect(html).toContain("Edit design system");
    });
  });

  describe("SettingsTabStrip keyboard", () => {
    const tabs = [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }];

    it("maps arrow keys with wrap-around and ignores other keys", () => {
      expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
      expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
      expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
      expect(nextTabIndex("Home", 2, 3)).toBe(0);
      expect(nextTabIndex("End", 0, 3)).toBe(2);
      expect(nextTabIndex("Enter", 0, 3)).toBeNull();
    });

    it("selects and focuses the neighbouring tab on ArrowRight", () => {
      const onSelect = vi.fn();
      const focus = vi.fn();
      const list = SettingsTabStrip({ tabs, selectedId: "a", onSelect, label: "x", idPrefix: "t" });
      list.props.onKeyDown({
        key: "ArrowRight",
        preventDefault() {},
        currentTarget: { querySelectorAll: () => [{ focus: vi.fn() }, { focus }, { focus: vi.fn() }] },
      });
      expect(onSelect).toHaveBeenCalledWith("b");
      expect(focus).toHaveBeenCalled();
    });
  });
});
