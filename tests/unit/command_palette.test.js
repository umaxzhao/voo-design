import { describe, expect, it, vi } from "vitest";
import {
  MAX_RECENT_COMMANDS,
  buildCommandIndex,
  filterCommands,
  moveSelection,
  normalizeRecent,
  pushRecent,
  resolveRecent,
  scoreCommand,
} from "../../src/canvas/commands/command_registry.js";

const DEFINITIONS = {
  group_selection: {
    id: "group_selection",
    kind: "action",
    summary: "Group selected layers",
    description: "Group the selected layers into one folder.",
    requires: { selection: true },
    undoable: true,
    errors: [],
  },
  zoom_pair: {
    id: "zoom_pair",
    kind: "action",
    summary: "Zoom pair",
    description: "Zoom two steps.",
    requires: {},
    undoable: false,
    errors: [],
  },
  needs_args: {
    id: "needs_args",
    kind: "action",
    summary: "Needs arguments",
    description: "A command that cannot run without arguments.",
    requires: { args: ["box"] },
    undoable: true,
    errors: [],
  },
  read_context: {
    id: "read_context",
    kind: "query",
    summary: "Read context",
    description: "A query, not an action.",
    requires: {},
    undoable: false,
    errors: [],
  },
};

const SHORTCUT_GROUPS = [
  {
    id: "edit",
    titleKey: "editor.shortcuts.group.edit",
    shortcuts: [
      { key: "⌘Z", labelKey: "editor.undo" },
      { key: "⌘G", labelKey: "editor.menu.group" },
    ],
  },
];

const DICTIONARY = {
  "editor.menu.group": "Group",
  "editor.undo": "Undo",
};

const t = (key) =>
  Object.prototype.hasOwnProperty.call(DICTIONARY, key) ? DICTIONARY[key] : key;

describe("command palette registry", () => {
  it("indexes parameter-free actions from the command table only", () => {
    const index = buildCommandIndex({
      t,
      definitions: DEFINITIONS,
      shortcutGroups: SHORTCUT_GROUPS,
    });
    const ids = index.map((entry) => entry.sourceId);
    expect(ids).toEqual(["group_selection", "zoom_pair"]);
    expect(index.every((entry) => entry.kind === "command")).toBe(true);
    expect(index.every((entry) => entry.group === "commands")).toBe(true);
    expect(index[0].id).toBe("command:group_selection");
    // Commands are executed by the host, so the registry does not carry a run.
    expect(index[0].run).toBeNull();
  });

  it("uses translated labels and falls back to the command summary", () => {
    const index = buildCommandIndex({
      t,
      definitions: DEFINITIONS,
      shortcutGroups: SHORTCUT_GROUPS,
    });
    const group = index.find((entry) => entry.sourceId === "group_selection");
    const zoom = index.find((entry) => entry.sourceId === "zoom_pair");
    expect(group.label).toBe("Group");
    expect(zoom.label).toBe("Zoom pair");
  });

  it("attaches shortcut chips from the shortcut catalog", () => {
    const index = buildCommandIndex({
      t,
      definitions: DEFINITIONS,
      shortcutGroups: SHORTCUT_GROUPS,
    });
    const group = index.find((entry) => entry.sourceId === "group_selection");
    const zoom = index.find((entry) => entry.sourceId === "zoom_pair");
    expect(group.shortcut).toBe("⌘G");
    expect(zoom.shortcut).toBeNull();
  });

  it("indexes host actions with their handlers and shortcut chips", () => {
    const run = vi.fn();
    const index = buildCommandIndex({
      t,
      definitions: DEFINITIONS,
      shortcutGroups: SHORTCUT_GROUPS,
      actions: [
        { id: "undo", labelKey: "editor.undo", label: "Undo", catalogKey: "editor.undo", run },
        { id: "no-handler", label: "Missing handler" },
      ],
    });
    const action = index.find((entry) => entry.sourceId === "undo");
    expect(action).toMatchObject({
      id: "action:undo",
      kind: "action",
      group: "actions",
      label: "Undo",
      shortcut: "⌘Z",
    });
    expect(action.run).toBe(run);
    // An action without a handler cannot be executed from the palette.
    expect(index.some((entry) => entry.sourceId === "no-handler")).toBe(false);
  });

  it("is deterministic for identical input", () => {
    const first = buildCommandIndex({
      t,
      definitions: DEFINITIONS,
      shortcutGroups: SHORTCUT_GROUPS,
      actions: [{ id: "undo", label: "Undo", run: () => {} }],
    });
    const second = buildCommandIndex({
      t,
      definitions: DEFINITIONS,
      shortcutGroups: SHORTCUT_GROUPS,
      actions: [{ id: "undo", label: "Undo", run: () => {} }],
    });
    expect(first.map((entry) => entry.id)).toEqual(
      second.map((entry) => entry.id),
    );
    expect(first.map((entry) => entry.label)).toEqual(
      second.map((entry) => entry.label),
    );
  });
});

describe("command palette scoring", () => {
  const entry = (label, extra = {}) => ({
    id: `action:${label.toLowerCase().replace(/\s+/g, "-")}`,
    kind: "action",
    label,
    description: "",
    keywords: [],
    shortcut: null,
    ...extra,
  });

  it("returns zero for an empty query or a non-match", () => {
    expect(scoreCommand("", entry("Zoom in"))).toBe(0);
    expect(scoreCommand("   ", entry("Zoom in"))).toBe(0);
    expect(scoreCommand("qqq", entry("Zoom in"))).toBe(0);
  });

  it("ranks an exact label above a prefix above a substring above a subsequence", () => {
    const exact = scoreCommand("zoom", entry("Zoom"));
    const prefix = scoreCommand("zoom", entry("Zoom in"));
    const substring = scoreCommand("zoom", entry("Reset zoom"));
    const subsequence = scoreCommand("zoom", entry("Zoo keeper mode"));
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThan(0);
  });

  it("matches case-insensitively", () => {
    expect(scoreCommand("UNDO", entry("Undo"))).toBeGreaterThan(0);
  });

  it("searches ids, keywords and descriptions at lower weights", () => {
    expect(
      scoreCommand("layer", entry("Group", { keywords: ["layer folder"] })),
    ).toBeGreaterThan(0);
    expect(
      scoreCommand("folder", entry("Group", { description: "layer folder" })),
    ).toBeGreaterThan(0);
    expect(
      scoreCommand("artifact", entry("Group", { id: "action:artifact" })),
    ).toBeGreaterThan(0);
  });
});

describe("command palette filtering", () => {
  const index = [
    { id: "action:zoom-in", kind: "action", label: "Zoom in", description: "", keywords: [] },
    { id: "action:reset-zoom", kind: "action", label: "Reset zoom", description: "", keywords: [] },
    { id: "command:group", kind: "command", label: "Group", description: "", keywords: [] },
    { id: "action:zebra", kind: "action", label: "Zebra", description: "", keywords: [] },
  ];

  it("returns a deterministic copy for an empty query", () => {
    const result = filterCommands(index, "  ");
    expect(result.map((entry) => entry.id)).toEqual(index.map((entry) => entry.id));
    expect(result).not.toBe(index);
  });

  it("only keeps matches and orders them best-first", () => {
    const result = filterCommands(index, "zoom");
    expect(result.map((entry) => entry.id)).toEqual([
      "action:zoom-in",
      "action:reset-zoom",
    ]);
  });

  it("respects the result limit", () => {
    expect(filterCommands(index, "", { limit: 2 })).toHaveLength(2);
    expect(filterCommands(index, "zoom", { limit: 1 }).map((entry) => entry.id)).toEqual([
      "action:zoom-in",
    ]);
    expect(filterCommands(index, "zebra", { limit: 0 })).toEqual([]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterCommands(index, "nothing-here")).toEqual([]);
  });
});

describe("command palette selection", () => {
  it("wraps the active row over the list bounds", () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(1, -1, 3)).toBe(0);
  });

  it("wraps a state object without mutating it", () => {
    const state = { index: 2, query: "zoom" };
    const next = moveSelection(state, 1, 3);
    expect(next).toEqual({ index: 0, query: "zoom" });
    expect(state.index).toBe(2);
    expect(moveSelection({ index: 0 }, -1, 0)).toEqual({ index: 0 });
  });

  it("stays at zero for an empty list or malformed index", () => {
    expect(moveSelection(0, 1, 0)).toBe(0);
    expect(moveSelection(-3, 1, 0)).toBe(0);
    expect(moveSelection(NaN, 1, 3)).toBe(1);
    expect(moveSelection(0, NaN, 3)).toBe(0);
  });
});

describe("command palette recents", () => {
  it("normalizes invalid entries and removes duplicates", () => {
    expect(normalizeRecent(null)).toEqual([]);
    expect(normalizeRecent(["command:a", null, 4, " command:b ", "command:a", ""])).toEqual([
      "command:a",
      "command:b",
    ]);
  });

  it("pushes an id to the front, de-duplicated and capped", () => {
    const list = ["command:a", "command:b", "command:c"];
    expect(pushRecent("command:b", list)).toEqual([
      "command:b",
      "command:a",
      "command:c",
    ]);
    expect(pushRecent("command:a", list, 2)).toEqual(["command:a", "command:b"]);
    expect(pushRecent("command:a", list, MAX_RECENT_COMMANDS)).toHaveLength(3);
    expect(pushRecent("", list)).toEqual(list);
  });

  it("resolves recent ids against the index in recent order", () => {
    const index = [
      { id: "command:a", label: "A" },
      { id: "command:b", label: "B" },
    ];
    expect(resolveRecent(index, ["command:b", "missing", "command:a"]).map((entry) => entry.id)).toEqual([
      "command:b",
      "command:a",
    ]);
  });
});

import { buildExtendedPaletteActions } from "../../src/canvas/commands/palette_actions.js";
import { TOOL } from "../../src/canvas/editor/tool_ids.js";

describe("extended palette coverage", () => {
  const setup = () => {
    const engine = { flipHorizontal: vi.fn(), flipVertical: vi.fn(), canCombineSelection: () => true, combineSelected: vi.fn() };
    const host = { engine, onTool: vi.fn(), onCreateComponent: vi.fn(), onToggleGrid: vi.fn(), onOpenAgent: vi.fn(), setLocale: vi.fn() };
    return { host, index: buildCommandIndex({ definitions: {}, actions: buildExtendedPaletteActions(host) }) };
  };
  it("indexes all 30 real host actions with unique ids", () => {
    const { index } = setup();
    expect(index).toHaveLength(30);
    expect(new Set(index.map(row => row.id)).size).toBe(30);
    expect(index.some(row => /hand|theme|frame/.test(row.sourceId))).toBe(false);
  });
  it("routes tools, booleans, flip, component, grid, agent and locale to existing handlers", () => {
    const { host, index } = setup();
    const run = id => index.find(row => row.sourceId === id).run();
    run("tool-rect"); expect(host.onTool).toHaveBeenCalledWith(TOOL.RECT);
    run("boolean-union"); expect(host.engine.combineSelected).toHaveBeenCalledWith("union");
    run("flip-horizontal"); expect(host.engine.flipHorizontal).toHaveBeenCalledOnce();
    run("flip-vertical"); expect(host.engine.flipVertical).toHaveBeenCalledOnce();
    run("create-component"); expect(host.onCreateComponent).toHaveBeenCalledOnce();
    run("toggle-grid"); expect(host.onToggleGrid).toHaveBeenCalledOnce();
    run("open-agent"); expect(host.onOpenAgent).toHaveBeenCalledOnce();
    run("language-zh"); expect(host.setLocale).toHaveBeenCalledWith("zh");
  });
  it("fuzzy-filters the new actions and wraps selection over results", () => {
    const { index } = setup();
    const rows = filterCommands(index, "blnun");
    expect(rows.some(row => row.sourceId === "boolean-union")).toBe(true);
    expect(moveSelection(rows.length - 1, 1, rows.length)).toBe(0);
    expect(filterCommands(index, "language")).toHaveLength(2);
  });
  it("does not combine an incompatible selection", () => {
    const { host, index } = setup();
    host.engine.canCombineSelection = () => false;
    index.find(row => row.sourceId === "boolean-union").run();
    expect(host.engine.combineSelected).not.toHaveBeenCalled();
  });
});

import en from "../../src/shared/i18n/en.js";
import zh from "../../src/shared/i18n/zh.js";

it("translates every extended action label in English and Chinese", () => {
  const actions = buildExtendedPaletteActions({ onTool: vi.fn(), onCreateComponent: vi.fn(), onToggleGrid: vi.fn(), onOpenAgent: vi.fn(), setLocale: vi.fn() });
  for (const dictionary of [en, zh]) {
    for (const action of actions) {
      expect(dictionary[action.labelKey], action.labelKey).toBeTruthy();
    }
    const index = buildCommandIndex({ definitions: {}, actions, t: key => dictionary[key] ?? key });
    expect(index).toHaveLength(30);
    expect(index.every(row => row.label !== row.sourceId)).toBe(true);
  }
});
