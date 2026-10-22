import { describe, expect, it } from "vitest";
import {
  figmaMessageToPages,
  figmaMessageToVooFile,
} from "../../../src/canvas/figma/figma-to-voo.js";
import { imageIdsOfDocument, isValidVooFile } from "../../../electron/voo_format.js";

const guid = (localID) => ({ sessionID: 0, localID });

/** A decoded `nodeChanges` record. Parent links use Figma's `parentIndex`. */
function change(localID, parentLocalID, position, props) {
  return {
    guid: guid(localID),
    ...(parentLocalID === null ? {} : { parentIndex: { guid: guid(parentLocalID), position } }),
    ...props,
  };
}

function solid(r, g, b, a = 1) {
  return { type: "SOLID", color: { r, g, b, a }, opacity: 1, visible: true };
}

function sampleMessage() {
  return {
    nodeChanges: [
      change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
      change(1, 0, "!", { type: "CANVAS", name: "Page 1" }),
      change(2, 1, "!", {
        type: "FRAME",
        name: "Home",
        transform: { m02: 100, m12: 50 },
        size: { x: 400, y: 300 },
        fillPaints: [solid(1, 1, 1)],
      }),
      change(3, 2, "!", {
        type: "RECTANGLE",
        name: "Box",
        transform: { m02: 10, m12: 20 },
        size: { x: 100, y: 50 },
        fillPaints: [solid(1, 0, 0)],
        cornerRadius: 8,
      }),
      change(4, 2, '"', {
        type: "TEXT",
        name: "Title",
        transform: { m02: 10, m12: 90 },
        size: { x: 200, y: 30 },
        textData: { characters: "Hello" },
        fontSize: 24,
        fillPaints: [solid(0, 0, 0)],
      }),
      change(5, 2, "#", {
        type: "GROUP",
        name: "Group",
        transform: { m02: 0, m12: 0 },
        size: { x: 50, y: 50 },
      }),
      change(6, 5, "!", {
        type: "ELLIPSE",
        name: "Dot",
        transform: { m02: 5, m12: 5 },
        size: { x: 40, y: 40 },
        fillPaints: [solid(0, 0, 1)],
      }),
      change(7, 1, "!", {
        type: "VECTOR",
        name: "Path",
        transform: { m02: 500, m12: 500 },
        size: { x: 60, y: 60 },
        fillPaints: [solid(0, 1, 0)],
      }),
    ],
  };
}

describe("figmaMessageToPages", () => {
  it("turns each top-level frame into a page and keeps loose shapes on their own page", () => {
    const { pages } = figmaMessageToPages(sampleMessage());

    // One editor page per Figma page: the frame and the loose shape share one canvas.
    expect(pages.map((page) => [page.label, page.width, page.height])).toEqual([
      ["Page 1", 460, 510],
    ]);
  });

  it("preserves Frame and Group semantics with multi-level nesting and background leaf", () => {
    const { nodes } = figmaMessageToPages(sampleMessage()).pages[0];

    const homeFrame = nodes.find((node) => node.name === "Home");
    const group = nodes.find((node) => node.name === "Group");
    const dot = nodes.find((node) => node.name === "Dot");
    const box = nodes.find((node) => node.name === "Box");
    const path = nodes.find((node) => node.name === "Path");

    // Frame is a container with frame: true
    expect(homeFrame).toBeDefined();
    expect(homeFrame.kind).toBe("group");
    expect(homeFrame.frame).toBe(true);
    expect(homeFrame.isFrame).toBe(true);
    expect(homeFrame.parentId).toBeNull();

    // Group is a container with frame: false
    expect(group).toBeDefined();
    expect(group.kind).toBe("group");
    expect(group.frame).toBe(false);
    expect(group.parentId).toBe(homeFrame.id);

    // Multi-level nesting: Dot inside Group, Box inside Home, Path at root
    expect(dot.parentId).toBe(group.id);
    expect(box.parentId).toBe(homeFrame.id);
    expect(path.parentId).toBeNull();
  });

  it("places children in frame-relative coordinates and keeps radius and colour", () => {
    const home = figmaMessageToPages(sampleMessage()).pages[0];
    const box = home.nodes.find((node) => node.name === "Box");

    expect({ x: box.x, y: box.y, width: box.width, height: box.height }).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    expect(box.cornerRadius).toBe(8);
    expect(box.fill).toBe("#ff0000");
  });

  it("maps text content and font size", () => {
    const home = figmaMessageToPages(sampleMessage()).pages[0];
    const title = home.nodes.find((node) => node.kind === "text");

    expect(title.text).toBe("Hello");
    expect(title.fontSize).toBe(24);
  });

  it("links group members through parentId, while groups do not shift coordinates", () => {
    const home = figmaMessageToPages(sampleMessage()).pages[0];
    const group = home.nodes.find((node) => node.name === "Group");
    const dot = home.nodes.find((node) => node.kind === "ellipse");

    expect(dot.parentId).toBe(group.id);
    expect(dot.x).toBe(5);
    expect(dot.y).toBe(5);
  });

  it("approximates unsupported layers as boxes and reports them", () => {
    const { warnings } = figmaMessageToPages(sampleMessage());

    expect(warnings).toEqual([{ message: "approximated:VECTOR", count: 1 }]);
  });

  it("puts a symbol definition's layers directly on the page", () => {
    const message = {
      nodeChanges: [
        change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        change(1, 0, "!", {
          type: "SYMBOL",
          name: "Button",
          transform: { m02: 0, m12: 0 },
          size: { x: 120, y: 40 },
        }),
        change(2, 1, "!", {
          type: "RECTANGLE",
          name: "Face",
          transform: { m02: 0, m12: 0 },
          size: { x: 120, y: 40 },
          fillPaints: [solid(0, 0, 0)],
        }),
      ],
    };
    const { pages } = figmaMessageToPages(message);
    const face = pages[0].nodes.find((node) => node.name === "Face");

    expect(pages[0].nodes.some((node) => node.kind === "group")).toBe(false);
    expect(face.parentId ?? null).toBeNull();
  });

  it("returns null when nothing is mappable", () => {
    expect(figmaMessageToPages({ nodeChanges: [] })).toBeNull();
  });
});

describe("figmaMessageToVooFile", () => {
  it("builds a valid v2 .voo envelope that the existing open path can load", () => {
    const { vooFile, layerCount } = figmaMessageToVooFile(sampleMessage(), new Map());

    expect(isValidVooFile(vooFile)).toBe(true);
    expect(vooFile.version).toBe(2);
    expect(vooFile.document.pages).toHaveLength(1);
    expect(vooFile.document.editingNodeId).toBe(vooFile.document.pages[0].id);
    expect(layerCount).toBeGreaterThan(0);
  });

  it("embeds an image fill as an asset the document references", () => {
    const hash = Uint8Array.from([0xab, 0x01]);
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const message = {
      nodeChanges: [
        change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        change(1, 0, "!", {
          type: "FRAME",
          name: "Photo",
          transform: { m02: 0, m12: 0 },
          size: { x: 200, y: 200 },
          fillPaints: [{ type: "IMAGE", visible: true, image: { hash } }],
        }),
      ],
    };

    const { vooFile } = figmaMessageToVooFile(message, new Map([["ab01", png]]));
    const ids = imageIdsOfDocument(vooFile.document, "design");

    expect(ids).toContain("img-ab01");
    expect(vooFile.assets["img-ab01"]).toMatch(/^data:image\/png;base64,/);
  });
});
