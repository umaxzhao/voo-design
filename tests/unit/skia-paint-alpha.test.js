import { describe, expect, it, vi } from "vitest";
import { SkiaScenePainter } from "../../vendor/voo-canvas-core/dist/lib/skia/skia-scene-painter.js";
import { parseSkiaColor } from "../../vendor/voo-canvas-core/dist/lib/skia/skia-scene-draw.js";
import { strokeOf } from "../../src/canvas/editor/skia_adapter_paint.js";

function fixture() {
  const blendPaint = { setBlendMode: vi.fn(), setAlphaf: vi.fn() };
  const painter = Object.assign(Object.create(SkiaScenePainter.prototype), {
    canvasKit: { BlendMode: { SrcOver: "normal", Multiply: "multiply" } },
    blendPaint,
    drawTransformedElement: vi.fn(),
  });
  const canvas = { saveLayer: vi.fn(), restore: vi.fn() };
  const element = { kind: "node", opacity: 0.5,
    fills: [{ color: "#0000ff", opacity: 0.5 }],
    stroke: { color: "#ff0000", opacity: 0.5, width: 10 } };
  return { painter, canvas, element, blendPaint };
}

describe("Skia layer alpha", () => {
  it.each([0, 0.25, 0.5])("composites the complete paint stack once at opacity %s", opacity => {
    const { painter, canvas, element, blendPaint } = fixture();
    element.opacity = opacity;
    painter.drawElementWithBlendMode(canvas, element);
    expect(canvas.saveLayer).toHaveBeenCalledWith(blendPaint);
    expect(blendPaint.setAlphaf).toHaveBeenNthCalledWith(1, opacity);
    const projected = painter.drawTransformedElement.mock.calls[0][1];
    expect(projected).toEqual({ ...element, opacity: 1 });
    expect(projected.fills).toBe(element.fills);
    expect(projected.stroke).toBe(element.stroke);
    expect(element.opacity).toBe(opacity);
    expect(canvas.restore).toHaveBeenCalledOnce();
    expect(blendPaint.setAlphaf).toHaveBeenLastCalledWith(1);
  });

  it("keeps opaque paint stacks on the direct path", () => {
    const { painter, canvas, element } = fixture();
    element.opacity = 1;
    painter.drawElementWithBlendMode(canvas, element);
    expect(canvas.saveLayer).not.toHaveBeenCalled();
    expect(painter.drawTransformedElement).toHaveBeenCalledWith(canvas, element);
  });

  it("combines layer alpha with its blend mode on one saveLayer", () => {
    const { painter, canvas, element, blendPaint } = fixture();
    painter.drawElementWithBlendMode(canvas, { ...element, blendMode: "multiply" });
    expect(canvas.saveLayer).toHaveBeenCalledOnce();
    expect(blendPaint.setBlendMode).toHaveBeenCalledWith("multiply");
    expect(blendPaint.setAlphaf).toHaveBeenNthCalledWith(1, 0.5);
    expect(painter.drawTransformedElement.mock.calls[0][1].opacity).toBe(1);
    expect(blendPaint.setBlendMode).toHaveBeenLastCalledWith("normal");
  });

  it("restores the layer and shared paint after a draw error", () => {
    const { painter, canvas, element, blendPaint } = fixture();
    painter.drawTransformedElement.mockImplementation(() => { throw new Error("paint failed"); });
    expect(() => painter.drawElementWithBlendMode(canvas, element)).toThrow("paint failed");
    expect(canvas.restore).toHaveBeenCalledOnce();
    expect(blendPaint.setAlphaf).toHaveBeenLastCalledWith(1);
    expect(blendPaint.setBlendMode).toHaveBeenLastCalledWith("normal");
  });
});

describe("Skia source color alpha", () => {
  it.each([[0, 0.5, 0], [0.5, 0.5, 0.25], [1, 0.5, 0.5]])(
    "multiplies color alpha %s by paint opacity %s", (colorAlpha, opacity, expected) => {
      const painter = Object.create(SkiaScenePainter.prototype);
      painter.canvasKit = { parseColorString: () => [1, 0, 0, colorAlpha], PaintStyle: { Fill: 0 } };
      const paint = { setAntiAlias() {}, setColor() {}, setAlphaf: vi.fn(), setStyle() {}, setStrokeWidth() {} };
      painter.configurePaint(paint, "#ff000080", opacity, false, 0);
      expect(paint.setAlphaf).toHaveBeenCalledWith(expected);
    });

  it("does not inherit layer opacity as a missing stroke paint opacity", () => {
    expect(strokeOf({ kind: "rect", opacity: 0.5, stroke: "#ff0000", strokeWidth: 10 }).opacity).toBe(1);
    expect(strokeOf({ kind: "rect", opacity: 0.5, strokeOpacity: 0.25, stroke: "#ff0000", strokeWidth: 10 }).opacity).toBe(0.25);
  });
});

 it("normalizes the CSS transparent keyword without changing other color syntax", () => {
   const canvasKit = { parseColorString: vi.fn(color => color) };
   expect(parseSkiaColor(canvasKit, "Transparent")).toBe("#00000000");
   expect(parseSkiaColor(canvasKit, "#ff000080")).toBe("#ff000080");
   expect(parseSkiaColor(canvasKit, "rgba(255,0,0,0.5)")).toBe("rgba(255,0,0,0.5)");
 });
