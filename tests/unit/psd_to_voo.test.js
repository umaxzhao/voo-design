import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeCanvas, writePsd } from "ag-psd";
import { psdBytesToVooFile } from "../../src/canvas/store/psd_to_voo.js";
import { isValidVooFile } from "../../electron/voo_format.js";

/** ag-psd pixel data for a solid-colour layer. */
function solidPixels(width, height, rgba) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width, height, data };
}

/**
 * Node has no DOM canvas. ag-psd needs one to decode layers, and the editor
 * needs one to encode PNGs, so both are replaced with minimal fakes.
 */
function installCanvasStubs() {
  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  const makeImageData = (width, height) =>
    new ImageData(new Uint8ClampedArray(width * height * 4), width, height);
  initializeCanvas(
    (width, height) => ({
      width,
      height,
      getContext: () => ({
        putImageData() {},
        createImageData: makeImageData,
      }),
    }),
    makeImageData,
  );
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ putImageData() {} }),
      toDataURL: () => "data:image/png;base64,AAAA",
    }),
  };
}

function buildSamplePsdBytes() {
  const psd = {
    width: 40,
    height: 30,
    children: [
      {
        name: "Top",
        left: 10,
        top: 5,
        opacity: 0.5,
        blendMode: "multiply",
        imageData: solidPixels(10, 10, [255, 0, 0, 255]),
      },
      {
        name: "Folder",
        opened: true,
        children: [
          {
            name: "Inside",
            left: 20,
            top: 15,
            imageData: solidPixels(4, 4, [0, 255, 0, 255]),
          },
        ],
      },
      {
        name: "Hidden",
        hidden: true,
        left: 0,
        top: 0,
        imageData: solidPixels(2, 2, [0, 0, 255, 255]),
      },
    ],
  };
  return new Uint8Array(writePsd(psd));
}

describe("psdBytesToVooFile", () => {
  beforeAll(installCanvasStubs);
  afterAll(() => {
    delete globalThis.document;
    delete globalThis.ImageData;
  });

  it("builds a valid v1 .voo envelope with the PSD canvas size", () => {
    const vooFile = psdBytesToVooFile(buildSamplePsdBytes());

    expect(isValidVooFile(vooFile)).toBe(true);
    expect(vooFile.version).toBe(1);
    expect(vooFile.document.width).toBe(40);
    expect(vooFile.document.height).toBe(30);
  });

  it("turns every pixel layer into an image node with its own asset", () => {
    const { document, images } = psdBytesToVooFile(buildSamplePsdBytes());
    const imageNodes = document.nodes.filter((node) => node.kind === "image");

    expect(imageNodes.map((node) => node.name).sort()).toEqual([
      "Hidden",
      "Inside",
      "Top",
    ]);
    for (const node of imageNodes) {
      expect(images[node.imageId]).toBe("data:image/png;base64,AAAA");
    }
  });

  it("keeps folders as group nodes and links their members by parentId", () => {
    const { document } = psdBytesToVooFile(buildSamplePsdBytes());
    const group = document.nodes.find((node) => node.kind === "group");
    const inside = document.nodes.find((node) => node.name === "Inside");

    expect(group.name).toBe("Folder");
    expect(inside.parentId).toBe(group.id);
    expect(document.nodes.find((node) => node.name === "Top").parentId).toBeUndefined();
  });

  it("carries position, visibility, opacity and blend mode over", () => {
    const { document } = psdBytesToVooFile(buildSamplePsdBytes());
    const top = document.nodes.find((node) => node.name === "Top");
    const hidden = document.nodes.find((node) => node.name === "Hidden");

    expect({ x: top.x, y: top.y, width: top.width, height: top.height }).toEqual({
      x: 10,
      y: 5,
      width: 10,
      height: 10,
    });
    // PSD stores opacity as 8 bits, so 0.5 comes back as 128/255.
    expect(top.opacity).toBeCloseTo(0.5, 2);
    expect(top.blendMode).toBe("multiply");
    expect(hidden.visible).toBe(false);
  });

  it("orders nodes bottom-first, as the editor paints doc.nodes", () => {
    const { document } = psdBytesToVooFile(buildSamplePsdBytes());
    const names = document.nodes.map((node) => node.name);

    // The PSD lists "Top" before "Folder", so "Top" paints last (on top).
    expect(names.indexOf("Top")).toBeGreaterThan(names.indexOf("Inside"));
  });

  it("fails fast on bytes that are not a PSD", () => {
    expect(() => psdBytesToVooFile(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
