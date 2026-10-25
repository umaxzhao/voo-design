// The fill/stroke colour picker: model dropdown, opacity, blend mode, eyedropper
// state and document colours; and the row changes that go with them.
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import FigmaColorPicker from "../../src/canvas/color_picker/FigmaColorPicker.jsx";
import { ColorModelInputs } from "../../src/canvas/color_picker/ColorModelInputs.jsx";
import { DocumentColoursContext } from "../../src/canvas/color_picker/document_colours_context.js";
import {
  hslToRgb,
  parseCssColour,
  rgbToHsl,
} from "../../src/canvas/color_picker/color_models.js";
import {
  opacityPatch,
  parseOpacityInput,
} from "../../src/canvas/color_picker/opacity_patch.js";
import extendedEnglish from "../../src/shared/i18n/extended-en.js";
import extendedChinese from "../../src/shared/i18n/extended-zh.js";
import { BLEND_MODES } from "../../src/canvas/editor/scene_model.js";
import { FillSection } from "../../src/canvas/components/editor_properties/colour_fill_section.jsx";
import { StrokeSection } from "../../src/canvas/components/editor_properties/colour_stroke_section.jsx";

const noop = () => {};
/** Path data of the half-filled circle icon that used to precede the % field. */
const OPACITY_ICON_PATH = "M12 4A8 8 0 0 0 12 20Z";

/** The test locale has no dictionary loaded; swap keys for their English text. */
const english = (html) => html.replace(/editor\.[\w.]+/g, (key) => extendedEnglish[key] ?? key);

const picker = (props = {}) =>
  english(renderToStaticMarkup(<FigmaColorPicker color="#FF0000" onChange={noop} {...props} />));

afterEach(() => {
  delete globalThis.window.EyeDropper;
});

describe("row opacity field", () => {
  it("shows no icon in the fill row, but keeps the number and the % suffix", () => {
    const html = renderToStaticMarkup(
      <FillSection object={{ kind: "rect", fill: "#ff0000", fillOpacity: 0.4 }} edit={noop} editAndCommit={noop} />,
    );
    expect(html).not.toContain(OPACITY_ICON_PATH);
    expect(html).toContain(">40</button>");
    expect(html).toContain(">%</span>");
  });

  it("shows no icon in the stroke row either", () => {
    const html = renderToStaticMarkup(
      <StrokeSection object={{ kind: "rect", stroke: "#00ff00", strokeOpacity: 0.5 }} edit={noop} editAndCommit={noop} />,
    );
    expect(html).not.toContain(OPACITY_ICON_PATH);
    expect(html).toContain(">50</button>");
  });
});

describe("blend mode placement", () => {
  it("is no longer rendered in the fill row", () => {
    const html = renderToStaticMarkup(
      <FillSection object={{ kind: "rect", fill: "#ff0000", fillBlendMode: "multiply" }} edit={noop} editAndCommit={noop} />,
    );
    expect(html).not.toContain("Fill blend mode");
    expect(html).not.toContain("<select");
  });

  it("lists every BLEND_MODES entry in the picker, with source-over labelled Normal", () => {
    const html = picker({ blendMode: "source-over", onBlendModeChange: noop });
    expect(html).toContain('data-testid="picker-blend-mode"');
    expect(html).toContain('<option value="source-over" class="bg-neutral-900" selected="">Normal</option>');
    for (const mode of BLEND_MODES) expect(html).toContain(`value="${mode}"`);
    expect(html.match(/<option value="[a-z-]+" class="bg-neutral-900"[^>]*>(?!RGB|HEX|CSS|HSL|HSB)/g)).toHaveLength(BLEND_MODES.length);
  });

  it("selects the layer's current mode, and is hidden when no blend binding is given", () => {
    expect(picker({ blendMode: "multiply", onBlendModeChange: noop })).toContain('value="multiply" class="bg-neutral-900" selected=""');
    expect(picker()).not.toContain("picker-blend-mode");
  });
});

describe("colour model dropdown", () => {
  it("offers RGB, HEX, CSS, HSL and HSB", () => {
    const html = picker();
    expect(html).toContain('data-testid="colour-model-select"');
    const select = html.match(/data-testid="colour-model-select".*?<\/select>/s)[0];
    const options = [...select.matchAll(/<option value="([A-Z]+)"/g)].map((m) => m[1]);
    expect(options).toEqual(["RGB", "HEX", "CSS", "HSL", "HSB"]);
    // HEX stays the default model.
    expect(select).toContain('value="HEX" class="bg-neutral-900" selected=""');
  });

  it("shows different inputs after switching to HSL", () => {
    const props = { hex: "#FF0000", hsv: { h: 0, s: 100, v: 100 }, onChangeHex: noop, onChangeHsv: noop };
    const hexHtml = renderToStaticMarkup(<ColorModelInputs {...props} defaultModel="HEX" />);
    const hslHtml = renderToStaticMarkup(<ColorModelInputs {...props} defaultModel="HSL" />);
    expect(hexHtml).toContain('type="text"');
    expect(hexHtml).not.toContain('type="number"');
    expect(hslHtml).not.toContain('type="text"');
    expect(hslHtml.match(/type="number"/g)).toHaveLength(3);
    // Pure red in HSL is 0, 100, 50.
    expect([...hslHtml.matchAll(/type="number"[^>]*value="(\d+)"/g)].map((m) => m[1])).toEqual(["0", "100", "50"]);
    const cssHtml = renderToStaticMarkup(<ColorModelInputs {...props} defaultModel="CSS" />);
    expect(cssHtml).toContain('value="rgb(255, 0, 0)"');
  });

  it("converts between models without drifting", () => {
    expect(rgbToHsl({ r: 51, g: 102, b: 204 })).toEqual({ h: 220, s: 60, l: 50 });
    expect(hslToRgb({ h: 220, s: 60, l: 50 })).toEqual({ r: 51, g: 102, b: 204 });
    expect(parseCssColour("rgb(255, 0, 0)")).toBe("#FF0000");
    expect(parseCssColour("hsl(120 100% 25%)")).toBe("#008000");
    expect(parseCssColour("#0f0")).toBe("#00FF00");
    expect(parseCssColour("not a colour")).toBeNull();
  });
});

describe("opacity shared by the row and the picker", () => {
  it("uses one write path, so both fields hold the same value after an edit", () => {
    const edits = [];
    const row = (val) => edits.push(opacityPatch("fillOpacity", val));
    const pickerField = (text) => edits.push(opacityPatch("fillOpacity", parseOpacityInput(text)));
    row(40);
    pickerField("40");
    expect(edits[1]).toEqual(edits[0]);
    expect(edits[0]).toEqual({ fillOpacity: 0.4 });
    // Out-of-range typing clamps identically; junk is rejected, not applied.
    expect(parseOpacityInput("250")).toBe(100);
    expect(parseOpacityInput("-5")).toBe(0);
    expect(parseOpacityInput("")).toBeNull();
    expect(parseOpacityInput("abc")).toBeNull();
  });

  it("renders the same number in the row field and the picker field", () => {
    const rowHtml = renderToStaticMarkup(
      <FillSection object={{ kind: "rect", fill: "#ff0000", fillOpacity: 0.4 }} edit={noop} editAndCommit={noop} />,
    );
    const pickerHtml = picker({ opacity: 40, onOpacityChange: noop });
    expect(rowHtml).toContain(">40</button>");
    expect(pickerHtml).toMatch(/data-testid="picker-opacity-input"[^>]*value="40"/);
  });

  it("hides the picker opacity field when nothing binds it", () => {
    expect(picker()).not.toContain("picker-opacity-input");
  });
});

describe("eyedropper", () => {
  it("is shown disabled with an explanatory title when window.EyeDropper is absent", () => {
    delete globalThis.window.EyeDropper;
    const html = picker();
    const button = html.match(/<button[^>]*data-testid="picker-eyedropper"[^>]*>/)[0];
    expect(button).toContain('disabled=""');
    expect(button).toContain('title="Eyedropper is not available in this browser"');
  });

  it("is enabled when the native EyeDropper exists", () => {
    globalThis.window.EyeDropper = class EyeDropper {};
    const button = picker().match(/<button[^>]*data-testid="picker-eyedropper"[^>]*>/)[0];
    expect(button).not.toContain('disabled=""');
  });
});

describe("document colours", () => {
  it("shows the empty-state text when the document has no colour variables", () => {
    const html = picker();
    expect(html).toContain('data-testid="picker-document-colours"');
    expect(html).toContain("No document colours yet");
  });

  it("lists the document's colour variables as swatches", () => {
    const variables = [
      { id: "v1", name: "Brand", value: "#3366FF" },
      { id: "v2", name: "Accent", value: "#FF8800" },
    ];
    const html = renderToStaticMarkup(
      <DocumentColoursContext.Provider value={variables}>
        <FigmaColorPicker color="#FF0000" onChange={noop} />
      </DocumentColoursContext.Provider>,
    );
    expect(html).not.toContain("No document colours yet");
    expect(html).toContain('title="Brand #3366FF"');
    expect(html).toContain('title="Accent #FF8800"');
  });
});

describe("picker strings", () => {
  const keys = [
    "editor.colorPicker.colourModel",
    "editor.colorPicker.cssValue",
    "editor.colorPicker.channel",
    "editor.colorPicker.opacity",
    "editor.colorPicker.blendMode",
    "editor.colorPicker.blendNormal",
    "editor.colorPicker.eyedropperUnavailable",
    "editor.colorPicker.documentColours",
    "editor.colorPicker.noDocumentColours",
  ];

  it("exist in both the English and the Chinese dictionaries", () => {
    for (const key of keys) {
      expect(extendedEnglish[key], key).toBeTruthy();
      expect(extendedChinese[key], key).toBeTruthy();
    }
    expect(extendedEnglish["editor.colorPicker.blendNormal"]).toBe("Normal");
  });
});
