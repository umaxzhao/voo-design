import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Hook stand-ins so the component can be driven without a DOM.
const hooks = vi.hoisted(() => ({ active: false, expanded: false, effects: [] }));
vi.mock("react", async (original) => {
  const actual = await original();
  return {
    ...actual,
    useState: (initial) => hooks.active
      ? [hooks.expanded, (next) => { hooks.expanded = typeof next === "function" ? next(hooks.expanded) : next; }]
      : actual.useState(initial),
    useEffect: (effect, deps) => hooks.active ? hooks.effects.push(effect) : actual.useEffect(effect, deps),
  };
});
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en" }),
}));

import DesignSystemCards, { COLLAPSED_COUNT, coverColors } from "../../src/canvas/components/design_system_cards.jsx";
import { listDesignSystems } from "../../src/canvas/editor/design_system_registry.js";

const customSystem = (n) => ({
  id: `custom-${n}`,
  name: `Custom ${n}`,
  builtIn: false,
  designTokens: { colors: { background: "#101010", text: "#fafafa", accent: "#ff6600" } },
  designMd: "",
});
const manySystems = () => listDesignSystems([customSystem(1), customSystem(2)]);
const itemIds = (html) => [...html.matchAll(/data-testid="design-system-item-([^"]+)"/g)].map((m) => m[1]);
const props = (systems, selectedId = systems[0].id, onSelect = () => {}) => ({ systems, selectedId, appliedId: null, onSelect });
const render = (p) => renderToStaticMarkup(<DesignSystemCards {...p} />);

/** Expand function components so handlers of nested elements become reachable. */
function findByTestId(node, testId) {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map((child) => findByTestId(child, testId)).find(Boolean) ?? null;
  if (node.props?.["data-testid"] === testId) return node;
  const resolved = typeof node.type === "function" ? node.type(node.props) : node.props?.children;
  return findByTestId(resolved, testId);
}

describe("DesignSystemCards", () => {
  it("renders only the first COLLAPSED_COUNT cards by default", () => {
    const systems = manySystems();
    expect(systems.length).toBeGreaterThan(COLLAPSED_COUNT);
    const html = render(props(systems));
    expect(itemIds(html)).toEqual(systems.slice(0, COLLAPSED_COUNT).map((s) => s.id));
    expect(html).toContain('data-testid="design-system-list"');
  });

  it("shows a more control only when there are more than COLLAPSED_COUNT systems", () => {
    const systems = manySystems();
    expect(render(props(systems))).toContain("designSystems.showMore");
    expect(render(props(systems.slice(0, COLLAPSED_COUNT)))).not.toContain('data-testid="design-system-more"');
  });

  it("reveals the rest and switches the label when toggled", () => {
    const systems = manySystems();
    hooks.active = true;
    hooks.expanded = false;
    try {
      const tree = DesignSystemCards(props(systems));
      findByTestId(tree, "design-system-more").props.onClick();
      expect(hooks.expanded).toBe(true);
      const html = render(props(systems));
      expect(itemIds(html)).toEqual(systems.map((s) => s.id));
      expect(html).toContain("designSystems.showLess");
      expect(html).toContain('aria-expanded="true"');
    } finally {
      hooks.active = false;
    }
  });

  it("starts expanded when the selected system is beyond the collapsed range", () => {
    const systems = manySystems();
    const html = render(props(systems, systems.at(-1).id));
    expect(itemIds(html)).toHaveLength(systems.length);
    expect(html).toContain("designSystems.showLess");
  });

  it("calls onSelect with the card id when clicked", () => {
    const systems = manySystems();
    const onSelect = vi.fn();
    hooks.active = true;
    hooks.expanded = false;
    try {
      const tree = DesignSystemCards(props(systems, systems[0].id, onSelect));
      findByTestId(tree, `design-system-item-${systems[1].id}`).props.onClick();
    } finally {
      hooks.active = false;
    }
    expect(onSelect).toHaveBeenCalledWith(systems[1].id);
  });

  it("renders the cards as tabs in one tablist and marks only the selected one", () => {
    const systems = manySystems();
    const html = render(props(systems, systems[1].id));
    expect(html.match(/role="tablist"/g)).toHaveLength(1);
    expect(html.match(/role="tab"/g)).toHaveLength(COLLAPSED_COUNT);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`aria-selected="true"[^>]*data-testid="design-system-item-${systems[1].id}"`));
  });

  it("badges the applied system as in use and tells built-in from custom", () => {
    const systems = manySystems();
    const html = render({ ...props(systems), appliedId: systems[0].id });
    expect(html.match(/designSystems\.inUse/g)).toHaveLength(1);
    expect(html).toContain("designSystems.builtIn");
    expect(render(props(systems, systems.at(-1).id))).toContain("designSystems.custom");
  });

  it("hides the cover from assistive tech and paints it with the system's own token colours", () => {
    const systems = manySystems();
    const html = render(props(systems));
    expect(html).toContain('data-testid="design-system-cover"');
    expect(html.match(/<div aria-hidden="true"[^>]*design-system-cover/g)).toHaveLength(COLLAPSED_COUNT);
    const builtIn = systems[0];
    const colors = coverColors(builtIn);
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.length).toBeLessThanOrEqual(6);
    expect(new Set(colors.map((c) => c.toLowerCase())).size).toBe(colors.length);
    const firstCard = html.split('role="tab"')[1];
    for (const color of colors) expect(firstCard).toContain(`background-color:${color}`);
    // Different systems must not share one fixed cover.
    expect(coverColors(systems[1])).not.toEqual(colors);
  });

  it("uses DesignMD page covers for the curated presets", () => {
    const presets = listDesignSystems().slice(0, COLLAPSED_COUNT);
    const html = render(props(presets));

    expect(presets.map((system) => system.id)).toEqual([
      "stripe",
      "linear",
      "vercel",
      "anthropic",
      "notion",
      "figma",
    ]);
    expect(html.match(/loading="lazy"/g)).toHaveLength(COLLAPSED_COUNT);
    expect(presets.every((system) => system.sourceUrl && system.sourceName && system.coverImage)).toBe(true);
  });

  it("falls back to the neutral swatch when a system has no colours", () => {
    const bare = { ...customSystem(9), designTokens: { colors: {} } };
    expect(coverColors(bare)).toEqual([]);
    const html = render(props([bare]));
    expect(html).toContain("bg-white/[0.08]");
    expect(html).not.toContain("design-system-cover-swatch");
  });
});
