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
      // Cards show the first COLLAPSED_COUNT (6) by default; the eight built-in
      // presets overflow, so the collapsed list ends with "Show more".
      for (const id of ["studio", "wellness", "commerce", "editorial", "analytics"]) {
        expect(html).toContain(`data-testid="design-system-item-${id}"`);
      }
      expect(html).toContain('data-testid="design-system-more"');
      expect(html).toContain("Studio");
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
