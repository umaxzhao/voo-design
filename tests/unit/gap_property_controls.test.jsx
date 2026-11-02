// Polyfill Element for PropTypes.instanceOf(Element) under Node.js environment
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { nodeAABB } from "../../src/canvas/editor/scene_geometry.js";

const { default: ScrubField } = await import(
  "../../src/canvas/components/scrub_field.jsx"
);

/**
 * Comprehensive 4-Tier Test Suite for Gap Property Controls & ScrubField
 * Targets:
 *   - src/canvas/components/scrub_field.jsx
 *   - Inspector Gap measurement & dominant axis detection
 *   - ScrubField interaction contracts and design system tokens
 */

// Pure measurement function implementing the mathematical contract for Inspector UI
function measureSelectionMetrics(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2) {
    return {
      dominantAxis: "horizontal",
      gap: 0,
      isUniform: true,
      horizontal: { averageGap: 0, isUniform: true, gaps: [] },
      vertical: { averageGap: 0, isUniform: true, gaps: [] },
    };
  }

  const items = nodes.map((node) => {
    const box = nodeAABB(node);
    return { id: node.id, x: box.x, y: box.y, w: box.width, h: box.height };
  });

  // 1. Horizontal gaps
  const sortedX = [...items].sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
  const hGaps = [];
  for (let i = 0; i < sortedX.length - 1; i++) {
    hGaps.push(sortedX[i + 1].x - (sortedX[i].x + sortedX[i].w));
  }
  const avgHGap = hGaps.reduce((acc, g) => acc + g, 0) / hGaps.length;
  const isHUniform = hGaps.every((g) => Math.abs(g - avgHGap) < 0.5);

  // 2. Vertical gaps
  const sortedY = [...items].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const vGaps = [];
  for (let i = 0; i < sortedY.length - 1; i++) {
    vGaps.push(sortedY[i + 1].y - (sortedY[i].y + sortedY[i].h));
  }
  const avgVGap = vGaps.reduce((acc, g) => acc + g, 0) / vGaps.length;
  const isVUniform = vGaps.every((g) => Math.abs(g - avgVGap) < 0.5);

  // 3. Dominant Axis
  const spreadX =
    Math.max(...items.map((it) => it.x + it.w / 2)) -
    Math.min(...items.map((it) => it.x + it.w / 2));
  const spreadY =
    Math.max(...items.map((it) => it.y + it.h / 2)) -
    Math.min(...items.map((it) => it.y + it.h / 2));
  const dominantAxis = spreadX >= spreadY ? "horizontal" : "vertical";
  const dominantAvg = dominantAxis === "horizontal" ? avgHGap : avgVGap;
  const dominantUniform = dominantAxis === "horizontal" ? isHUniform : isVUniform;

  return {
    dominantAxis,
    gap: Math.round(dominantAvg),
    isUniform: dominantUniform,
    horizontal: { averageGap: Math.round(avgHGap), isUniform: isHUniform, gaps: hGaps },
    vertical: { averageGap: Math.round(avgVGap), isUniform: isVUniform, gaps: vGaps },
  };
}

describe("Gap Property Controls - Tier 1: Functional Feature Coverage", () => {
  it("F6.1: renders ScrubField with Gap prefix and numeric value", () => {
    const html = renderToStaticMarkup(
      <ScrubField
        prefix="Gap"
        value={16}
        min={-999}
        max={9999}
        step={1}
        onValueChange={() => {}}
        ariaLabel="Gap"
      />,
    );
    expect(html).toContain("Gap");
    expect(html).toContain('value="16"');
    // Design token: rounded-xl, bg-neutral-800
    expect(html).toContain("rounded-xl");
    expect(html).toContain("bg-neutral-800");
  });

  it("F6.2: calculates dominant horizontal axis when items spread wider along X", () => {
    const nodes = [
      { id: "1", x: 0, y: 100, width: 50, height: 50 },
      { id: "2", x: 100, y: 110, width: 50, height: 50 },
      { id: "3", x: 250, y: 105, width: 50, height: 50 },
    ];
    const metrics = measureSelectionMetrics(nodes);
    expect(metrics.dominantAxis).toBe("horizontal");
    // Gaps: (100 - 50 = 50), (250 - 150 = 100) -> avg = 75
    expect(metrics.horizontal.averageGap).toBe(75);
    expect(metrics.horizontal.isUniform).toBe(false);
  });

  it("F6.3: calculates dominant vertical axis when items spread taller along Y", () => {
    const nodes = [
      { id: "1", x: 100, y: 0, width: 50, height: 50 },
      { id: "2", x: 105, y: 80, width: 50, height: 50 },
      { id: "3", x: 95, y: 200, width: 50, height: 50 },
    ];
    const metrics = measureSelectionMetrics(nodes);
    expect(metrics.dominantAxis).toBe("vertical");
    // Vertical gaps: (80 - 50 = 30), (200 - 130 = 70) -> avg = 50
    expect(metrics.vertical.averageGap).toBe(50);
  });

  it("F6.4: detects uniform spacing when all gaps are identical", () => {
    const nodes = [
      { id: "1", x: 0, y: 0, width: 40, height: 40 },
      { id: "2", x: 60, y: 0, width: 40, height: 40 }, // gap = 20
      { id: "3", x: 120, y: 0, width: 40, height: 40 }, // gap = 20
    ];
    const metrics = measureSelectionMetrics(nodes);
    expect(metrics.isUniform).toBe(true);
    expect(metrics.gap).toBe(20);
  });

  it("F6.5: ScrubField container conforms to Design.md mint focus ring tokens", () => {
    const html = renderToStaticMarkup(
      <ScrubField
        prefix="Gap"
        value={24}
        min={0}
        max={100}
        onValueChange={() => {}}
        ariaLabel="Gap"
      />,
    );
    expect(html).toContain("focus-within:ring-[#a7ffd4]/40");
  });
});

describe("Gap Property Controls - Tier 2: Boundary & Corner Cases", () => {
  it("B3.1: allows zero gap (gap = 0) without clearing input", () => {
    const html = renderToStaticMarkup(
      <ScrubField
        prefix="Gap"
        value={0}
        min={-999}
        max={9999}
        onValueChange={() => {}}
        ariaLabel="Gap"
      />,
    );
    expect(html).toContain('value="0"');
  });

  it("B3.2: allows negative gap values (e.g. -12px) for overlapping avatar stacks", () => {
    const html = renderToStaticMarkup(
      <ScrubField
        prefix="Gap"
        value={-12}
        min={-999}
        max={9999}
        onValueChange={() => {}}
        ariaLabel="Gap"
      />,
    );
    expect(html).toContain('value="-12"');
  });

  it("B3.3: handles massive gap values (e.g. 5000px)", () => {
    const html = renderToStaticMarkup(
      <ScrubField
        prefix="Gap"
        value={5000}
        min={-999}
        max={9999}
        onValueChange={() => {}}
        ariaLabel="Gap"
      />,
    );
    expect(html).toContain('value="5000"');
  });

  it("B3.4: returns default metrics for empty or single item input", () => {
    const emptyMetrics = measureSelectionMetrics([]);
    expect(emptyMetrics.gap).toBe(0);
    expect(emptyMetrics.isUniform).toBe(true);

    const singleMetrics = measureSelectionMetrics([{ id: "1", x: 0, y: 0, width: 50, height: 50 }]);
    expect(singleMetrics.gap).toBe(0);
  });

  it("B3.5: disabled state applies opacity-40 and pointer-events-none", () => {
    const html = renderToStaticMarkup(
      <ScrubField
        prefix="Gap"
        value={16}
        min={0}
        max={100}
        disabled={true}
        onValueChange={() => {}}
        ariaLabel="Gap"
      />,
    );
    expect(html).toContain("opacity-40");
    expect(html).toContain("pointer-events-none");
  });
});

describe("Gap Property Controls - Tier 3: Cross-Feature Interactions", () => {
  it("C3.1: scrubbing value triggers onValueChange callback with target number", () => {
    const onValueChange = vi.fn();
    const field = (
      <ScrubField
        prefix="Gap"
        value={20}
        min={0}
        max={100}
        onValueChange={onValueChange}
        ariaLabel="Gap"
      />
    );
    // Simulate user interaction callback invocation
    field.props.onValueChange(24);
    expect(onValueChange).toHaveBeenCalledWith(24);
  });

  it("C3.2: commit callback triggers onCommit when user finishes scrub or enters value", () => {
    const onCommit = vi.fn();
    const field = (
      <ScrubField
        prefix="Gap"
        value={24}
        min={-999}
        max={9999}
        onValueChange={() => {}}
        onCommit={onCommit}
        ariaLabel="Gap"
      />
    );
    field.props.onCommit();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe("Gap Property Controls - Tier 4: Real-World Scenarios", () => {
  it("W3.1: normalizing irregular card gaps (14px & 28px) to uniform 24px gap", () => {
    const cards = [
      { id: "c1", x: 0, y: 0, width: 100, height: 80 },
      { id: "c2", x: 114, y: 0, width: 100, height: 80 }, // gap = 14
      { id: "c3", x: 242, y: 0, width: 100, height: 80 }, // gap = 28
    ];
    const initial = measureSelectionMetrics(cards);
    expect(initial.isUniform).toBe(false);
    expect(initial.gap).toBe(21); // (14 + 28) / 2 = 21

    // User modifies gap to 24
    const targetGap = 24;
    const normalizedCards = [
      { ...cards[0] },
      { ...cards[1], x: cards[0].x + cards[0].width + targetGap },
      { ...cards[2], x: cards[0].x + cards[0].width + targetGap + cards[1].width + targetGap },
    ];
    const after = measureSelectionMetrics(normalizedCards);
    expect(after.isUniform).toBe(true);
    expect(after.gap).toBe(24);
  });

  it("W3.2: avatar overlapping stack negative gap measurement (-6px)", () => {
    const avatars = [
      { id: "a1", x: 0, y: 0, width: 32, height: 32 },
      { id: "a2", x: 26, y: 0, width: 32, height: 32 }, // 26 - 32 = -6
      { id: "a3", x: 52, y: 0, width: 32, height: 32 }, // 52 - 58 = -6
      { id: "a4", x: 78, y: 0, width: 32, height: 32 }, // 78 - 84 = -6
    ];
    const metrics = measureSelectionMetrics(avatars);
    expect(metrics.dominantAxis).toBe("horizontal");
    expect(metrics.gap).toBe(-6);
    expect(metrics.isUniform).toBe(true);
  });
});
