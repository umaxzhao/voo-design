import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("mobile interaction experience polish", () => {
  it("keeps layers and properties panels independently collapsible in hook source", async () => {
    const hookSource = readFileSync(
      "src/canvas/components/editor_hooks/use_editor_mobile_panels.js",
      "utf8",
    );
    // State must be independent rather than bound to a single collapsed/expanded flag
    expect(hookSource).toContain("const [mobileLayersExpanded, setMobileLayersExpanded] = useState(false);");
    expect(hookSource).toContain("const [mobilePropertiesExpanded, setMobilePropertiesExpanded] = useState(false);");
    expect(hookSource).not.toContain("const mobileLayersExpanded = mobilePanelsExpanded;");
    // Supports swipe down to collapse when expanded AND swipe up to expand when collapsed
    expect(hookSource).toContain("deltaY < 28");
    expect(hookSource).toContain("deltaY > -28");
    expect(hookSource).toContain("setMobileLayersExpanded(true)");
    expect(hookSource).toContain("setMobilePropertiesExpanded(true)");
  });

  it("dispatches pointercancel to canvas stage when pinch gesture begins", () => {
    const gestureSource = readFileSync(
      "src/canvas/components/use_mobile_canvas_gestures.js",
      "utf8",
    );
    expect(gestureSource).toContain('new PointerEvent("pointercancel"');
    expect(gestureSource).toContain('stage.dispatchEvent');
    expect(gestureSource).toContain('gesture.points.size === 2');
  });

  it("ensures mobile CSS docks tools above panels even when only one panel is expanded", () => {
    const css = readFileSync("src/canvas/components/editor_mobile_layout.css", "utf8");
    expect(css).toContain('[data-testid="design-editor"].editor-narrow[data-mobile-layers-expanded="true"] .viewport-tools');
    expect(css).toContain('[data-testid="design-editor"].editor-narrow[data-mobile-properties-expanded="true"] .viewport-tools');
    expect(css).toContain('[data-testid="design-editor"].editor-narrow[data-mobile-layers-expanded="true"] [data-testid="editor-contextual-taskbar"]');
    expect(css).toContain('[data-testid="design-editor"].editor-narrow[data-mobile-properties-expanded="true"] [data-testid="editor-contextual-taskbar"]');
    expect(css).toContain('[data-testid="editor-more-menu"] button[role="menuitem"]');
  });

  it("upgrades color picker and gradient stops to pointer events with touch-none", () => {
    const colorSurfaces = readFileSync("src/canvas/color_picker/ColorSliderSurfaces.jsx", "utf8");
    expect(colorSurfaces).toContain("onPointerDown={handleSvPointerDown}");
    expect(colorSurfaces).toContain("onPointerDown={handleHuePointerDown}");
    expect(colorSurfaces).toContain("touch-none");
    expect(colorSurfaces).toContain("pointermove");
    expect(colorSurfaces).toContain("pointerup");

    const gradientStops = readFileSync("src/canvas/color_picker/GradientStopsBar.jsx", "utf8");
    expect(gradientStops).toContain("onPointerDown=");
    expect(gradientStops).toContain("touch-none");
    expect(gradientStops).toContain("pointermove");
  });

  it("configures viewport meta for mobile webapp experience without unintended scaling", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('maximum-scale=1.0');
    expect(html).toContain('user-scalable=no');
  });

  it("uses pointerdown for welcome composer popup dismiss", () => {
    const composer = readFileSync("src/canvas/components/welcome_dashboard/welcome_prompt_composer.jsx", "utf8");
    expect(composer).toContain('document.addEventListener("pointerdown", onPointerDown)');
    expect(composer).not.toContain('document.addEventListener("mousedown", onPointerDown)');
  });
});
