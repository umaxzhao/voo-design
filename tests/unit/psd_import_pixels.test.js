import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { initializeCanvas, writePsd } from "ag-psd";
import { psdBytesToVooFile as psdFromEditor } from "../../src/canvas/editor/psd_to_voo.js";
import { psdBytesToVooFile as psdFromStore } from "../../src/canvas/store/psd_to_voo.js";
import {
  openVooProject,
  saveVooProject,
  buildProjectVooFile,
  readRequiredAsset,
} from "../../src/canvas/store/project_io.js";
import { decodeVooBinary } from "../../src/canvas/store/voo_binary.js";
import { useDesignStore } from "../../src/store/design_store.js";
import { getImageDataUrl } from "../../src/canvas/store/db.js";

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function solidPixels(width, height, rgba) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set(rgba, i);
  }
  return { width, height, data };
}

function createSamplePsdBytes() {
  const psd = {
    width: 64,
    height: 48,
    children: [
      {
        name: "Layer 1",
        left: 0,
        top: 0,
        imageData: solidPixels(32, 24, [255, 0, 0, 255]),
      },
      {
        name: "Group 1",
        opened: true,
        children: [
          {
            name: "Child Layer",
            left: 10,
            top: 10,
            imageData: solidPixels(16, 16, [0, 255, 0, 255]),
          },
        ],
      },
    ],
  };
  return new Uint8Array(writePsd(psd));
}

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
      getContext: () => ({
        putImageData() {},
      }),
      toDataURL: () => SAMPLE_PNG_DATA_URL,
    }),
  };
}

describe("PSD Import Bitmap Pixels and Persistence", () => {
  beforeEach(() => {
    installCanvasStubs();
    vi.stubGlobal("window", {
      confirm: () => true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete globalThis.document;
    delete globalThis.ImageData;
  });

  it("exports psdBytesToVooFile from both editor and store paths with assets and images", () => {
    expect(typeof psdFromEditor).toBe("function");
    expect(typeof psdFromStore).toBe("function");

    const bytes = createSamplePsdBytes();
    const vooFile = psdFromEditor(bytes);

    expect(vooFile.format).toBe("voo-editor");
    expect(vooFile.images).toBeDefined();
    expect(vooFile.assets).toBeDefined();
    expect(vooFile.assets).toEqual(vooFile.images);

    const assetKeys = Object.keys(vooFile.assets);
    expect(assetKeys.length).toBe(2);
    for (const key of assetKeys) {
      expect(vooFile.assets[key]).toBe(SAMPLE_PNG_DATA_URL);
    }
  });

  it("hydrates PSD layer images into design store memory and database on open", async () => {
    const bytes = createSamplePsdBytes();
    const file = new File([bytes], "test-poster.psd", { type: "image/vnd.adobe.photoshop" });

    const openResult = await openVooProject({
      fileOrPath: file,
      store: useDesignStore.getState(),
    });

    expect(openResult.success).toBe(true);

    const state = useDesignStore.getState();
    const activeDoc = state.nodes[0]?.data?.editorDoc;
    expect(activeDoc).toBeDefined();

    const imageNodes = activeDoc.nodes.filter((node) => node.kind === "image");
    expect(imageNodes.length).toBe(2);

    for (const node of imageNodes) {
      expect(node.imageId).toBeDefined();
      expect(typeof node.imageId).toBe("string");
      expect(node.imageId.startsWith("img-")).toBe(true);

      // Verify pixels exist in design store memory
      expect(state.images[node.imageId]).toBe(SAMPLE_PNG_DATA_URL);

      // Verify asset resolution succeeds without placeholder fallback
      const resolved = await readRequiredAsset(node.imageId);
      expect(resolved).toBe(SAMPLE_PNG_DATA_URL);
    }
  });

  it("persists imported PSD layers and bitmap pixels across VOO project save and reopen", async () => {
    const bytes = createSamplePsdBytes();
    const file = new File([bytes], "banner.psd", { type: "image/vnd.adobe.photoshop" });

    // 1. Open the PSD
    await openVooProject({
      fileOrPath: file,
      store: useDesignStore.getState(),
    });

    const initialDoc = useDesignStore.getState().nodes[0]?.data?.editorDoc;
    const initialImageNodes = initialDoc.nodes.filter((node) => node.kind === "image");
    expect(initialImageNodes.length).toBe(2);

    const initialImageIds = initialImageNodes.map((node) => node.imageId);

    // 2. Save as VOO project
    let writtenBytes = null;
    window.electronAPI = {
      saveFileDialog: async () => "/saved-banner.voo",
      writeFileBytes: async (_path, data) => {
        writtenBytes = data;
      },
    };

    useDesignStore.getState().setFileName("banner.voo");
    useDesignStore.getState().setFilePath("/saved-banner.voo");

    const saveResult = await saveVooProject({
      store: useDesignStore.getState(),
      saveAs: false,
    });
    expect(saveResult.success).toBe(true);
    expect(writtenBytes).toBeInstanceOf(Uint8Array);

    // Verify envelope assets are present in binary
    const parsedVoo = decodeVooBinary(writtenBytes);
    expect(parsedVoo.assets).toBeDefined();
    for (const imageId of initialImageIds) {
      expect(parsedVoo.assets[imageId]).toBe(SAMPLE_PNG_DATA_URL);
    }

    // 3. Reopen the saved VOO project in a clean state
    useDesignStore.setState({ images: {}, nodes: [] });

    window.electronAPI.openFileDialog = async () => "/saved-banner.voo";
    window.electronAPI.readFileBytes = async () => writtenBytes;

    const reopenResult = await openVooProject({
      fileOrPath: "/saved-banner.voo",
      store: useDesignStore.getState(),
    });
    expect(reopenResult.success).toBe(true);

    const reopenedState = useDesignStore.getState();
    const reopenedDoc = reopenedState.nodes[0]?.data?.editorDoc;
    const reopenedImageNodes = reopenedDoc.nodes.filter((node) => node.kind === "image");

    expect(reopenedImageNodes.length).toBe(2);

    for (const node of reopenedImageNodes) {
      expect(initialImageIds).toContain(node.imageId);
      expect(reopenedState.images[node.imageId]).toBe(SAMPLE_PNG_DATA_URL);

      const resolved = await readRequiredAsset(node.imageId);
      expect(resolved).toBe(SAMPLE_PNG_DATA_URL);
    }
  });

  it("handles real fixture poster-1.psd roundtrip with bitmap assets intact", async () => {
    const fixtureUrl = new URL("../fixtures/roundtrip/poster-1.psd", import.meta.url);
    const fixtureBytes = new Uint8Array(readFileSync(fixtureUrl));
    const file = new File([fixtureBytes], "poster-1.psd", { type: "image/vnd.adobe.photoshop" });

    await openVooProject({
      fileOrPath: file,
      store: useDesignStore.getState(),
    });

    const state = useDesignStore.getState();
    const doc = state.nodes[0]?.data?.editorDoc;
    const imageNodes = doc.nodes.filter((node) => node.kind === "image");
    expect(imageNodes.length).toBeGreaterThan(0);

    for (const node of imageNodes) {
      expect(state.images[node.imageId]).toBeDefined();
      expect(state.images[node.imageId].startsWith("data:image/png")).toBe(true);
    }

    const { vooFile } = await buildProjectVooFile({
      store: state,
    });

    expect(vooFile.assets).toBeDefined();
    for (const node of imageNodes) {
      expect(vooFile.assets[node.imageId]).toBe(state.images[node.imageId]);
    }
  });
});
