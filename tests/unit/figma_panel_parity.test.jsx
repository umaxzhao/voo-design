import { describe, expect, it, vi } from "vitest";
import { evaluateMathExpression } from "../../src/canvas/components/bounded_number_input.jsx";
import { renderToStaticMarkup } from "react-dom/server";
import MixedField from "../../src/canvas/components/editor_properties/mixed_field.jsx";
import { CollapsibleSection, StaticSection } from "../../src/canvas/components/editor_properties/property_section.jsx";
import { replaceSelectionColour } from "../../src/canvas/components/editor_properties/selection_colors_section.jsx";

describe("Figma properties panel parity", () => {
  it("evaluates mathematical expressions in numeric inputs", () => {
    expect(evaluateMathExpression("100 + 20")).toBe(120);
    expect(evaluateMathExpression("200 / 2")).toBe(100);
    expect(evaluateMathExpression("50 * 3")).toBe(150);
    expect(evaluateMathExpression("100 - 15")).toBe(85);
    expect(evaluateMathExpression("  (10 + 20) * 2  ")).toBe(60);
    expect(evaluateMathExpression("12.5 + 2.5")).toBe(15);
    expect(evaluateMathExpression("invalid + code")).toBeNaN();
    expect(evaluateMathExpression("")).toBeNaN();

    // Relative expressions with base value (Figma parity)
    expect(evaluateMathExpression("* 2", 50)).toBe(100);
    expect(evaluateMathExpression("/ 2", 100)).toBe(50);
    expect(evaluateMathExpression("+ 20", 80)).toBe(100);
    expect(evaluateMathExpression("- 15", 100)).toBe(85);
    expect(evaluateMathExpression("200", 100)).toBe(200); // explicit absolute overrides base
  });

  it("renders Mixed placeholder for multi-selection with differing values", () => {
    const markup = renderToStaticMarkup(
      <MixedField label="W" onValueChange={() => {}} />
    );
    expect(markup).toContain('placeholder="Mixed"');
    expect(markup).toContain('Mixed');

    const suffixMarkup = renderToStaticMarkup(
      <MixedField label="Opacity" suffix="%" onValueChange={() => {}} />
    );
    expect(suffixMarkup).toContain('placeholder="Mixed %"');
  });

  it("renders collapsible sections with chevron and toggle semantics", () => {
    const markup = renderToStaticMarkup(
      <CollapsibleSection title="Position" defaultOpen={true}>
        <div data-testid="position-content">Content</div>
      </CollapsibleSection>
    );
    expect(markup).toContain("Position");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("lucide-chevron-down");
    expect(markup).toContain("position-content");

    const staticMarkup = renderToStaticMarkup(
      <StaticSection title="Layer">
        <div data-testid="layer-content">Layer controls</div>
      </StaticSection>
    );
    expect(staticMarkup).toContain("Layer");
    expect(staticMarkup).toContain('aria-expanded="true"');
    expect(staticMarkup).toContain("layer-content");
  });

  it("replaces color across matching selection nodes as a single transaction", () => {
    const nodes = [
      { id: "node-1", fill: "#FF0000", stroke: "#000000" },
      { id: "node-2", fill: "#00FF00", stroke: "#FF0000" },
      { id: "node-3", fills: [{ fill: "#FF0000" }, { fill: "#FFFFFF" }] },
    ];
    const updateNode = vi.fn();
    const commit = vi.fn();
    const engine = {
      getDocument: () => ({ nodes }),
      updateNode,
      commit,
    };

    const changed = replaceSelectionColour(engine, ["node-1", "node-2", "node-3"], "#FF0000", "#0000FF");
    expect(changed).toBe(true);
    expect(updateNode).toHaveBeenCalledTimes(3);
    expect(updateNode).toHaveBeenCalledWith("node-1", { fill: "#0000FF" }, { commit: false });
    expect(updateNode).toHaveBeenCalledWith("node-2", { stroke: "#0000FF" }, { commit: false });
    expect(updateNode).toHaveBeenCalledWith("node-3", { fills: [{ fill: "#0000FF" }, { fill: "#FFFFFF" }] }, { commit: false });
    expect(commit).toHaveBeenCalledWith("editor.history.entry.color");
  });
});
