import { describe, it, expect } from "vitest";
import {
  isClosedPath,
  pathMenuActions,
  PATH_MENU_ACTION,
} from "../../src/canvas/editor/path_menu_actions.js";
import enStrings from "../../src/shared/i18n/extended-en.js";
import zhStrings from "../../src/shared/i18n/extended-zh.js";

const OPEN_PATH = {
  kind: "path",
  points: [
    { x: 0, y: 0, close: false },
    { x: 10, y: 10, close: false },
  ],
};
const CLOSED_PATH = {
  kind: "path",
  points: [
    { x: 0, y: 0, close: false },
    { x: 10, y: 0, close: false },
    { x: 10, y: 10, close: true },
  ],
};
const RECT = { kind: "rect", x: 0, y: 0, width: 5, height: 5 };

describe("pathMenuActions", () => {
  it("offers nothing for an empty selection", () => {
    expect(pathMenuActions([])).toEqual([]);
  });

  it("offers nothing when a non-path node is selected", () => {
    expect(pathMenuActions([RECT])).toEqual([]);
    expect(pathMenuActions([OPEN_PATH, RECT])).toEqual([]);
  });

  it("offers edit actions for one open path, without offset", () => {
    expect(pathMenuActions([OPEN_PATH])).toEqual([
      PATH_MENU_ACTION.SIMPLIFY,
      PATH_MENU_ACTION.REVERSE,
      PATH_MENU_ACTION.TOGGLE_CLOSE,
    ]);
  });

  it("adds outset and inset for one closed path", () => {
    expect(pathMenuActions([CLOSED_PATH])).toEqual([
      PATH_MENU_ACTION.SIMPLIFY,
      PATH_MENU_ACTION.REVERSE,
      PATH_MENU_ACTION.TOGGLE_CLOSE,
      PATH_MENU_ACTION.OUTSET,
      PATH_MENU_ACTION.INSET,
    ]);
  });

  it("offers only join for two or more selected paths", () => {
    expect(pathMenuActions([OPEN_PATH, CLOSED_PATH])).toEqual([
      PATH_MENU_ACTION.JOIN,
    ]);
  });
});

describe("isClosedPath", () => {
  it("reads the close flag of the last anchor", () => {
    expect(isClosedPath(CLOSED_PATH)).toBe(true);
    expect(isClosedPath(OPEN_PATH)).toBe(false);
    expect(isClosedPath({ points: [] })).toBe(false);
  });
});

describe("path menu i18n keys", () => {
  const keys = [
    "editor.menu.path.simplify",
    "editor.menu.path.reverse",
    "editor.menu.path.join",
    "editor.menu.path.close",
    "editor.menu.path.open",
    "editor.menu.path.outset",
    "editor.menu.path.inset",
  ];

  it("defines every key in both English and Chinese", () => {
    for (const key of keys) {
      expect(enStrings[key], `en ${key}`).toBeTruthy();
      expect(zhStrings[key], `zh ${key}`).toBeTruthy();
    }
  });

  it("keeps the amount placeholder in the offset labels", () => {
    expect(enStrings["editor.menu.path.outset"]).toContain("{amount}");
    expect(zhStrings["editor.menu.path.inset"]).toContain("{amount}");
  });
});
