import { afterEach, beforeEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prepareDesktopModels } from "../../scripts/prepare-desktop-models.mjs";

let directory;
const bytes = new Uint8Array([1, 2, 3]);
const model = { file: "fixture.onnx", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "voo-desktop-assets-"));
  await mkdir(join(directory, "source"));
});
afterEach(async () => rm(directory, { recursive: true, force: true }));
const prepare = () => prepareDesktopModels({ sourceDirectory: join(directory, "source"), outputDirectory: join(directory, "out"), manifest: { models: [model] } });

it("rejects missing weights rather than accepting unrelated models", async () => {
  await writeFile(join(directory, "source/upscaler.onnx"), bytes);
  await expect(prepare()).rejects.toThrow("Required desktop model missing");
});

it("requires the actual advertised matting model on a clean checkout", async () => {
  await expect(prepareDesktopModels({ sourceDirectory: join(directory, "source"), outputDirectory: join(directory, "out") }))
    .rejects.toThrow("Required desktop model missing: rmbg-1.4-fp16.onnx");
});

it("rejects an LFS pointer and same-sized corrupt bytes", async () => {
  await writeFile(join(directory, "source/fixture.onnx"), "version https://git-lfs.github.com/spec/v1");
  await expect(prepare()).rejects.toThrow("size mismatch");
  await writeFile(join(directory, "source/fixture.onnx"), new Uint8Array([3, 2, 1]));
  await expect(prepare()).rejects.toThrow("checksum mismatch");
});

it("copies verified bytes and their manifest to the package input", async () => {
  await writeFile(join(directory, "source/fixture.onnx"), bytes);
  expect(await prepare()).toEqual(["fixture.onnx"]);
  expect(await readFile(join(directory, "out/fixture.onnx"))).toEqual(Buffer.from(bytes));
  expect(JSON.parse(await readFile(join(directory, "out/manifest.json"), "utf8")).models).toEqual([model]);
});

it("downloads a missing weight only when opted in and validates its bytes", async () => {
  const calls = [];
  const result = await prepareDesktopModels({ sourceDirectory: join(directory, "source"), outputDirectory: join(directory, "out"),
    manifest: { baseUrl: "https://models.example.test/weights/", models: [model] }, downloadMissing: true,
    fetcher: async url => { calls.push(url); return new Response(bytes); },
  });
  expect(result).toEqual(["fixture.onnx"]);
  expect(calls).toEqual(["https://models.example.test/weights/fixture.onnx"]);
});

it("rejects a corrupt download before creating a package input", async () => {
  await expect(prepareDesktopModels({ sourceDirectory: join(directory, "source"), outputDirectory: join(directory, "out"),
    manifest: { baseUrl: "https://models.example.test/", models: [model] }, downloadMissing: true,
    fetcher: async () => new Response(new Uint8Array([3, 2, 1])),
  })).rejects.toThrow("download checksum mismatch");
});
