// Portable snapshot zip: build → extract roundtrip and rejection paths.
import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_DOCUMENT,
  buildSnapshotZip,
  dataUrlBytes,
  extractSnapshotZip,
  isSnapshotZipName,
  isZipBytes,
} from "../../src/canvas/store/snapshot_io.js";
import { decodeVooBinary } from "../../src/canvas/store/voo_binary.js";
import * as UZIPModule from "uzip";
const UZIP = UZIPModule.encode ? UZIPModule : UZIPModule.default;

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const vooFile = () => ({
  format: "voo-editor",
  version: 2,
  kind: "design",
  document: { width: 100, height: 80, nodes: [] },
  assets: {},
});

describe("snapshot package", () => {
  it("recognises zip names and magic", () => {
    expect(isSnapshotZipName("Brand.zip")).toBe(true);
    expect(isSnapshotZipName("Brand.voo")).toBe(false);
    const bytes = buildSnapshotZip({ vooFile: vooFile(), name: "Brand" });
    expect(isZipBytes(bytes)).toBe(true);
    expect(isZipBytes(new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it("roundtrips the document and manifest", () => {
    const bytes = buildSnapshotZip({
      vooFile: vooFile(),
      name: "Brand",
      preview: PNG,
      appVersion: "1.2.3",
    });
    const snapshot = extractSnapshotZip(bytes);
    expect(snapshot.name).toBe("Brand.voo");
    expect(snapshot.manifest).toMatchObject({
      format: "voo-snapshot",
      version: 1,
      name: "Brand",
      appVersion: "1.2.3",
    });
    expect(snapshot.previewBytes?.length).toBeGreaterThan(0);
    const decoded = decodeVooBinary(snapshot.vooBytes);
    expect(decoded).toMatchObject({ format: "voo-editor", version: 2, kind: "design" });
  });

  it("keeps the member name when the manifest is missing", () => {
    const snapshot = extractSnapshotZip(
      buildSnapshotZip({ vooFile: vooFile(), name: "" }),
    );
    expect(snapshot.name).toBe(SNAPSHOT_DOCUMENT);
  });

  it("rejects non-zips and zips without a document", () => {
    expect(extractSnapshotZip(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2]))).toBeNull();
    expect(extractSnapshotZip(new Uint8Array([1, 2, 3]))).toBeNull();
    const manifestOnly = UZIP.encode({
      "manifest.json": new TextEncoder().encode('{"name":"x"}'),
    });
    expect(extractSnapshotZip(new Uint8Array(manifestOnly))).toBeNull();
  });

  it("decodes data URLs for the preview", () => {
    expect(dataUrlBytes(PNG)?.length).toBeGreaterThan(0);
    expect(dataUrlBytes("not-a-data-url")).toBeNull();
    expect(() => buildSnapshotZip({ vooFile: null })).toThrow();
  });
});
