import { afterEach, describe, expect, it, vi } from "vitest";
import { shortcutBlockedByTarget } from "../../src/shared/dom_targets.js";

afterEach(() => vi.unstubAllGlobals());

function target(kind) {
  vi.stubGlobal("HTMLElement", class {});
  return Object.assign(new HTMLElement(), {
    tagName: kind === "trigger" ? "BUTTON" : "DIV",
    closest: (selector) => {
      if (kind === "trigger" && selector.includes('[aria-haspopup="listbox"]'))
        return {};
      if (kind === "option" && selector.includes('[role="listbox"]')) return {};
      return null;
    },
  });
}

describe("custom dropdown keyboard ownership", () => {
  it.each(["trigger", "option"])(
    "keeps plain navigation and delete keys inside the %s",
    (kind) => {
      const element = target(kind);
      for (const key of [
        "ArrowDown",
        "ArrowUp",
        "Delete",
        "Backspace",
        "Escape",
        "v",
      ]) {
        expect(shortcutBlockedByTarget(element, { key })).toBe(true);
      }
    },
  );

  it.each(["ctrlKey", "metaKey"])(
    "preserves %s history after menu choices",
    (modifier) => {
      expect(
        shortcutBlockedByTarget(target("trigger"), {
          code: "KeyZ",
          [modifier]: true,
        }),
      ).toBe(false);
    },
  );

  it("keeps canvas navigation available outside custom dropdowns", () => {
    expect(
      shortcutBlockedByTarget(target("canvas"), { key: "ArrowDown" }),
    ).toBe(false);
  });
});
