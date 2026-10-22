import { describe, it, expect, beforeEach } from "vitest";
import { folderOfFile, setFileFolder, clearFolderMembership } from "../../src/canvas/store/file_folders.js";

describe("file folder membership", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.();
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
