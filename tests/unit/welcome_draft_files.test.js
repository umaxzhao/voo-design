import { describe, expect, it } from "vitest";
import { collectDraftFiles } from "../../src/canvas/components/welcome_dashboard/welcome_draft_files.js";

describe("workbench draft classification", () => {
  it("puts unfiled workspace files in Drafts and excludes project-folder files", () => {
    const files = collectDraftFiles(
      [
        { id: "root.voo", name: "Root.voo", path: "/workspace/Root.voo", folder: null },
        { id: "Project2/nested.voo", name: "Nested.voo", path: "/workspace/Project2/Nested.voo", folder: "Project2" },
      ],
      [],
    );

    expect(files).toEqual([
      { id: "root.voo", name: "Root.voo", path: "/workspace/Root.voo", folder: null, isDraft: true },
    ]);
  });

  it("adds unfiled local recents without duplicating workspace files", () => {
    const files = collectDraftFiles(
      [
        { id: "/workspace/Root.voo", name: "Root.voo", path: "/workspace/Root.voo", folder: null },
        { id: "Project2/Nested.voo", name: "Nested.voo", path: "/workspace/Project2/Nested.voo", folder: "Project2" },
      ],
      [
        { id: "/workspace/Root.voo", name: "Root.voo", path: "/workspace/Root.voo" },
        { id: "/workspace/Project2/Nested.voo", name: "Nested.voo", path: "/workspace/Project2/Nested.voo" },
        { id: "/imports/Imported.voo", name: "Imported.voo", path: "/imports/Imported.voo", isDraft: false },
      ],
    );

    expect(files.map((file) => file.name)).toEqual(["Root.voo", "Imported.voo"]);
    expect(files.every((file) => file.isDraft)).toBe(true);
  });
});
