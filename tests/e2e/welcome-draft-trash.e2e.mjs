import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
await withEditorBrowser(
  async ({ page, errors }) => {
    page.setDefaultTimeout(10000);
    const home = page.locator(".welcome-dashboard");
    await home.waitFor();
    await page.evaluate(async () => {
      const { addRecentFile } = await import(
        "/src/canvas/store/recent_files.js"
      );
      addRecentFile({ name: "LocalDraft.voo", isDraft: true });
    });
    await home.getByRole("button", { name: "Drafts", exact: true }).click();
    const card = () =>
      home
        .locator("[data-welcome-file-id]")
        .filter({
          has: page.getByRole("button", {
            name: "LocalDraft.voo",
            exact: true,
          }),
        });
    const menu = async (action) => {
      await card().hover();
      await card().getByTitle("More actions", { exact: true }).click();
      await page.getByRole("menuitem", { name: action, exact: true }).click();
    };
    await card().waitFor();
    await menu("Move to Trash");
    await card().waitFor({ state: "detached" });
    await home.getByRole("button", { name: "Trash", exact: true }).click();
    await card().waitFor();
    await menu("Restore file");
    await card().waitFor({ state: "detached" });
    await home.getByRole("button", { name: "Drafts", exact: true }).click();
    await card().waitFor();
    await menu("Move to Trash");
    await card().waitFor({ state: "detached" });
    await home.getByRole("button", { name: "Trash", exact: true }).click();
    await card().waitFor();
    await menu("Delete permanently");
    await card().waitFor({ state: "detached" });
    assert.equal(
      await page.evaluate(async () => {
        const { getRecentFiles } = await import(
          "/src/canvas/store/recent_files.js"
        );
        return getRecentFiles({ includeTrashed: true }).some(
          (file) => file.name === "LocalDraft.voo",
        );
      }),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Local draft: delete, trash visibility, restore and permanent deletion passed.",
    );
  },
  { openDocument: false, mcpLink: false },
);
