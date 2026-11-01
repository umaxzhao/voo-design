import { describe, expect, it, vi } from "vitest";
import { figmaMessageToPages } from "../../../src/canvas/figma/figma-to-voo.js";
import { textStyleOf } from "../../../src/canvas/figma/figma-text.js";
import { measureText } from "../../../src/canvas/editor/text_metrics.js";
import { createDocument, serialiseDocument, deserialiseDocument } from "../../../src/canvas/editor/scene_model.js";
import { mixedNativeText } from "./testing/native-text.js";
import { textElement } from "../../../src/canvas/editor/editor_svg_text.js";
import { requiresCanvas2dMediaFallback } from "../../../src/canvas/editor/skia_scene_adapter.js";
import { expandInstances } from "../../../src/canvas/figma/figma-instances.js";
import { paintImportedText } from "../../../src/canvas/editor/render-imported-text.js";

const node = () => figmaMessageToPages(mixedNativeText()).pages[0].nodes[0];
const context = () => ({ save() {}, restore() {}, measureText: vi.fn(() => ({ width: 999 })) });

describe("native Figma typography fidelity", () => {
  it("treats RAW line height as an em ratio rather than pixels", () => {
    expect(textStyleOf({ lineHeight: { units: "RAW", value: 1.2 } }, 64).lineHeight).toBe(1.2);
  });

  it("retains editable mixed-size text and its native glyph appearance", () => {
    const text = node();
    expect(text.kind).toBe("text");
    expect(text.text).toBe("A\nB");
    expect(text.fontSize).toBe(64);
    expect(text.figmaText?.path).toBe("M0 36 L18 0 L36 36 Z M0 112 L32 48 L64 112 Z");
    expect(text.figmaText?.textData.styleOverrideTable).toEqual([{ styleID: 5, fontSize: 36 }]);
  });

  it("uses the original layout without any replacement-font measurement", () => {
    const ctx = context();
    expect(measureText(ctx, node())).toEqual({ width: 258, height: 126 });
    expect(ctx.measureText).not.toHaveBeenCalled();
  });

  it("falls back to editable layout after content or typography changes", () => {
    const text = node();
    for (const patch of [{ text: "Changed" }, { fontSize: 24 }, { fontFamily: "Arial" }, { boxWidth: 100 }]) {
      const ctx = context();
      measureText(ctx, { ...text, ...patch });
      expect(ctx.measureText).toHaveBeenCalled();
    }
  });

  it("retains the original appearance through portable document serialization", () => {
    const text = node();
    const restored = deserialiseDocument(serialiseDocument({ ...createDocument(400, 200), nodes: [text] }));
    expect(restored.nodes[0].figmaText).toEqual(text.figmaText);
    const ctx = context();
    expect(measureText(ctx, restored.nodes[0])).toEqual({ width: 258, height: 126 });
    expect(ctx.measureText).not.toHaveBeenCalled();
  });

  it("rejects incomplete glyph data instead of caching partial text", () => {
    const message = mixedNativeText();
    message.nodeChanges[1].derivedTextData.glyphs[1].commandsBlob = 99;
    const text = figmaMessageToPages(message).pages[0].nodes[0];
    expect(text.figmaText).toBeUndefined();
    expect(text.kind).toBe("text");
  });

  it("keeps unsupported native decorations on editable rendering", () => {
    const message = mixedNativeText();
    message.nodeChanges[1].textDecoration = "UNDERLINE";
    const text = figmaMessageToPages(message).pages[0].nodes[0];
    expect(text.figmaText).toBeUndefined();
    expect(text.underline).toBe(true);
  });

  it("uses the same outlines in SVG and routes unsupported Skia text through Canvas2D", () => {
    const text = node();
    expect(textElement(text)).toContain(`<path d="${text.figmaText.path}"`);
    expect(textElement(text)).toContain("<title>A\nB</title>");
    expect(textElement({ ...text, stroke: "#000000", strokeWidth: 2, strokeOpacity: 0.25 }))
      .toContain('stroke-opacity="0.25"');
    expect(requiresCanvas2dMediaFallback({ nodes: [text] })).toBe(true);
    expect(requiresCanvas2dMediaFallback({ nodes: [{ ...text, text: "Changed" }] })).toBe(false);
  });

  it("parses one reusable path across repaint, movement and recoloring", () => {
    const construct = vi.fn();
    vi.stubGlobal("Path2D", class { constructor(path) { construct(path); } });
    try {
      const text = node();
      const ctx = { save() {}, restore() {}, translate() {}, scale() {}, fill: vi.fn() };
      expect(paintImportedText(ctx, text)).toBe(true);
      expect(paintImportedText(ctx, { ...text, x: 100, fill: "#00ff00" })).toBe(true);
      expect(construct).toHaveBeenCalledTimes(1);
      expect(ctx.fill.mock.calls[0][0]).toBe(ctx.fill.mock.calls[1][0]);
      expect(paintImportedText(ctx, { ...text, text: "Changed" })).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });

  it("does not reuse master glyphs for changed instance text", () => {
    const message = mixedNativeText();
    const text = message.nodeChanges[1];
    const masterId = { sessionID: 0, localID: 9 };
    text.parentIndex.guid = masterId;
    const instance = { guid: { sessionID: 0, localID: 10 }, type: "INSTANCE",
      symbolData: { symbolID: masterId, symbolOverrides: [{ guidPath: { guids: [text.guid] }, textData: { characters: "Changed" } }] } };
    const changes = [...message.nodeChanges, { guid: masterId, type: "SYMBOL" }, instance];
    const clone = expandInstances(changes).find(n => n.type === "TEXT" && n.guid.sessionID !== 0);
    expect(clone.textData.characters).toBe("Changed");
    expect(clone.derivedTextData).toBeUndefined();
    instance.derivedSymbolData = [{ guidPath: { guids: [text.guid] }, derivedTextData: text.derivedTextData, size: { x: 300, y: 150 } }];
    const replaced = expandInstances(changes).find(n => n.type === "TEXT" && n.guid.sessionID !== 0);
    expect(replaced.derivedTextData).toBe(text.derivedTextData);
    expect(replaced.size).toEqual({ x: 300, y: 150 });
  });
});
