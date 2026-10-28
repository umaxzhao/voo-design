import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { loadLocale, setLocale } from "../../src/shared/i18n.js";
import en from "../../src/shared/i18n/settings-ui-en.js";
import zh from "../../src/shared/i18n/settings-ui-zh.js";
import fullEn from "../../src/shared/i18n/en.js";
import fullZh from "../../src/shared/i18n/zh.js";

if (!globalThis.window) globalThis.window = new EventTarget();
if (!globalThis.document) globalThis.document = { body: {} };
if (!globalThis.Element) globalThis.Element = class Element {};
vi.mock("react-dom", async (original) => ({ ...(await original()), createPortal: (node) => node }));

import SettingsDrawer from "../../src/canvas/components/settings_drawer.jsx";
import SettingsShortcuts from "../../src/canvas/components/settings_shortcuts.jsx";

const renderDrawer = () => renderToStaticMarkup(<SettingsDrawer open initialTab="shortcuts" onClose={() => {}} />);
afterEach(() => loadLocale("en"));

describe("settings shell translations", () => {
  it("registers nonempty matching dictionaries for every shell and boolean shortcut label", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const [dictionary, aggregate] of [[en, fullEn], [zh, fullZh]]) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim()).not.toBe("");
        expect(aggregate[key]).toBe(value);
      }
    }
    for (const file of ["settings_drawer.jsx", "settings_shortcuts.jsx"]) {
      const source = readFileSync(new URL(`../../src/canvas/components/${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/[\u4e00-\u9fff]/);
      expect(source).not.toContain("isZh");
      expect(source).not.toContain("labelZh");
    }
  });

  it.each([
    ["en", "Settings &amp; Preferences", "Settings Categories", "Close (Esc)", "Search shortcuts or tools...", "Boolean &amp; Geometry", "Union (Merge paths)"],
    ["zh", "设置与偏好", "设置分类", "关闭 (Esc)", "搜索快捷键或功能名称...", "布尔运算与几何变换", "并集运算 (合并路径)"],
  ])("renders shell, accessible labels and shortcut descriptions in %s", async (locale, title, nav, close, search, group, union) => {
    await loadLocale(locale);
    const html = renderDrawer();
    for (const text of [title, nav, close, search, group, union]) expect(html).toContain(text);
    expect(html).not.toContain("editor.shortcuts.group.boolean");
    expect(html).not.toContain("settings.shortcuts.");
    expect(html).toContain('role="dialog"');
  });

  it("uses the translated description through the section's existing hint API", async () => {
    await loadLocale("zh");
    const html = renderToStaticMarkup(<SettingsShortcuts />);
    expect(html).toContain(zh["settings.shortcuts.title"]);
    expect(html).toContain(zh["settings.shortcuts.description"]);
  });

  it("renders a changed locale using the same component without a locale-specific copy branch", async () => {
    await setLocale("en");
    expect(renderDrawer()).toContain(en["settings.shortcuts.search"]);
    await setLocale("zh");
    expect(renderDrawer()).toContain(zh["settings.shortcuts.search"]);
    await setLocale("en");
    expect(renderDrawer()).not.toContain(zh["settings.shortcuts.search"]);
  });
});
