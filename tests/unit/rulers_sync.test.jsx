import { afterEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({ setters: [], cleanups: [] }));
vi.mock("react", async (original) => ({
  ...await original(),
  useState: (initial) => {
    const setter = vi.fn();
    harness.setters.push(setter);
    return [typeof initial === "function" ? initial() : initial, setter];
  },
  useEffect: (effect) => { harness.cleanups.push(effect()); },
  useCallback: (callback) => callback,
}));
vi.mock("../../src/canvas/use_i18n.js", () => ({ useI18n: () => ({ t: (key) => key }) }));
import { CanvasSettingsSection } from "../../src/canvas/components/settings_general.jsx";
import { useShowRulers, SHOW_RULERS_SETTING } from "../../src/canvas/use_show_rulers.js";
import { getSetting, setSetting } from "../../src/shared/settings.js";

afterEach(async () => {
  harness.cleanups.splice(0).forEach((cleanup) => cleanup?.());
  harness.setters.length = 0;
  await setSetting(SHOW_RULERS_SETTING, null);
});

describe("shared ruler preference", () => {
  it("Settings writes the preference and updates an open editor; editor toggles update Settings", async () => {
    const editor = useShowRulers();
    const editorSetter = harness.setters[0];
    const section = CanvasSettingsSection();
    const settingsSetter = harness.setters[1];
    // SettingsSection > div > [span, Switch]
    const switchEl = section.props.children.props.children[1];
    expect(switchEl.props.checked).toBe(false);
    expect(switchEl.props["data-testid"] || switchEl.props.testId).toBeTruthy();
    switchEl.props.onChange(true);
    expect(getSetting(SHOW_RULERS_SETTING)).toBe(true);
    expect(editorSetter).toHaveBeenLastCalledWith(true);
    editor.toggleRulers();
    expect(getSetting(SHOW_RULERS_SETTING)).toBe(false);
    expect(settingsSetter).toHaveBeenLastCalledWith(false);
    await setSetting(SHOW_RULERS_SETTING, true);
    expect(editorSetter).toHaveBeenLastCalledWith(true);
    await setSetting(SHOW_RULERS_SETTING, null);
    expect(editorSetter).toHaveBeenLastCalledWith(false);
  });
});
