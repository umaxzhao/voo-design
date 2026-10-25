import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getSetting, setSetting } from "../../src/shared/settings.js";
import { CanvasSettingsSection } from "../../src/canvas/components/settings_general.jsx";
import EditorRulers, { EditorCanvasAids } from "../../src/canvas/components/editor_rulers.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en" }),
}));

afterEach(() => setSetting("voo.editor.showRulers", null));

describe("rulers product defaults", () => {
  it.each([null, undefined, false, true])("Settings renders persisted %s as explicit opt-in", async (value) => {
    await setSetting("voo.editor.showRulers", value);
    const html = renderToStaticMarkup(<CanvasSettingsSection />);
    expect(html).toContain('data-testid="settings-show-rulers"');
    expect(html).toContain(`aria-checked="${value === true}"`);
    expect(getSetting("voo.editor.showRulers")).toBe(value ?? null);
  });

  it("canvas aids hold only the guide toggle and ruler strips are absent without props", () => {
    const html = renderToStaticMarkup(<EditorCanvasAids t={(key) => key} />);
    expect(html).toContain('data-testid="editor-toggle-guides"');
    expect(html).not.toContain('data-testid="editor-toggle-rulers"');
    expect(html).not.toContain('data-testid="editor-clear-guides"');
    const rulers = renderToStaticMarkup(<EditorRulers t={(key) => key} />);
    expect(rulers).not.toContain('data-testid="editor-ruler-top"');
    expect(rulers).not.toContain('data-testid="editor-ruler-left"');
    const shown = renderToStaticMarkup(<EditorRulers showRulers t={(key) => key} />);
    expect(shown).toContain('data-testid="editor-ruler-top"');
    expect(shown).toContain('data-testid="editor-ruler-left"');
  });
});
