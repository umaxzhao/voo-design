import { describe, expect, it } from "vitest";
import {
  PenImportError,
  parsePenDocument,
  penVersionOf,
} from "../../src/canvas/pen/pen_document.js";
import { estimateTextSize, penDocumentToVooFile } from "../../src/canvas/pen/pen_to_voo.js";
import { penBytesToVooFile } from "../../src/canvas/pen/pen_import_client.js";
import {
  collectPenAssetRefs,
  resolvePenAssets,
} from "../../src/canvas/pen/pen_assets.js";
import {
  isPenFileName,
  replaceDocumentExtension,
  saveFormatOf,
} from "../../src/canvas/store/save_formats.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_doc_factory.js";
import { isValidVooFile } from "../../electron/voo_format.js";
import { openVooProject } from "../../src/canvas/store/project_io.js";

/** A 1×1 transparent PNG, used as an inline image fill. */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PNG_BYTES = Uint8Array.from(
  Buffer.from(TINY_PNG.split(",")[1], "base64"),
);

/**
 * A Pen document exercising the mapping:
 *  - a vertical flex screen with padding/gap/centre alignment and variables,
 *  - a gradient rectangle with stroke/radius, a fixed-width text, an ellipse,
 *  - a path with SVG geometry, an absolute group, a ref-expanded component,
 *  - a script (unsupported) and an icon (approximated),
 *  - a data-URL image fill.
 */
function sampleDocument() {
  return {
    version: "2.20",
    themes: { Mode: ["Light", "Dark"] },
    variables: {
      "--bg": {
        type: "color",
        value: [{ value: "#FFFFFF" }, { value: "#111111", theme: { Mode: "Dark" } }],
      },
      "--text": {
        type: "color",
        value: [{ value: "#222222" }, { value: "#EEEEEE", theme: { Mode: "Dark" } }],
      },
      "--pad": { type: "number", value: 16 },
    },
    children: [
      {
        type: "frame",
        id: "screen",
        name: "Screen",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        layout: "vertical",
        gap: 12,
        padding: ["$--pad", "$--pad"],
        alignItems: "center",
        fill: "$--bg",
        children: [
          {
            type: "rectangle",
            id: "card",
            name: "Card",
            width: "fill_container",
            height: 120,
            fill: {
              type: "gradient",
              gradientType: "linear",
              rotation: 90,
              colors: [
                { color: "#ff0000", position: 0 },
                { color: "#0000ff", position: 1 },
              ],
            },
            stroke: "#111111",
            strokeWidth: 2,
            cornerRadius: 8,
          },
          {
            type: "text",
            id: "title",
            name: "Title",
            content: "Hello",
            fill: "$--text",
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
            textGrowth: "fixed-width",
            width: "fill_container",
          },
          {
            type: "ellipse",
            id: "dot",
            name: "Dot",
            width: 20,
            height: 20,
            fill: "#00ff00",
            opacity: 0.5,
            effect: [
              {
                type: "shadow",
                shadowType: "outer",
                offset: { x: 0, y: 2 },
                blur: 4,
                color: "#00000080",
              },
              { type: "blur", radius: 3 },
            ],
          },
          {
            type: "path",
            id: "arrow",
            name: "Arrow",
            width: 24,
            height: 24,
            geometry: "M0 0L24 0L24 24Z",
            fill: "#333333",
          },
          {
            type: "group",
            id: "badge",
            name: "Badge",
            x: 0,
            y: 0,
            width: 40,
            height: 40,
            children: [
              {
                type: "rectangle",
                id: "badge-rect",
                name: "Badge Rect",
                x: 10,
                y: 10,
                width: 30,
                height: 30,
                fill: "#00ff00",
              },
            ],
          },
          { type: "ref", id: "instance", ref: "component", x: 0, y: 0 },
          {
            type: "script",
            id: "script-1",
            name: "Generated",
            width: 10,
            height: 10,
            scriptUri: "./gen.js",
          },
          {
            type: "icon",
            id: "icon-1",
            name: "Star",
            icon: "star",
            library: "lucide",
            width: 16,
            height: 16,
            fill: "#999999",
          },
          {
            type: "rectangle",
            id: "photo",
            name: "Photo",
            x: 0,
            y: 0,
            width: 40,
            height: 20,
            fill: { type: "image", url: TINY_PNG },
          },
          {
            type: "browser",
            id: "browser-1",
            name: "Live Page",
            width: 10,
            height: 10,
            url: "https://example.com",
          },
          {
            type: "rectangle",
            id: "shader-fill",
            name: "Shader Fill",
            width: 10,
            height: 10,
            fill: { type: "shader", url: "./fx.glsl" },
          },
        ],
      },
      {
        type: "frame",
        id: "component",
        name: "Component",
        x: 500,
        y: 0,
        width: 100,
        height: 40,
        fill: "#EEEEEE",
        children: [
          {
            type: "text",
            id: "component-label",
            name: "Label",
            content: "Btn",
            fontFamily: "Pen Custom Sans",
            fontSize: 14,
            fill: "#000000",
          },
        ],
      },
    ],
  };
}

function nodesOf(result) {
  return result.vooFile.document.nodes;
}

function named(result, name) {
  return nodesOf(result).find((node) => node.name === name);
}

describe("pen document parsing", () => {
  it("reads a well-formed 2.x document, from text, bytes or an object", () => {
    const document = sampleDocument();
    const fromObject = parsePenDocument(document);
    expect(fromObject.version).toBe("2.20");
    expect(fromObject.document.children).toHaveLength(2);

    const text = JSON.stringify(document);
    const fromText = parsePenDocument(text);
    expect(fromText.document.children[0].id).toBe("screen");

    const fromBytes = parsePenDocument(new TextEncoder().encode(text));
    expect(fromBytes.document.children).toHaveLength(2);
  });

  it("rejects a file that is not JSON with a clear error", () => {
    expect(() => parsePenDocument("{ not json")).toThrow(PenImportError);
    try {
      parsePenDocument("{ not json");
    } catch (error) {
      expect(error.code).toBe("pen-invalid-json");
      expect(error.message).toMatch(/not valid JSON/i);
    }
  });

  it("rejects JSON that is not a Pen document", () => {
    expect(() => parsePenDocument("[]")).toThrow(PenImportError);
    expect(() => parsePenDocument({ version: "2.20" })).toThrow(PenImportError);
    try {
      parsePenDocument({ version: "2.20" });
    } catch (error) {
      expect(error.code).toBe("pen-invalid-document");
      expect(error.message).toMatch(/children/i);
    }
  });

  it("refuses a Pen version it cannot read instead of guessing", () => {
    try {
      parsePenDocument({ version: "3.0", children: [] });
      throw new Error("expected a PenImportError");
    } catch (error) {
      expect(error).toBeInstanceOf(PenImportError);
      expect(error.code).toBe("pen-unsupported-version");
      expect(error.message).toContain("3.0");
    }
    expect(penVersionOf({ version: "2.6" })).toBe("2.6");
    expect(penVersionOf({ version: "banana" })).toBeNull();
  });

  it("drops malformed layers with warnings instead of failing the file", () => {
    const parsed = parsePenDocument({
      version: "2.20",
      children: [null, { type: 42 }, { type: "rectangle", width: 10 }],
    });
    expect(parsed.document.children).toHaveLength(1);
    expect(parsed.warnings.map((warning) => warning.message)).toEqual(
      expect.arrayContaining(["layer-not-an-object", "layer-missing-type"]),
    );
  });
});

describe("pen → voo conversion", () => {
  function convert(document = sampleDocument()) {
    return penDocumentToVooFile(document, { pageLabel: "Screen" });
  }

  it("produces a valid v1 .voo envelope with one page", () => {
    const result = convert();
    expect(isValidVooFile(result.vooFile)).toBe(true);
    expect(result.vooFile.version).toBe(1);
    expect(result.vooFile.document.nodes.length).toBeGreaterThan(10);
    expect(result.vooFile.document.width).toBe(600);
    expect(result.vooFile.document.height).toBe(300);
    expect(result.vooFile.document.label).toBe("Screen");
    expect(result.layerCount).toBe(result.vooFile.document.nodes.length);
  });

  it("keeps the parent tree intact and paints bottom-first", () => {
    const nodes = nodesOf(convert());
    const ids = new Set(nodes.map((node) => node.id));
    for (const node of nodes) {
      if (node.parentId) expect(ids.has(node.parentId)).toBe(true);
    }
    const cardIndex = nodes.findIndex((node) => node.name === "Card");
    const titleIndex = nodes.findIndex((node) => node.name === "Title");
    const dotIndex = nodes.findIndex((node) => node.name === "Dot");
    expect(cardIndex).toBeLessThan(titleIndex);
    expect(titleIndex).toBeLessThan(dotIndex);

    const screen = nodes.find((node) => node.kind === NODE_KIND.GROUP && node.name === "Screen");
    expect(screen).toBeTruthy();
    expect(nodes.find((node) => node.name === "Card").parentId).toBe(screen.id);
    expect(nodes.find((node) => node.name === "Title").parentId).toBe(screen.id);
  });

  it("resolves variables and themes to static values", () => {
    const nodes = nodesOf(convert());
    const frameFill = nodes.find((node) => node.name === "Screen fill");
    expect(frameFill.fill).toBe("#FFFFFF");
    expect(named(convert(), "Title").fill).toBe("#222222");
  });

  it("maps a flex frame, its padding/gap/align and its children's boxes", () => {
    const result = convert();
    const screen = named(result, "Screen");
    expect(screen.kind).toBe(NODE_KIND.GROUP);
    expect(screen.autoLayout).toMatchObject({
      direction: "vertical",
      gap: 12,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      alignItems: "center",
      justifyContent: "start",
      widthMode: "fixed",
      heightMode: "fixed",
    });

    const card = named(result, "Card");
    expect(card.kind).toBe(NODE_KIND.RECT);
    expect(card.x).toBe(16);
    expect(card.y).toBe(16);
    expect(card.width).toBe(368);
    expect(card.height).toBe(120);
    expect(card.cornerRadius).toBe(8);
    expect(card.stroke).toBe("#111111");
    expect(card.strokeWidth).toBe(2);

    const title = named(result, "Title");
    expect(title.kind).toBe(NODE_KIND.TEXT);
    expect(title.x).toBe(16);
    expect(title.y).toBe(148);
    expect(title.text).toBe("Hello");
    expect(title.fontSize).toBe(24);
    expect(title.fontWeight).toBe("700");
    expect(title.align).toBe("center");
    expect(title.boxWidth).toBe(368);
    expect(title.layoutWidth).toBe("fill");

    const dot = named(result, "Dot");
    expect(dot.kind).toBe(NODE_KIND.ELLIPSE);
    expect(dot.x).toBe(190);
    expect(dot.y).toBe(190);
    expect(dot.fill).toBe("#00ff00");
    expect(dot.opacity).toBe(0.5);
    expect(dot.layerBlur).toBe(3);
    expect(dot.effects.shadow).toMatchObject({
      enabled: true,
      blur: 4,
      offsetX: 0,
      offsetY: 2,
      opacity: 50,
    });
  });

  it("maps fills, strokes and gradients", () => {
    const card = named(convert(), "Card");
    expect(card.fill).toBe("linear-gradient(270deg, #FF0000 0%, #0000FF 100%)");
    const dot = named(convert(), "Dot");
    expect(dot.fill).toBe("#00ff00");
    expect(dot.strokeWidth).toBe(0);
  });

  it("maps a path's SVG geometry to an editable pen node", () => {
    const arrow = named(convert(), "Arrow");
    expect(arrow.kind).toBe(NODE_KIND.PATH);
    expect(arrow.pen).toBe(true);
    expect(arrow.fill).toBe("#333333");
    expect(arrow.points.length).toBeGreaterThanOrEqual(3);
    expect(arrow.points[arrow.points.length - 1].close).toBe(true);
  });

  it("maps a per-corner radius and a polygon", () => {
    const result = penDocumentToVooFile({
      version: "2.20",
      children: [
        {
          type: "frame",
          id: "page",
          width: 200,
          height: 200,
          layout: "none",
          children: [
            {
              type: "rectangle",
              id: "rounded",
              name: "Rounded",
              x: 10,
              y: 10,
              width: 50,
              height: 50,
              fill: "#123456",
              cornerRadius: [1, 2, 3, 4],
            },
            {
              type: "polygon",
              id: "star",
              name: "Triangle",
              x: 80,
              y: 10,
              width: 40,
              height: 40,
              polygonCount: 3,
              fill: "#abcdef",
            },
          ],
        },
      ],
    });
    const nodes = nodesOf(result);
    expect(nodes.find((node) => node.name === "Rounded").cornerRadius).toEqual({
      tl: 1,
      tr: 2,
      br: 3,
      bl: 4,
    });
    const triangle = nodes.find((node) => node.name === "Triangle");
    expect(triangle.kind).toBe(NODE_KIND.PATH);
    expect(triangle.points).toHaveLength(3);
    expect(triangle.fill).toBe("#abcdef");
  });

  it("keeps a group's absolute children under the group", () => {
    const result = convert();
    const badge = named(result, "Badge");
    const badgeRect = named(result, "Badge Rect");
    expect(badge.kind).toBe(NODE_KIND.GROUP);
    expect(badgeRect.parentId).toBe(badge.id);
    expect(badgeRect.x).toBe(badge.x + 10);
    expect(badgeRect.y).toBe(badge.y + 10);
  });

  it("expands a ref into an editable copy of the referenced subtree", () => {
    const result = convert();
    const label = named(result, "Label");
    expect(label).toBeTruthy();
    expect(label.text).toBe("Btn");
    // The component frame itself is still imported where it sat on the canvas.
    const components = nodesOf(result).filter((node) => node.name === "Component");
    expect(components.length).toBe(2);
  });

  it("warns about unsupported and approximated layers and keeps going", () => {
    const result = convert();
    const messages = result.warnings.map((warning) => warning.message);
    expect(messages).toContain("unsupported:script");
    expect(messages).toContain("unsupported:browser");
    expect(messages).toContain("unsupported-fill:shader");
    expect(messages).toContain("approximated:icon");
    expect(nodesOf(result).some((node) => node.name === "Generated")).toBe(false);
    expect(named(result, "Star").kind).toBe(NODE_KIND.RECT);
  });

  it("registers a data-URL image fill as an editor image asset", () => {
    const result = convert();
    const photo = named(result, "Photo");
    expect(photo.kind).toBe(NODE_KIND.IMAGE);
    expect(photo.imageId).toBeTruthy();
    expect(result.vooFile.images[photo.imageId]).toBe(TINY_PNG);
  });

  it("reports a missing image asset and keeps the layer box", () => {
    const document = {
      version: "2.20",
      children: [
        {
          type: "frame",
          id: "page",
          width: 100,
          height: 100,
          layout: "none",
          children: [
            {
              type: "rectangle",
              id: "missing",
              name: "Missing",
              x: 5,
              y: 5,
              width: 50,
              height: 50,
              fill: { type: "image", url: "./gone.png" },
            },
          ],
        },
      ],
    };
    const result = penDocumentToVooFile(document);
    const messages = result.warnings.map((warning) => warning.message);
    expect(messages).toContain("missing-asset:./gone.png");
    const node = nodesOf(result).find((entry) => entry.name === "Missing");
    expect(node).toBeTruthy();
    expect(node.x).toBe(5);
    expect(node.fill).toBe("transparent");
  });

  it("never throws on one malformed node", () => {
    const document = {
      version: "2.20",
      children: [
        {
          type: "frame",
          id: "page",
          width: 200,
          height: 200,
          layout: "none",
          children: [
            { type: "rectangle", id: "no-size", name: "No Size", x: 10, y: 10 },
            { type: "mystery", id: "unknown", name: "Unknown" },
            { type: "text", id: "empty-text", name: "Empty", content: "" },
          ],
        },
      ],
    };
    const result = penDocumentToVooFile(document);
    expect(isValidVooFile(result.vooFile)).toBe(true);
    expect(result.warnings.map((warning) => warning.message)).toContain(
      "unsupported:mystery",
    );
    expect(nodesOf(result).find((node) => node.name === "No Size")).toBeTruthy();
  });

  it("throws when a document has nothing importable", () => {
    expect(() =>
      penDocumentToVooFile({ version: "2.20", children: [] }),
    ).toThrow(PenImportError);
  });

  it("estimates text sizes deterministically for layout without a DOM", () => {
    const estimate = estimateTextSize({
      text: "Hello",
      fontSize: 20,
      lineHeight: 1.25,
      letterSpacing: 0,
      boxWidth: 0,
    });
    expect(estimate.width).toBeGreaterThan(0);
    expect(estimate.height).toBe(25);
  });
});

describe("pen import client", () => {
  it("parses, converts and reports fonts the editor does not ship", async () => {
    const result = await penBytesToVooFile(
      new TextEncoder().encode(JSON.stringify(sampleDocument())),
      { fileName: "sample.pen" },
    );
    expect(isValidVooFile(result.vooFile)).toBe(true);
    expect(result.layerCount).toBeGreaterThan(0);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.fonts.some((font) => font.family === "Pen Custom Sans")).toBe(true);
    expect(result.missingFonts.map((font) => font.family)).toContain("Pen Custom Sans");
  });

  it("resolves a relative sibling image through readSibling", async () => {
    const document = {
      version: "2.20",
      children: [
        {
          type: "frame",
          id: "page",
          width: 100,
          height: 100,
          layout: "none",
          children: [
            {
              type: "rectangle",
              id: "pic",
              name: "Pic",
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              fill: { type: "image", url: "./pic.png" },
            },
          ],
        },
      ],
    };
    const result = await penBytesToVooFile(
      new TextEncoder().encode(JSON.stringify(document)),
      {
        fileName: "doc.pen",
        readSibling: async (relative) =>
          relative === "pic.png" ? PNG_BYTES : null,
      },
    );
    const pic = result.vooFile.document.nodes.find((node) => node.name === "Pic");
    expect(pic.kind).toBe(NODE_KIND.IMAGE);
    expect(result.vooFile.images[pic.imageId]).toMatch(/^data:image\/png;base64,/);
    expect(
      result.warnings.map((warning) => warning.message).some((message) =>
        message.startsWith("missing-asset:"),
      ),
    ).toBe(false);
  });

  it("warns instead of guessing when a sibling cannot be read", async () => {
    const result = await penBytesToVooFile(
      new TextEncoder().encode(
        JSON.stringify({
          version: "2.20",
          children: [
            {
              type: "frame",
              id: "page",
              width: 10,
              height: 10,
              layout: "none",
              children: [
                {
                  type: "rectangle",
                  id: "pic",
                  width: 10,
                  height: 10,
                  fill: { type: "image", url: "./pic.png" },
                },
              ],
            },
          ],
        }),
      ),
      { fileName: "doc.pen" },
    );
    expect(result.warnings.map((warning) => warning.message)).toContain(
      "unresolved-asset:./pic.png",
    );
  });
});

describe("pen asset collection", () => {
  it("collects image, shader and script references once", () => {
    const refs = collectPenAssetRefs({
      children: [
        {
          type: "frame",
          children: [
            { type: "rectangle", fill: { type: "image", url: "./a.png" } },
            { type: "rectangle", fill: [{ type: "color", color: "#fff" }, { type: "image", url: "./a.png" }] },
            { type: "rectangle", fill: { type: "shader", url: "./fx.glsl" } },
            { type: "script", scriptUri: "./gen.js" },
          ],
        },
      ],
    });
    expect(refs).toEqual(
      expect.arrayContaining([
        { url: "./a.png", kind: "image" },
        { url: "./fx.glsl", kind: "shader" },
        { url: "./gen.js", kind: "script" },
      ]),
    );
    expect(refs.filter((ref) => ref.url === "./a.png")).toHaveLength(1);
  });

  it("never fetches network URLs and rejects paths escaping the document folder", async () => {
    const { assets, warnings } = await resolvePenAssets([
      { url: "https://example.com/x.png", kind: "image" },
      { url: "../secrets/key.png", kind: "image" },
      { url: "data:image/png;base64,AAAA", kind: "image" },
    ]);
    expect(assets.has("https://example.com/x.png")).toBe(false);
    expect(assets.get("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    const messages = warnings.map((warning) => warning.message);
    expect(messages).toContain("network-asset:https://example.com/x.png");
    expect(messages).toContain("unsafe-asset-path:../secrets/key.png");
  });
});

describe("pen save format", () => {
  it("recognises .pen names and saves them as .pen", () => {
    expect(isPenFileName("design.pen")).toBe(true);
    expect(isPenFileName("DESIGN.PEN")).toBe(true);
    expect(isPenFileName("design.voo")).toBe(false);
    expect(isPenFileName(undefined)).toBe(false);
    expect(saveFormatOf("design.pen")).toBe("pen");
    expect(saveFormatOf("design (Pen).pen")).toBe("pen");
    expect(replaceDocumentExtension("design (Pen).pen", ".voo")).toBe(
      "design (Pen).voo",
    );
  });
});

describe("openVooProject .pen wiring", () => {
  function penFile(name, document) {
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    return { name, arrayBuffer: async () => bytes.buffer };
  }

  const smallPen = {
    version: "2.20",
    children: [
      {
        type: "frame",
        id: "art",
        name: "Art",
        x: 0,
        y: 0,
        width: 320,
        height: 200,
        fill: "#FFFFFF",
        layout: "none",
        children: [
          {
            type: "text",
            id: "label",
            name: "Label",
            x: 20,
            y: 20,
            content: "Pen",
            fontSize: 20,
            fill: "#111111",
          },
        ],
      },
    ],
  };

  it("loads a .pen as a (Pen)-suffixed unsaved design and reports warnings", async () => {
    const calls = [];
    const store = {
      setDocumentLoading: (label) => calls.push(["loading", label]),
      loadVooProject: (payload) => calls.push(["load", payload]),
    };
    const result = await openVooProject({
      store,
      fileOrPath: penFile("demo.pen", smallPen),
    });

    expect(result.success).toBe(true);
    expect(result.fileName).toBe("demo (Pen).pen");
    expect(result.filePath).toBe(null);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(Array.isArray(result.missingFonts)).toBe(true);

    const load = calls.find(([kind]) => kind === "load")[1];
    expect(isValidVooFile(load.vooData)).toBe(true);
    expect(load.fileName).toBe("demo (Pen).pen");
    expect(load.filePath).toBe(null);
    expect(load.vooData.document.label).toBe("demo");
    const path = load.vooData.document.nodes.map((node) => node.name);
    expect(path).toContain("Art");
    // The overlay was lowered after the load completed.
    expect(calls.at(-1)).toEqual(["loading", null]);
  });

  it("surfaces a corrupt .pen as a clear error and still lifts the overlay", async () => {
    const calls = [];
    const store = {
      setDocumentLoading: (label) => calls.push(["loading", label]),
      loadVooProject: () => calls.push(["load"]),
    };
    const corruptBytes = new TextEncoder().encode("{ not json");
    await expect(
      openVooProject({
        store,
        fileOrPath: {
          name: "broken.pen",
          arrayBuffer: async () => corruptBytes.buffer,
        },
      }),
    ).rejects.toThrow(/not valid JSON/i);
    expect(calls.some(([kind]) => kind === "load")).toBe(false);
    expect(calls.at(-1)).toEqual(["loading", null]);
  });
});
