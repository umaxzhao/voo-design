import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import trash from "../../electron/workspace-trash.cjs";
describe("recoverable desktop workspace trash", () => {
  let sandbox, root;
  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "voo-trash-test-"));
    root = path.join(sandbox, "workspace");
    fs.mkdirSync(root);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(sandbox, {
      recursive: true,
      force: true
    });
  });
  const write = (name, content = name) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), {
      recursive: true
    });
    fs.writeFileSync(file, content);
    return file;
  };
  it("lists trash with stable original IDs and restores into the original project folder", async () => {
    const file = write("Project/Artwork.voo");
    expect((await trash.moveToTrash(file, root)).ok).toBe(true);
    const listed = trash.listTrash(root);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: file,
      name: "Artwork.voo",
      folder: "Project",
      trashed: true
    });
    expect(fs.existsSync(file)).toBe(false);
    expect((await trash.restoreFromTrash(file, root)).ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("Project/Artwork.voo");
    expect(trash.listTrash(root)).toEqual([]);
  });
  it("retains both deleted designs when different projects share the same filename", async () => {
    const first = write("One/Artwork.voo", "first"),
      second = write("Two/Artwork.voo", "second");
    await trash.moveToTrash(first, root);
    await trash.moveToTrash(second, root);
    expect(trash.listTrash(root)).toHaveLength(2);
    await trash.restoreFromTrash(first, root);
    await trash.restoreFromTrash(second, root);
    expect(fs.readFileSync(first, "utf8")).toBe("first");
    expect(fs.readFileSync(second, "utf8")).toBe("second");
  });
  it("refuses to overwrite a recreated destination during restore", async () => {
    const file = write("Artwork.voo", "old");
    await trash.moveToTrash(file, root);
    write("Artwork.voo", "new");
    expect(await trash.restoreFromTrash(file, root)).toMatchObject({
      ok: false,
      error: "already_exists"
    });
    expect(fs.readFileSync(file, "utf8")).toBe("new");
    expect(trash.listTrash(root)).toHaveLength(1);
  });
  it("rolls back a move when the trash index cannot be committed", async () => {
    const file = write("Artwork.voo", "keep");
    const rename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (destination.endsWith(".index.json")) throw new Error("simulated disk failure");
      return rename(source, destination);
    });
    expect((await trash.moveToTrash(file, root)).ok).toBe(false);
    expect(fs.readFileSync(file, "utf8")).toBe("keep");
  });
  it("never falls back to permanent deletion when the trash directory is unusable", async () => {
    const file = write("Artwork.voo", "keep");
    fs.writeFileSync(path.join(root, ".trash"), "blocked");
    expect((await trash.moveToTrash(file, root)).ok).toBe(false);
    expect(fs.readFileSync(file, "utf8")).toBe("keep");
  });
  it("rejects outside paths and a trash directory redirected through a symlink", async () => {
    const outside = path.join(sandbox, "Outside.voo");
    fs.writeFileSync(outside, "keep");
    expect((await trash.moveToTrash(outside, root)).ok).toBe(false);
    const redirected = path.join(sandbox, "redirected");
    fs.mkdirSync(redirected);
    fs.symlinkSync(redirected, path.join(root, ".trash"), "dir");
    const file = write("Artwork.voo", "keep");
    expect((await trash.moveToTrash(file, root)).ok).toBe(false);
    expect(fs.readFileSync(file, "utf8")).toBe("keep");
    expect(fs.readdirSync(redirected)).toEqual([]);
  });
  it("permanent delete and empty trash count designs without deleting outside the workspace", async () => {
    const first = write("One.voo"),
      second = write("Two.voo");
    await trash.moveToTrash(first, root);
    await trash.moveToTrash(second, root);
    expect((await trash.deletePermanently(first, root)).ok).toBe(true);
    expect(await trash.emptyTrash(root)).toEqual({
      ok: true,
      deletedCount: 1
    });
    expect(fs.readdirSync(path.join(root, ".trash"))).toEqual([]);
    const outside = path.join(sandbox, "Outside.voo");
    fs.writeFileSync(outside, "keep");
    expect((await trash.deletePermanently(outside, root)).ok).toBe(false);
    expect(fs.readFileSync(outside, "utf8")).toBe("keep");
  });
});
