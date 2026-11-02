// Polyfill window for the node test environment.
if (typeof globalThis.window === "undefined") globalThis.window = new EventTarget();
if (typeof globalThis.Element === "undefined") globalThis.Element = class Element {};

import React from "react";
import { afterAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DesignTokenFields from "../../src/canvas/components/design_token_fields.jsx";
import { humanizeKey, tokenLabel, tokenPathLabel } from "../../src/canvas/components/design_token_labels.js";
import { BUILT_IN_DESIGN_SYSTEMS } from "../../src/canvas/editor/design_system_presets.js";
import { DESIGN_SYSTEMS, buildDesignSystemBrief } from "../../src/canvas/design_systems.js";
import { loadLocale, t } from "../../src/shared/i18n.js";
import en from "../../src/shared/i18n/design-systems-en.js";
import zh from "../../src/shared/i18n/design-systems-zh.js";

const noop = () => {};
const studio = BUILT_IN_DESIGN_SYSTEMS.find((system) => system.id === "studio");

function renderFields(tokens = studio.designTokens) {
  return renderToStaticMarkup(
    <DesignTokenFields tokens={tokens} designMd="" onTokenChange={noop} onMarkdownChange={noop} />,
  );
}

describe("design token labels", () => {
  afterAll(() => loadLocale("en"));

  it("humanises unknown keys", () => {
    expect(humanizeKey("surfaceMuted")).toBe("Surface muted");
    expect(humanizeKey("brand_ink")).toBe("Brand ink");
    expect(humanizeKey("hero-gradient")).toBe("Hero gradient");
    expect(humanizeKey("brand")).toBe("Brand");
  });

  it("defines a label for every token key of every preset in en and zh", () => {
    const keys = new Set();
    for (const { designTokens } of BUILT_IN_DESIGN_SYSTEMS) {
      for (const group of ["colors", "radius"]) Object.keys(designTokens[group]).forEach((key) => keys.add(key));
      for (const [component, tokens] of Object.entries(designTokens.components)) {
        keys.add(component);
        Object.keys(tokens).forEach((key) => keys.add(key));
      }
    }
    for (const key of keys) {
      expect(en[`designSystems.token.${key}`], `en ${key}`).toBeTruthy();
      expect(zh[`designSystems.token.${key}`], `zh ${key}`).toBeTruthy();
    }
  });

  it("renders readable English labels while keeping the raw key as a description", async () => {
    await loadLocale("en");
    const html = renderFields();
    for (const label of ["Canvas", "Muted surface", "Action hover", "Corner radius", "Horizontal padding"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-label="Muted surface"');
    expect(html).toContain('aria-description="colors surfaceMuted"');
    expect(html).toContain('aria-label="Button Corner radius"');
    expect(html).toContain('aria-description="components button paddingX"');
    // Raw keys must not be shown as visible labels.
    expect(html).not.toContain(">surfaceMuted<");
    expect(html).not.toContain(">paddingX<");
  });

  it("renders Chinese labels in the zh locale", async () => {
    await loadLocale("zh");
    const html = renderFields();
    for (const label of ["画布", "弱化表面", "主操作悬停", "圆角", "水平内边距"]) expect(html).toContain(label);
    expect(html).toContain('aria-label="弱化表面"');
    expect(html).not.toContain(">surfaceMuted<");
    expect(tokenPathLabel(["typeScale", "2"], t)).toBe("字号 3");
  });

  it("falls back to a humanised label for user-added keys", async () => {
    await loadLocale("en");
    const tokens = structuredClone(studio.designTokens);
    tokens.colors.heroGradient = "#123456";
    tokens.components.badge = { cornerShape: 4 };
    expect(tokenLabel("heroGradient", t)).toBe("Hero gradient");
    const html = renderFields(tokens);
    expect(html).toContain("Hero gradient");
    expect(html).toContain('aria-description="colors heroGradient"');
    expect(html).toContain("Badge");
    expect(html).toContain('aria-label="Badge Corner shape"');
  });
});

describe("preset design brief locale", () => {
  const CJK = /[㐀-鿿]/;

  afterAll(() => loadLocale("en"));

  it("builds an English brief for en and keeps the Chinese text for zh and by default", () => {
    const system = DESIGN_SYSTEMS.studio;
    const english = buildDesignSystemBrief(system, { locale: "en" });
    const chinese = buildDesignSystemBrief(system, { locale: "zh" });
    expect(english).toContain("Every page uses the same token set.");
    expect(english).toContain("canvas=#F6F7F5");
    expect(english).not.toMatch(CJK);
    expect(chinese).toContain("【Design System: studio】所有页面使用同一套 token。");
    expect(chinese).toContain("主按钮：48px 高，背景 #176B52，文字 #FFFFFF。");
    expect(buildDesignSystemBrief(system)).toBe(chinese);
    expect(buildDesignSystemBrief(system, { media: "mobile" })).toBe(buildDesignSystemBrief(system, { media: "mobile", locale: "zh" }));
    // Both languages carry the same literal values.
    expect(english.match(/#[0-9A-F]{6}/g)).toEqual(chinese.match(/#[0-9A-F]{6}/g));
    expect(english.match(/\d+px/g)).toEqual(chinese.match(/\d+px/g));
  });

  it("follows the UI locale when a preset is read", async () => {
    await loadLocale("en");
    expect(studio.designMd).not.toMatch(CJK);
    expect(studio.designMd).toContain("studio");
    await loadLocale("zh");
    expect(studio.designMd).toBe(buildDesignSystemBrief(DESIGN_SYSTEMS.studio));
  });
});
