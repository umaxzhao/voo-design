// Persisted editor preference + change event (used by the autosave toggle).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDITOR_AUTOSAVE_SETTING,
  SETTING_CHANGED_EVENT,
  updateEditorSetting,
} from "../../src/canvas/use_editor_setting.js";
import { getSetting } from "../../src/shared/settings.js";

afterEach(() => vi.unstubAllGlobals());

describe("editor setting", () => {
  it("persists and broadcasts a value", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "CustomEvent",
      class CustomEvent {
        constructor(type, init) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
    );
    updateEditorSetting(EDITOR_AUTOSAVE_SETTING, true);
    expect(getSetting(EDITOR_AUTOSAVE_SETTING)).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].type).toBe(SETTING_CHANGED_EVENT);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      key: EDITOR_AUTOSAVE_SETTING,
      value: true,
    });
    updateEditorSetting(EDITOR_AUTOSAVE_SETTING, false);
    expect(getSetting(EDITOR_AUTOSAVE_SETTING)).toBe(false);
  });
});
