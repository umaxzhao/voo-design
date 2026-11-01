import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { editorArtifactPath } from "../e2e/editor-test-artifacts.mjs";

let directory;
let previous;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "voo-artifact-path-test-"));
  previous = process.env.VOO_BROWSER_EVIDENCE_DIR;
  process.env.VOO_BROWSER_EVIDENCE_DIR = directory;
});
afterEach(async () => {
  if (previous === undefined) delete process.env.VOO_BROWSER_EVIDENCE_DIR;
  else process.env.VOO_BROWSER_EVIDENCE_DIR = previous;
  await rm(directory, { recursive: true, force: true });
});
describe("portable browser evidence", () => {
  it("creates nested evidence parents within the configured temporary root", async () => {
    const file = editorArtifactPath("screenshots/frame.png");
    await writeFile(file, "fixture");
    expect(await readFile(file, "utf8")).toBe("fixture");
    expect(file).toBe(path.join(directory, "screenshots/frame.png"));
  });
  it("rejects absolute paths and traversal outside the evidence directory", () => {
    expect(() => editorArtifactPath("../outside.png")).toThrow("must stay inside");
    expect(() => editorArtifactPath(path.resolve(directory, "absolute.png"))).toThrow("must stay inside");
  });
});
