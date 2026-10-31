// Polyfill window for the node test environment.
if (typeof globalThis.window === "undefined") globalThis.window = new EventTarget();
if (typeof globalThis.Element === "undefined") globalThis.Element = class Element {};

import React from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SettingsDesignSystems from "../../src/canvas/components/settings_design_systems.jsx";
import { SETTINGS_TABS } from "../../src/canvas/components/settings_tabs.js";
import { loadLocale } from "../../src/shared/i18n.js";
import en from "../../src/shared/i18n/design-systems-en.js";
import zh from "../../src/shared/i18n/design-systems-zh.js";

describe("Design systems settings tab", () => {
  it("is not first and follows General, AI Assistant", () => {
    expect(SETTINGS_TABS.map((tab) => tab.id)).toEqual(["general", "assistant", "design-systems", "providers", "shortcuts"]);
    expect(SETTINGS_TABS[0].id).not.toBe("design-systems");
  });

  it("has matching en and zh keys, all non-empty", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(en), ...Object.values(zh)]) expect(value.trim()).not.toBe("");
  });

  describe("rendering", () => {
    beforeAll(() => loadLocale("en"));

    it("lists the presets and exposes only Duplicate and Use for a built-in system", () => {
      const html = renderToStaticMarkup(<SettingsDesignSystems />);
      // The first six cards are visual DesignMD references with source covers.
      for (const id of ["stripe", "linear", "vercel", "anthropic", "notion", "figma"]) {
        expect(html).toContain(`data-testid="design-system-item-${id}"`);
      }
      expect(html).toContain('data-testid="design-system-more"');
      expect(html).toContain("Stripe");
      expect(html).toContain('src="https://designmd-production-assets.s3.ca-central-1.amazonaws.com/screenshots/a59178aa-71f3-4771-b756-ecbb557550c3/0-0.jpg"');
      expect(html).toContain('href="https://designmd.me/discover/stripe"');
      expect(html).toContain("DesignMD reference · Stripe");
      expect(html).toContain("Built-in");
      expect(html).toContain("Use for this document");
      expect(html).toContain("Duplicate");
      expect(html).not.toContain(">Rename<");
      expect(html).not.toContain(">Delete<");
      expect(html).toContain("Save as copy");
      expect(html).toContain('data-testid="design-token-panel"');
      // The systems are tabs; only the selected system's actions and editor render below them.
      expect(html).toContain('role="tablist"');
      expect(html.match(/role="tab"/g)).toHaveLength(6);
      expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
      expect(html.match(/role="tabpanel"/g)).toHaveLength(1);
      expect(html.match(/data-testid="design-token-panel"/g)).toHaveLength(1);
    });
  });
});
