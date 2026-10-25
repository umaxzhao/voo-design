// Polyfill window for the node test environment.
if (typeof globalThis.window === "undefined") globalThis.window = new EventTarget();
// The drawer portals into document.body; createPortal is mocked below.
if (typeof globalThis.document === "undefined") globalThis.document = { body: {} };
if (typeof globalThis.Element === "undefined") globalThis.Element = class Element {};

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Lets a test open the MCP "Add server" form without a DOM: only the second
// useState of AgentMcpSettings (formOpen) is forced.
const harness = vi.hoisted(() => ({ forceFormOpen: false, calls: 0, tracking: false }));
vi.mock("react", async (original) => {
  const actual = await original();
  return {
    ...actual,
    useState: (initial) => {
      if (!harness.tracking) return actual.useState(initial);
      harness.calls += 1;
      const result = actual.useState(initial);
      return harness.calls === 2 && harness.forceFormOpen ? [true, result[1]] : result;
    },
  };
});
vi.mock("react-dom", async (original) => ({ ...(await original()), createPortal: (node) => node }));
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en" }),
}));

import AgentMcpSettings from "../../src/canvas/components/agent_mcp_settings.jsx";
import { CanvasSettingsSection } from "../../src/canvas/components/settings_general.jsx";
import DesignSystemCards from "../../src/canvas/components/design_system_cards.jsx";
import SettingsDrawer from "../../src/canvas/components/settings_drawer.jsx";
import { SETTINGS_TABS } from "../../src/canvas/components/settings_tabs.js";
import { listDesignSystems } from "../../src/canvas/editor/design_system_registry.js";
import en from "../../src/shared/i18n/en.js";
import zh from "../../src/shared/i18n/zh.js";

function renderMcp(open) {
  harness.tracking = true;
  harness.calls = 0;
  harness.forceFormOpen = open;
  try {
    return renderToStaticMarkup(<AgentMcpSettings />);
  } finally {
    harness.tracking = false;
    harness.forceFormOpen = false;
  }
}

describe("compact settings", () => {
  it("keeps the MCP form collapsed behind an Add server toggle by default", () => {
    const html = renderMcp(false);
    expect(html).toContain('data-testid="agent-mcp-form-toggle"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("agent.mcp.showForm");
    expect(html).not.toContain("<form");
    for (const key of ["agent.mcp.type", "agent.mcp.id", "agent.mcp.command", "agent.mcp.args", "agent.mcp.env"]) {
      expect(html).not.toContain(key);
    }
  });

  it("shows the form with a 6px label gap once expanded", () => {
    const html = renderMcp(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("<form");
    for (const key of ["agent.mcp.type", "agent.mcp.id", "agent.mcp.command", "agent.mcp.args", "agent.mcp.env"]) {
      expect(html).toContain(key);
    }
    // Every field label stacks with gap-1.5 (6px) between label and input.
    expect(html.match(/<label class="[^"]*gap-1\.5[^"]*"/g)).toHaveLength(5);
  });

  it("has the toggle label in en and zh", () => {
    expect(en["agent.mcp.showForm"]).toBe("Add server");
    expect(zh["agent.mcp.showForm"]).toBeTruthy();
    expect(zh["agent.mcp.hideForm"]).toBeTruthy();
  });

  it("renders Show rulers as a list row with a switch on the right", () => {
    const html = renderToStaticMarkup(<CanvasSettingsSection />);
    expect(html).toContain("justify-between");
    expect(html).toMatch(/<span[^>]*>settings\.canvas\.showRulers<\/span>/);
    expect(html).toMatch(/role="switch"[^>]*aria-label="settings\.canvas\.showRulers"|data-testid="settings-show-rulers"[^>]*role="switch"/);
    expect(html).toContain('data-testid="settings-show-rulers"');
  });

  it("uses a short cover and a three column grid on the design system cards", () => {
    const systems = listDesignSystems([]);
    const html = renderToStaticMarkup(
      <DesignSystemCards systems={systems} selectedId={systems[0].id} appliedId={null} onSelect={() => {}} />,
    );
    const cover = html.match(/<div aria-hidden="true"[^>]*design-system-cover[^>]*>/)[0];
    expect(cover).toContain("h-16");
    expect(html).not.toContain("aspect-video");
    expect(html).toContain("lg:grid-cols-3");
  });

  it("makes every nav item 40px tall with 4px gaps and keeps aria-current", () => {
    const html = renderToStaticMarkup(<SettingsDrawer open initialTab="general" onClose={() => {}} />);
    const tabs = html.match(/<button[^>]*role="tab"[^>]*>/g);
    expect(tabs).toHaveLength(SETTINGS_TABS.length);
    for (const tab of tabs) {
      expect(tab).toMatch(/class="[^"]*\bh-10\b/);
      expect(tab).not.toContain("min-h-12");
      expect(tab).toContain("focus-visible:ring-1");
    }
    expect(tabs.filter((tab) => tab.includes('aria-current="page"'))).toHaveLength(1);
    expect(html.match(/<nav[^>]*>/)[0]).toContain("gap-1");
  });
});
