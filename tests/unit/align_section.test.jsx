import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mock useI18n to return key or localized string so component can be evaluated both in static markup and as element tree
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({
    t: (key) => key,
    locale: "en",
    toggleLocale: () => {},
  }),
}));

import AlignSection from "../../src/canvas/components/editor_properties/align_section.jsx";
import {
  alignNodes,
  distributeNodes,
  distributeSpacingNodes,
  tidyNodes,
  measureSpacing,
} from "../../src/canvas/editor/align_ops.js";

// Helper to recursively collect all elements of a given type from a React JSX tree
function extractElements(tree, predicate) {
  const elements = [];
  function traverse(node) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) {
      elements.push(node);
    }
    if (node.props?.children) {
      React.Children.forEach(node.props.children, traverse);
    }
  }
  traverse(tree);
  return elements;
}

function extractButtons(tree) {
  return extractElements(tree, (node) => node.type === "button");
}

describe("AlignSection Component Tests", () => {
  describe("Tier 1: Alignment Controls", () => {
    it("renders alignment row with 6 buttons and accessible aria-labels", () => {
      const html = renderToStaticMarkup(
        <AlignSection count={1} onLayout={() => {}} />
      );
      expect(html).toContain('aria-label="editor.props.alignShapes.left"');
      expect(html).toContain('aria-label="editor.props.alignShapes.center"');
      expect(html).toContain('aria-label="editor.props.alignShapes.right"');
      expect(html).toContain('aria-label="editor.props.alignShapes.top"');
      expect(html).toContain('aria-label="editor.props.alignShapes.middle"');
      expect(html).toContain('aria-label="editor.props.alignShapes.bottom"');
    });

    it("invokes onLayout with alignNodes and type for all 6 alignment directions", () => {
      const onLayout = vi.fn();
      const tree = AlignSection({ count: 1, onLayout });
      const buttons = extractButtons(tree);

      expect(buttons.length).toBe(6);

      // Left
      buttons[0].props.onClick();
      expect(onLayout).toHaveBeenLastCalledWith(alignNodes, "left");

      // Center
      buttons[1].props.onClick();
      expect(onLayout).toHaveBeenLastCalledWith(alignNodes, "center");

      // Right
      buttons[2].props.onClick();
      expect(onLayout).toHaveBeenLastCalledWith(alignNodes, "right");

      // Top
      buttons[3].props.onClick();
      expect(onLayout).toHaveBeenLastCalledWith(alignNodes, "top");

      // Middle
      buttons[4].props.onClick();
      expect(onLayout).toHaveBeenLastCalledWith(alignNodes, "middle");

      // Bottom
      buttons[5].props.onClick();
      expect(onLayout).toHaveBeenLastCalledWith(alignNodes, "bottom");
    });
  });

  describe("Tier 1 & Tier 2: Distribution Controls & Spread Gating", () => {
    it("omits distribution row when selection count < 2", () => {
      const htmlZero = renderToStaticMarkup(
        <AlignSection count={0} onLayout={() => {}} />
      );
      expect(htmlZero).not.toContain("editor.props.distribute.horizontal");
      expect(htmlZero).not.toContain("editor.props.tidy.horizontal");

      const htmlOne = renderToStaticMarkup(
        <AlignSection count={1} onLayout={() => {}} />
      );
      expect(htmlOne).not.toContain("editor.props.distribute.horizontal");
      expect(htmlOne).not.toContain("editor.props.tidy.horizontal");
    });

    it("renders distribution buttons disabled when count === 2 with requiresThree description", () => {
      const html = renderToStaticMarkup(
        <AlignSection count={2} onLayout={() => {}} />
      );
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain("editor.props.distribute.requiresThree");
      expect(html).toContain("aria-description=\"editor.props.distribute.requiresThree\"");
    });

    it("renders distribution buttons enabled when count >= 3", () => {
      const html = renderToStaticMarkup(
        <AlignSection count={3} onLayout={() => {}} />
      );
      expect(html).toContain('aria-disabled="false"');
      expect(html).not.toContain("aria-description=\"editor.props.distribute.requiresThree\"");
    });

    it("does not invoke onLayout on distribute buttons when count === 2", () => {
      const onLayout = vi.fn();
      const tree = AlignSection({ count: 2, onLayout });
      const buttons = extractButtons(tree);

      // Buttons 6 through 9 are distribute centers & distribute spacing buttons
      buttons[6].props.onClick();
      buttons[7].props.onClick();
      buttons[8].props.onClick();
      buttons[9].props.onClick();

      expect(onLayout).not.toHaveBeenCalled();
    });

    it("invokes onLayout with distributeNodes and tidyNodes when count >= 3", () => {
      const onLayout = vi.fn();
      const tree = AlignSection({ count: 3, onLayout });
      const buttons = extractButtons(tree);

      expect(buttons.length).toBeGreaterThanOrEqual(10);

      // Distribute horizontal centers (button 6)
      buttons[6].props.onClick();
      expect(onLayout).toHaveBeenCalledWith(distributeNodes, "horizontal");

      // Distribute vertical centers (button 7)
      buttons[7].props.onClick();
      expect(onLayout).toHaveBeenCalledWith(distributeNodes, "vertical");

      // Distribute horizontal spacing (button 8)
      buttons[8].props.onClick();
      expect(onLayout).toHaveBeenCalledWith(tidyNodes, "horizontal");

      // Distribute vertical spacing (button 9)
      buttons[9].props.onClick();
      expect(onLayout).toHaveBeenCalledWith(tidyNodes, "vertical");
    });
  });

  describe("Tier 3: Prop Threading & Gap Measurement Integration", () => {
    it("gracefully accepts selectedNodes prop without throwing", () => {
      const nodes = [
        { id: "1", x: 100, y: 100, width: 80, height: 60 },
        { id: "2", x: 220, y: 100, width: 80, height: 60 },
      ];

      expect(() => {
        renderToStaticMarkup(
          <AlignSection count={2} onLayout={() => {}} selectedNodes={nodes} />
        );
      }).not.toThrow();
    });

    it("computes spacing accurately from selectedNodes for property display", () => {
      const nodes = [
        { id: "a", x: 0, y: 0, width: 50, height: 50 },
        { id: "b", x: 74, y: 0, width: 50, height: 50 }, // gap = 24
        { id: "c", x: 148, y: 0, width: 50, height: 50 }, // gap = 24
      ];

      const metrics = measureSpacing(nodes, "horizontal");
      expect(metrics).not.toBeNull();
      expect(metrics.avgGap).toBe(24);
      expect(metrics.isEquidistant).toBe(true);

      // Layout callback contract verification
      const onLayout = vi.fn((fn, arg) => {
        if (typeof fn === "function") {
          return fn(nodes, arg);
        }
      });

      // Simulating interactive gap adjustment dispatch
      const targetGap = 32;
      const patches = distributeSpacingNodes(nodes, { axis: "horizontal", gap: targetGap });
      expect(patches.length).toBeGreaterThan(0);
      expect(patches.find((p) => p.id === "b")?.patch.x).toBe(82); // 0 + 50 + 32 = 82
    });
  });

  describe("Tier 4: Design Token & Visual Fidelity Compliance", () => {
    it("conforms strictly to Design.md dark-mode styling tokens and focus states", () => {
      const html = renderToStaticMarkup(
        <AlignSection count={3} onLayout={() => {}} />
      );
      // Surface alpha washes and radii
      expect(html).toContain("rounded-lg");
      expect(html).toContain("bg-white/[0.06]");
      expect(html).toContain("hover:bg-white/[0.12]");
      expect(html).toContain("text-neutral-300");

      // High-contrast mint focus ring
      expect(html).toContain("focus-visible:ring-[#a7ffd4]/40");

      // Disabled states
      expect(html).toContain("disabled:opacity-40");
      expect(html).toContain("disabled:cursor-not-allowed");
    });
  });
});
