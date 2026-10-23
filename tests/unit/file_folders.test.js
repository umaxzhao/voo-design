import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  folderOfFile,
  setFileFolder,
  clearFolderMembership,
  listLegacyFolderMembership,
  clearLegacyFolderMembership,
  migrateLegacyFolderMembership,
} from "../../src/canvas/store/file_folders.js";

describe("file folder membership (legacy localStorage)", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.();
    clearLegacyFolderMembership();
  });

  it("returns null for a file at the root", () => {
    expect(folderOfFile("a.voo")).toBeNull();
  });

  it("moves a file into a folder and back to the root", () => {
    setFileFolder("a.voo", "Campaign");
    expect(folderOfFile("a.voo")).toBe("Campaign");
    setFileFolder("a.voo", null);
    expect(folderOfFile("a.voo")).toBeNull();
  });

  it("forgets every member when a folder is removed", () => {
    setFileFolder("a.voo", "Campaign");
    setFileFolder("b.voo", "Campaign");
    setFileFolder("c.voo", "Other");
    clearFolderMembership("Campaign");
    expect(folderOfFile("a.voo")).toBeNull();
    expect(folderOfFile("b.voo")).toBeNull();
    expect(folderOfFile("c.voo")).toBe("Other");
  });
});

describe("migrateLegacyFolderMembership", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.();
    clearLegacyFolderMembership();
  });

  it("physically moves root files that only had a localStorage folder", async () => {
    setFileFolder("Hero.voo", "Campaign");
    setFileFolder("gone.voo", "Campaign");
    const moveToFolder = vi.fn(async (id, folder) => ({ ok: true, file: { id, folder } }));
    const scanFiles = vi.fn(async () => [
      { id: "Hero.voo", name: "Hero.voo", folder: null },
      { id: "Other.voo", name: "Other.voo", folder: null },
    ]);

    const moved = await migrateLegacyFolderMembership({ scanFiles, moveToFolder });
    expect(moved).toBe(1);
    expect(moveToFolder).toHaveBeenCalledWith("Hero.voo", "Campaign");
    expect(listLegacyFolderMembership()).toEqual({ "gone.voo": "Campaign" });
  });

  it("clears legacy entries that already live in the target folder", async () => {
    setFileFolder("/ws/Campaign/Hero.voo", "Campaign");
    const moveToFolder = vi.fn();
    const scanFiles = vi.fn(async () => [
      { id: "/ws/Campaign/Hero.voo", name: "Hero.voo", folder: "Campaign" },
    ]);
    expect(await migrateLegacyFolderMembership({ scanFiles, moveToFolder })).toBe(0);
    expect(moveToFolder).not.toHaveBeenCalled();
    expect(listLegacyFolderMembership()).toEqual({});
  });
});
