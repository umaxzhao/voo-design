import { describe, expect, it } from "vitest";
import { generateCode } from "../../src/canvas/codegen/index.js";
import { buildRenderTree } from "../../src/canvas/codegen/serialize.js";
import { tailwindClassName } from "../../src/canvas/codegen/tailwind.js";

function makeDoc(nodes, extra = {}) {
  return {
    width: 800,
    height: 600,
    backgroundColor: "#ffffff",
    nodes,
    ...extra,
  };
}

function rect(overrides = {}) {
  return {
    id: "rect-1",
    kind: "rect",
    visible: true,
    opacity: 1,
    rotation: 0,
    shear: 0,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: "#ff0000",
    stroke: "transparent",
    strokeWidth: 0,
    cornerRadius: 0,
    ...overrides,
  };
}

function textNode(overrides = {}) {
  return {
    id: "text-1",
    kind: "text",
    visible: true,
    opacity: 1,
    rotation: 0,
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    text: "Hello",
    fill: "#222222",
    fontSize: 18,
    fontFamily: "Inter",
    fontWeight: "normal",
    align: "left",
    lineHeight: 1.4,
    letterSpacing: 0,
    boxWidth: 0,
    ...overrides,
  };
}

function groupNode(overrides = {}) {
  return {
    id: "group-1",
    kind: "group",
    visible: true,
    opacity: 1,
    rotation: 0,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    ...overrides,
  };
}

function imageNode(overrides = {}) {
  return {
    id: "image-1",
    kind: "image",
    visible: true,
    opacity: 1,
    rotation: 0,
    x: 0,
    y: 0,
    width: 160,
    height: 120,
    imageId: "img-a",
    src: null,
    ...overrides,
  };
}

function pathNode(overrides = {}) {
  return {
    id: "path-1",
    kind: "path",
    visible: true,
    opacity: 1,
    rotation: 0,
    x: 10,
    y: 10,
    width: 100,
    height: 60,
    baseWidth: 100,
    baseHeight: 60,
    points: [
      [0, 0],
      [100, 0],
      [100, 60],
    ],
    fill: "#112233",
    fillRule: "evenodd",
    stroke: "#445566",
    strokeWidth: 2,
    ...overrides,
  };
}

function warningCodes(result) {
  return result.warnings.map((warning) => warning.code);
}

describe("code export: Tailwind HTML", () => {
  it("maps rect fill, stroke and corner radius to utilities", () => {
    const result = generateCode({
      doc: makeDoc([
        rect({
          x: 24,
          y: 16,
          width: 200,
          height: 120,
          fill: "#ff0000",
          stroke: "#000000",
          strokeWidth: 3,
          cornerRadius: 12,
        }),
      ]),
      format: "html",
      scope: "page",
    });
    expect(result.language).toBe("html");
    expect(result.fileName).toBe("design.html");
    expect(result.code.startsWith("<!doctype html>")).toBe(true);
    expect(result.code.endsWith("</html>")).toBe(true);
    expect(result.code).toContain("absolute");
    expect(result.code).toContain("left-[24px]");
    expect(result.code).toContain("top-[16px]");
    expect(result.code).toContain("w-[200px]");
    expect(result.code).toContain("h-[120px]");
    expect(result.code).toContain("bg-[#ff0000]");
    expect(result.code).toContain("border-[3px]");
    expect(result.code).toContain("border-solid");
    expect(result.code).toContain("border-[#000000]");
    expect(result.code).toContain("rounded-[12px]");
    expect(result.code).toContain("bg-[#ffffff]");
    expect(result.warnings).toEqual([]);
  });

  it("keeps a deterministic class order", () => {
    const doc = makeDoc([rect({ fill: "#abcdef", cornerRadius: 8 })]);
    const tree = buildRenderTree(doc, { scope: "page" });
    const tokens = tailwindClassName(tree.root.children[0].plan).split(" ");
    expect(tokens).toEqual([
      "absolute",
      "left-[0px]",
      "top-[0px]",
      "w-[100px]",
      "h-[100px]",
      "bg-[#abcdef]",
      "rounded-[8px]",
    ]);
  });

  it("maps text styling and measures zero-sized text nodes", () => {
    const result = generateCode({
      doc: makeDoc([
        textNode({
          x: 40,
          y: 32,
          width: 0,
          height: 0,
          boxWidth: 300,
          text: "Ship it",
          fill: "#222222",
          fontSize: 18,
          fontWeight: "600",
          align: "center",
          letterSpacing: 0.5,
          lineHeight: 1.4,
        }),
      ]),
      format: "html",
      scope: "page",
    });
    expect(result.code).toContain("text-[18px]");
    expect(result.code).toContain("text-[#222222]");
    expect(result.code).toContain("font-semibold");
    expect(result.code).toContain("text-center");
    expect(result.code).toContain("tracking-[0.5px]");
    expect(result.code).toContain("leading-[1.4]");
    expect(result.code).toContain("whitespace-pre-wrap");
    expect(result.code).toContain("w-[300px]");
  });

  it("escapes text so page content cannot break the document", () => {
    const payload = '</script><img src=x onerror="alert(1)"><b>&</b>';
    const result = generateCode({
      doc: makeDoc([textNode({ text: payload })]),
      format: "html",
      scope: "page",
    });
    expect(result.code).not.toContain("</script><img");
    expect(result.code).not.toContain("<b>&</b>");
    expect(result.code).toContain("&lt;/script&gt;");
    expect(result.code).toContain("&lt;img src=x");
    expect(result.code).toContain("&amp;");
    expect(result.code).toContain("&quot;");
  });

  it("nests group children relative to the group origin", () => {
    const result = generateCode({
      doc: makeDoc([
        groupNode({ id: "group-a", x: 100, y: 50, width: 220, height: 160 }),
        rect({ id: "child-a", parentId: "group-a", x: 130, y: 80, width: 60, height: 60 }),
      ]),
      format: "html",
      scope: "page",
    });
    expect(result.code).toContain("left-[100px]");
    expect(result.code).toContain("top-[50px]");
    expect(result.code).toContain("left-[30px]");
    expect(result.code).toContain("top-[30px]");
  });

  it("maps an auto-layout frame to a flex container with fill children", () => {
    const result = generateCode({
      doc: makeDoc([
        groupNode({
          id: "layout-1",
          x: 50,
          y: 40,
          width: 320,
          height: 120,
          autoLayout: {
            direction: "horizontal",
            gap: 16,
            padding: 20,
            alignItems: "center",
            justifyContent: "space-between",
          },
        }),
        rect({
          id: "fixed-child",
          parentId: "layout-1",
          x: 70,
          y: 60,
          width: 80,
          height: 40,
          fill: "#00ff00",
        }),
        rect({
          id: "fill-child",
          parentId: "layout-1",
          x: 166,
          y: 60,
          width: 80,
          height: 40,
          fill: "#0000ff",
          layoutWidth: "fill",
          layoutHeight: "fixed",
        }),
      ]),
      format: "html",
      scope: "page",
    });
    expect(result.code).toContain("flex flex-row");
    expect(result.code).toContain("gap-[16px]");
    expect(result.code).toContain("p-[20px]");
    expect(result.code).toContain("items-center");
    expect(result.code).toContain("justify-between");
    expect(result.code).toContain("w-[80px] h-[40px] bg-[#00ff00]");
    expect(result.code).toContain("flex-1 h-[40px] bg-[#0000ff]");
    expect(result.code).not.toContain("flex-1 w-[");
  });

  it("maps wrapped auto layout with cross gap, align-content and min/max sizing", () => {
    const result = generateCode({
      doc: makeDoc([
        groupNode({
          id: "wrap-1",
          x: 20,
          y: 20,
          width: 400,
          height: 260,
          autoLayout: {
            direction: "horizontal",
            wrap: true,
            gap: 12,
            crossGap: 24,
            padding: 8,
            alignItems: "start",
            alignContent: "space-between",
            justifyContent: "space-around",
            widthMode: "fixed",
            heightMode: "fixed",
            minWidth: 320,
            maxWidth: 640,
            minHeight: 200,
            maxHeight: 900,
          },
        }),
        rect({ id: "wrap-a", parentId: "wrap-1", x: 28, y: 28, width: 90, height: 60 }),
        rect({ id: "wrap-b", parentId: "wrap-1", x: 130, y: 28, width: 90, height: 60 }),
      ]),
      format: "html",
      scope: "page",
    });
    const classes = result.code;
    expect(classes).toContain("flex-wrap");
    expect(classes).toContain("justify-around");
    expect(classes).toContain("content-between");
    expect(classes).toContain("gap-x-[12px]");
    expect(classes).toContain("gap-y-[24px]");
    expect(classes).toContain("min-w-[320px]");
    expect(classes).toContain("max-w-[640px]");
    expect(classes).toContain("min-h-[200px]");
    expect(classes).toContain("max-h-[900px]");

    const css = generateCode({
      doc: makeDoc([
        groupNode({
          id: "wrap-2",
          x: 0,
          y: 0,
          width: 400,
          height: 260,
          autoLayout: {
            direction: "horizontal",
            wrap: true,
            gap: 12,
            crossGap: 24,
            widthMode: "fixed",
            heightMode: "fixed",
            alignContent: "center",
            minWidth: 320,
            maxWidth: 640,
          },
        }),
      ]),
      format: "css",
      scope: "page",
    }).code;
    expect(css).toContain("flex-wrap:wrap");
    expect(css).toContain("align-content:center");
    expect(css).toContain("column-gap:12px");
    expect(css).toContain("row-gap:24px");
    expect(css).toContain("min-width:320px");
    expect(css).toContain("max-width:640px");
  });

  it("exports vector layers as inline SVG", () => {
    const result = generateCode({
      doc: makeDoc([pathNode()]),
      format: "html",
      scope: "page",
    });
    expect(result.code).toContain("<svg");
    expect(result.code).toContain("<path");
    expect(result.code).toContain('stroke-width="2"');
    expect(result.code).toContain('fill="#112233"');
    expect(result.warnings).toEqual([]);
  });

  it("embeds resolvable image bytes and warns for missing ones", () => {
    const doc = makeDoc([
      imageNode({ id: "image-a" }),
      imageNode({ id: "image-b", x: 200, imageId: "img-b", src: null }),
    ]);
    const result = generateCode({
      doc,
      format: "html",
      scope: "page",
      imageSources: new Map([
        ["img-a", "data:image/png;base64,iVBORw0KGgo="],
      ]),
    });
    expect(result.code).toContain(
      'src="data:image/png;base64,iVBORw0KGgo="',
    );
    expect(result.code).toContain('alt=""');
    expect(result.code).toContain('data-placeholder="true"');
    expect(warningCodes(result)).toContain("imageMissing");
  });

  it("reproduces image crops when the intrinsic size is known", () => {
    const doc = makeDoc([
      imageNode({
        width: 100,
        height: 100,
        crop: { x: 50, y: 50, width: 100, height: 100 },
      }),
    ]);
    const withSize = generateCode({
      doc,
      format: "html",
      scope: "page",
      imageSources: { "img-a": "data:image/png;base64,iVBORw0KGgo=" },
      imageSizes: { "img-a": { width: 200, height: 200 } },
    });
    expect(withSize.code).toContain("overflow-hidden");
    expect(withSize.code).toContain("left-[-50%]");
    expect(withSize.code).toContain("top-[-50%]");
    expect(withSize.code).toContain("w-[200%]");
    expect(withSize.code).toContain("h-[200%]");
    expect(withSize.code).not.toContain("imageCropApproximated");
    expect(withSize.warnings).toEqual([]);

    const withoutSize = generateCode({
      doc,
      format: "html",
      scope: "page",
      imageSources: { "img-a": "data:image/png;base64,iVBORw0KGgo=" },
    });
    expect(warningCodes(withoutSize)).toContain("imageCropApproximated");
  });

  it("exports videos as muted looping elements and warns", () => {
    const result = generateCode({
      doc: makeDoc([
        {
          id: "video-1",
          kind: "video",
          visible: true,
          x: 0,
          y: 0,
          width: 320,
          height: 180,
          src: "https://cdn.example.com/clip.mp4",
        },
      ]),
      format: "html",
      scope: "page",
    });
    expect(result.code).toContain("<video");
    expect(result.code).toContain('src="https://cdn.example.com/clip.mp4"');
    expect(result.code).toContain("autoplay");
    expect(result.code).toContain("muted");
    expect(result.code).toContain("loop");
    expect(result.code).toContain("playsinline");
    expect(warningCodes(result)).toContain("videoBestEffort");
  });
});

describe("code export: warnings for lossy layers", () => {
  it("reports adjustment, region and canvas-instance layers", () => {
    const result = generateCode({
      doc: makeDoc([
        { id: "adjust-1", kind: "adjustment", visible: true, x: 0, y: 0, width: 10, height: 10 },
        { id: "region-1", kind: "region", visible: true, x: 0, y: 0, width: 10, height: 10 },
        {
          id: "instance-1",
          kind: "canvasInstance",
          visible: true,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ]),
      format: "html",
      scope: "page",
    });
    const codes = warningCodes(result);
    expect(codes).toContain("adjustmentSkipped");
    expect(codes).toContain("regionSkipped");
    expect(codes).toContain("canvasInstancePlaceholder");
    expect(result.code).toContain('data-placeholder="true"');
  });

  it("reports unsupported effects, masks, clips and blend modes", () => {
    const result = generateCode({
      doc: makeDoc([
        rect({
          maskId: "mask-1",
          clipTo: "clip-1",
          blendMode: "plus-lighter",
          effects: { bevel: { enabled: true } },
        }),
      ]),
      format: "html",
      scope: "page",
    });
    const codes = warningCodes(result);
    expect(codes).toContain("maskSkipped");
    expect(codes).toContain("clipSkipped");
    expect(codes).toContain("blendModeUnsupported");
    expect(codes).toContain("effectsSkipped");
  });

  it("reports text effect losses", () => {
    const result = generateCode({
      doc: makeDoc([textNode({ highlight: "#ffff00", baselineShift: 4 })]),
      format: "html",
      scope: "page",
    });
    expect(warningCodes(result)).toContain("textEffectsSkipped");
  });

  it("falls back to the page when a selection export has no selection", () => {
    const result = generateCode({
      doc: makeDoc([rect({ x: 10, y: 10 })]),
      format: "html",
      scope: "selection",
      selectedIds: [],
    });
    expect(result.scope).toBe("page");
    expect(warningCodes(result)).toContain("emptySelection");
    expect(result.code).toContain("w-[800px]");
    expect(result.code).toContain("left-[10px]");
  });

  it("warns on an empty page instead of throwing", () => {
    const result = generateCode({
      doc: makeDoc([]),
      format: "html",
      scope: "page",
    });
    expect(warningCodes(result)).toContain("emptyPage");
    expect(result.code).toContain("relative");
  });
});

describe("code export: scope and file names", () => {
  it("crops page coordinates to the selection bounds", () => {
    const result = generateCode({
      doc: makeDoc([
        rect({
          id: "hero",
          name: "Hero Card",
          x: 100,
          y: 120,
          width: 200,
          height: 100,
        }),
      ]),
      format: "html",
      scope: "selection",
      selectedIds: ["hero"],
    });
    expect(result.scope).toBe("selection");
    expect(result.fileName).toBe("hero-card.html");
    expect(result.code).toContain("w-[200px] h-[100px]");
    expect(result.code).toContain("left-[0px] top-[0px]");
    expect(result.code).not.toContain("bg-[#ffffff]");
  });

  it("recovers a group folder when all of its members are selected", () => {
    const result = buildRenderTree(
      makeDoc([
        groupNode({ id: "group-x", x: 20, y: 20, width: 140, height: 60 }),
        rect({ id: "child-x", parentId: "group-x", x: 20, y: 20, width: 60, height: 60 }),
        rect({ id: "child-y", parentId: "group-x", x: 100, y: 20, width: 60, height: 60 }),
      ]),
      { selectedIds: ["child-x", "child-y"], scope: "selection" },
    );
    expect(result.scene.emptySelection).toBe(false);
    expect(result.root.children).toHaveLength(1);
    expect(result.root.children[0].sourceNode.id).toBe("group-x");
    expect(result.root.children[0].cssClass).toBe("voo-group");
  });

  it("produces distinct semantic class names for repeated kinds", () => {
    const result = generateCode({
      doc: makeDoc([rect({ id: "r-a" }), rect({ id: "r-b", x: 200 })]),
      format: "css",
      scope: "page",
    });
    expect(result.code).toContain(".voo-rect{");
    expect(result.code).toContain(".voo-rect-2{");
  });
});

describe("code export: React and CSS formats", () => {
  it("emits a default-exported React component with Tailwind classes", () => {
    const result = generateCode({
      doc: makeDoc([rect({ fill: "#ff0000" })]),
      format: "react",
      scope: "page",
    });
    expect(result.language).toBe("jsx");
    expect(result.fileName).toBe("Design.jsx");
    expect(result.code).toContain("export default function Design()");
    expect(result.code).toContain("className=");
    expect(result.code).toContain("bg-[#ff0000]");
    expect(result.code).toContain("return (");
  });

  it("uses a PascalCase component name from the layer name", () => {
    const result = generateCode({
      doc: makeDoc([rect({ id: "hero", name: "Marketing Page" })]),
      format: "react",
      scope: "selection",
      selectedIds: ["hero"],
    });
    expect(result.fileName).toBe("MarketingPage.jsx");
    expect(result.code).toContain("export default function MarketingPage()");
  });

  it("renders unsafe JSX text as a string expression", () => {
    const result = generateCode({
      doc: makeDoc([textNode({ text: "Use <b>{tags}</b>" })]),
      format: "react",
      scope: "page",
    });
    expect(result.code).toContain('{"Use <b>{tags}</b>"}');
    expect(result.code).not.toContain("Use <b>{tags}</b></div>");
  });

  it("converts inline SVG attributes to JSX camelCase", () => {
    const result = generateCode({
      doc: makeDoc([pathNode()]),
      format: "react",
      scope: "page",
    });
    expect(result.code).toContain("strokeWidth=");
    expect(result.code).toContain("fillRule=");
    expect(result.code).not.toContain("stroke-width=");
    expect(result.code).not.toContain("fill-rule=");
  });

  it("emits a semantic CSS stylesheet plus an HTML skeleton", () => {
    const result = generateCode({
      doc: makeDoc([
        rect({
          x: 24,
          y: 16,
          width: 200,
          height: 120,
          fill: "#ff0000",
          stroke: "#000000",
          strokeWidth: 3,
          cornerRadius: 12,
        }),
      ]),
      format: "css",
      scope: "page",
    });
    expect(result.language).toBe("css");
    expect(result.fileName).toBe("design.css");
    expect(result.code).toContain(".voo-root{position:relative");
    expect(result.code).toContain(
      ".voo-rect{position:absolute;left:24px;top:16px;width:200px;height:120px",
    );
    expect(result.code).toContain("background:#ff0000");
    expect(result.code).toContain("border:3px solid #000000");
    expect(result.code).toContain("border-radius:12px");
    expect(result.code).toContain("/* --- HTML skeleton");
    expect(result.code).toContain('<div class="voo-root">');
  });

  it("escapes text in the CSS skeleton comment", () => {
    const result = generateCode({
      doc: makeDoc([textNode({ text: "</style><script>alert(1)</script>" })]),
      format: "css",
      scope: "page",
    });
    expect(result.code).not.toContain("</style><script>");
    expect(result.code).toContain("&lt;/style&gt;");
  });
});

describe("code export: determinism and validation", () => {
  it("produces byte-identical output for identical input", () => {
    const doc = makeDoc([
      rect({ cornerRadius: 6 }),
      textNode({ text: "Stable", x: 10, y: 10 }),
      pathNode(),
    ]);
    const first = generateCode({ doc, format: "html", scope: "page" });
    const second = generateCode({ doc, format: "html", scope: "page" });
    expect(first.code).toBe(second.code);
    expect(first.warnings).toEqual(second.warnings);
    expect(first.fileName).toBe(second.fileName);
  });

  it("rejects a missing document and unknown formats or scopes", () => {
    expect(() => generateCode({ doc: null })).toThrow("codegen-no-document");
    expect(() =>
      generateCode({ doc: makeDoc([]), format: "vue" }),
    ).toThrow("codegen-unsupported-format");
    expect(() =>
      generateCode({ doc: makeDoc([]), scope: "canvas" }),
    ).toThrow("codegen-unsupported-scope");
  });
});
