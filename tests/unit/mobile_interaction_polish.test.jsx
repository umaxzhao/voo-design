import { describe, expect, it } from "vitest";
import { dispatchPointerHandoff, isPointerHandoff } from "../../src/canvas/editor/pointer-gesture-handoff.js";
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

  it("cancels the original pointer surface without clearing the owning pinch", () => {
    const gestureSource = readFileSync(
      "src/canvas/components/use_mobile_canvas_gestures.js",
      "utf8",
    );
    expect(gestureSource).toContain('new PointerEvent("pointercancel"');
    expect(gestureSource).toContain('dispatchPointerHandoff(first.target, cancellation)');
    expect(gestureSource).toContain('(event.nativeEvent ?? event) === canvasCancellationRef.current');
    expect(gestureSource).toContain('gesture.points.size === 2');
  });

  it("distinguishes only the active internal handoff from real cancellation and cleans up on failure", () => {
    const event = { type: "pointercancel", pointerId: 1 };
    const osCancel = { type: "pointercancel", pointerId: 1 };
    expect(isPointerHandoff(event)).toBe(false);
    expect(() => dispatchPointerHandoff({ dispatchEvent(delivered) {
      expect(delivered).toBe(event);
      expect(isPointerHandoff(delivered)).toBe(true);
      expect(isPointerHandoff({ nativeEvent: delivered })).toBe(true);
      expect(isPointerHandoff(osCancel)).toBe(false);
      throw new Error("Dispatch failed");
    } }, event)).toThrow("Dispatch failed");
    expect(isPointerHandoff(event)).toBe(false);
  });

  it("ensures mobile CSS docks tools above panels even when only one panel is expanded", () => {
    const css = (readFileSync("src/canvas/components/editor_mobile_layout.css", "utf8") + readFileSync("src/canvas/components/editor_compact_layout.css", "utf8"));
    expect(css).toContain('--editor-mobile-zoom-bottom: calc(45% + 0.25rem)');
    expect(css).toContain('bottom: var(--editor-mobile-zoom-bottom)');
    expect(css).toContain('bottom: calc(var(--editor-mobile-zoom-bottom) + 3.25rem + 0.5rem) !important');
    expect(css).toContain('[data-testid="design-editor"].editor-narrow[data-mobile-layers-expanded="true"]');
    expect(css).toContain('[data-testid="design-editor"].editor-narrow[data-mobile-properties-expanded="true"]');
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

  it("uses pointerdown for welcome composer popup dismiss and clamps panel safely", () => {
    const composer = readFileSync("src/canvas/components/welcome_dashboard/welcome_prompt_composer.jsx", "utf8");
    expect(composer).toContain('document.addEventListener("pointerdown", onPointerDown)');
    expect(composer).not.toContain('document.addEventListener("mousedown", onPointerDown)');
    expect(composer).toContain('panelHeight');
  });

  it("prevents iOS input focus auto-zoom and centers export modal on mobile screens", () => {
    const indexCss = readFileSync("src/index.css", "utf8");
    expect(indexCss).toContain("input:focus");
    expect(indexCss).toContain("font-size: 16px !important;");

    const exportDialog = readFileSync("src/canvas/components/editor_export_dialog.jsx", "utf8");
    expect(exportDialog).toContain("items-center justify-center sm:items-start sm:justify-end");

    const tabBar = readFileSync("src/canvas/components/canvas_tab_bar.jsx", "utf8");
    expect(tabBar).toContain("left-1/2 w-[min(22rem,calc(100vw-1rem))] -translate-x-1/2");
  });

  it("protects canvas text overlay from font-size tampering and enables mobile canvas blur", () => {
    const indexCss = readFileSync("src/index.css", "utf8");
    expect(indexCss).toContain("textarea:not([data-canvas-text-overlay]):focus");

    const textOverlay = readFileSync("src/canvas/components/editor_text_overlay.jsx", "utf8");
    expect(textOverlay).toContain('data-canvas-text-overlay="true"');

    const gestureHook = readFileSync(
      "src/canvas/components/editor_hooks/use_editor_canvas_gestures.js",
      "utf8",
    );
    expect(gestureHook).toContain('document.activeElement?.hasAttribute?.("data-canvas-text-overlay")');
    expect(gestureHook).toContain("document.activeElement.blur()");
  });

  it("inverts page switcher expansion downwards and expands taskbar touch targets on small screens", () => {
    const navCss = readFileSync("src/canvas/components/editor_mobile_navigation.css", "utf8");
    expect(navCss).toContain("flex-direction: column-reverse");

    const compactLayout = readFileSync("src/canvas/components/editor_compact_layout.css", "utf8");
    expect(compactLayout).toContain('[data-testid="editor-contextual-taskbar"] button::before');
    expect(compactLayout).toContain("width: 44px");
    expect(compactLayout).toContain("height: 44px");
  });

  it("cancels toolbar long press on touch scroll movement and preserves layer vertical touch scroll", () => {
    const familyMenu = readFileSync("src/canvas/components/editor_family_menu.jsx", "utf8");
    expect(familyMenu).toContain("onPointerMoveCapture");
    expect(familyMenu).toContain("Math.hypot(dx, dy) > 8");

    const selectMenu = readFileSync("src/canvas/components/editor_select_menu.jsx", "utf8");
    expect(selectMenu).toContain("onPointerMoveCapture");
    expect(selectMenu).toContain("Math.hypot(dx, dy) > 8");

    const layerRow = readFileSync("src/canvas/components/editor_layer_row.jsx", "utf8");
    expect(layerRow).toContain("touch-pan-y");
  });

  it("scales export modal and tab bar close buttons for touch and adapts autolayout inspector", () => {
    const exportDialog = readFileSync("src/canvas/components/editor_export_dialog.jsx", "utf8");
    expect(exportDialog).toContain("[@media(pointer:coarse)]:min-h-[44px]");

    const tabBar = readFileSync("src/canvas/components/canvas_tab_bar.jsx", "utf8");
    expect(tabBar).toContain("[@media(pointer:coarse)]:min-w-[40px]");
    expect(tabBar).toContain("e.stopPropagation()");

    const swatch = readFileSync("src/canvas/components/editor_properties/colour_swatch.jsx", "utf8");
    expect(swatch).toContain("const isMobile = window.innerWidth <= 768");
    expect(swatch).toContain("[@media(pointer:coarse)]:h-8");

    const inspectorCss = readFileSync("src/canvas/components/editor_mobile_inspector.css", "utf8");
    expect(inspectorCss).toContain("[data-autolayout-align-row]");
    expect(inspectorCss).toContain("[data-autolayout-paired-padding]");
  });
});
