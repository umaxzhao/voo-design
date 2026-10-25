// Document creation used to write `format: "voo"` into the envelope, which the
// loader then rejected as "Invalid .voo file format". New files use the shared
// constant; files written by the buggy builds stay readable through the legacy
// tag normalisation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LEGACY_VOO_FILE_FORMAT,
  VOO_FILE_FORMAT,
  emptyVooFile,
  isValidVooFile,
  normalizeVooFile,
} from "../../electron/voo_format.js";
import { decodeVooBinary, encodeVooBinary } from "../../src/canvas/store/voo_binary.js";

const legacyEnvelope = () => ({
  format: LEGACY_VOO_FILE_FORMAT,
  version: 2,
  kind: "design",
  document: { version: 1, width: 1200, height: 800, nodes: [] },
  assets: {},
});

describe(".voo envelope format", () => {
  it("validates files written with the current tag", () => {
    expect(emptyVooFile().format).toBe(VOO_FILE_FORMAT);
    expect(isValidVooFile(emptyVooFile())).toBe(true);
  });

  it("still opens files written with the legacy 'voo' tag", () => {
    expect(isValidVooFile(legacyEnvelope())).toBe(true);
    expect(normalizeVooFile(legacyEnvelope()).format).toBe(VOO_FILE_FORMAT);
  });

  it("round-trips a legacy file through the binary container", () => {
    const bytes = encodeVooBinary(legacyEnvelope());
    const decoded = decodeVooBinary(bytes);
    expect(isValidVooFile(decoded)).toBe(true);
    expect(normalizeVooFile(decoded).format).toBe(VOO_FILE_FORMAT);
  });

  it("rejects an unknown format tag", () => {
    expect(isValidVooFile({ ...legacyEnvelope(), format: "voo-something" })).toBe(false);
  });

  it("no source file writes the legacy tag when building a document", () => {
    const files = [
      "src/App.jsx",
      "src/canvas/components/welcome_home_actions.js",
      "src/canvas/components/welcome_dashboard/use_welcome_create.js",
    ];
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toContain('format: "voo"');
    }
  });
});
