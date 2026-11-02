// Editor theme: default dark, light applied as a data attribute, event emitted.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDITOR_THEMES,
  applyEditorTheme,
  currentEditorTheme,
  setEditorTheme,
} from "../../src/canvas/use_editor_theme.js";
import { THEME_CHANGED_EVENT } from "../../src/canvas/theme_events.js";
import { getSetting } from "../../src/shared/settings.js";

const stubs = () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", {
    dispatchEvent,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal(
    "CustomEvent",
    class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
  );
  return dispatchEvent;
};

afterEach(() => vi.unstubAllGlobals());

describe("editor theme", () => {
  it("supports dark and light", () => {
    expect(EDITOR_THEMES).toEqual(["dark", "light"]);
  });

  it("lands on dark unless the stored setting is light", () => {
    stubs();
    expect(currentEditorTheme()).toBe("dark");
    setEditorTheme("light");
    expect(currentEditorTheme()).toBe("light");
    expect(getSetting("voo.editor.theme")).toBe("light");
    setEditorTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("writes the data attribute and emits one change event", () => {
    const dispatchEvent = stubs();
    const value = setEditorTheme("light");
    expect(value).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].type).toBe(THEME_CHANGED_EVENT);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({ theme: "light" });
  });

  it("clamps unknown values to dark", () => {
    stubs();
    expect(applyEditorTheme("neon")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
