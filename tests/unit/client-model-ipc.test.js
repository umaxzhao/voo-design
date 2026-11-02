import { afterEach, beforeEach, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { registerClientModelIpc } = require("../../electron/client-models.cjs");
let directory;
let handlers;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "voo-model-status-"));
  await mkdir(join(directory, "models"));
  handlers = new Map();
  registerClientModelIpc({ handle: (name, run) => handlers.set(name, run) }, {
    getAppPath: () => directory,
  });
});
afterEach(async () => rm(directory, { recursive: true, force: true }));

it("distinguishes an installed weight, a missing weight and an empty weight", async () => {
  await writeFile(join(directory, "models/lama_512_fp16.onnx"), new Uint8Array([1, 2]));
  await writeFile(join(directory, "models/lama_512_int8.onnx"), new Uint8Array());
  const has = handlers.get("model:has");
  expect(await has(null, "lama_512_fp16.onnx")).toBe(true);
  expect(await has(null, "lama_512_int8.onnx")).toBe(false);
  expect(await has(null, "rmbg-1.4-fp16.onnx")).toBe(false);
});

it("rejects model names outside the existing allowlist", async () => {
  await expect(handlers.get("model:has")(null, "../package.json")).rejects.toThrow("unknown model");
});
