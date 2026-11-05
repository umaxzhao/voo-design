import { describe, expect, it } from "vitest";
import { evaluateMathExpression } from "../../src/canvas/components/bounded_number_input.jsx";
import { renderToStaticMarkup } from "react-dom/server";
import MixedField from "../../src/canvas/components/editor_properties/mixed_field.jsx";
import { CollapsibleSection, StaticSection } from "../../src/canvas/components/editor_properties/property_section.jsx";

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
});
