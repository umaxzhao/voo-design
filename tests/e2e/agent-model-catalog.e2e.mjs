import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(
  async ({ page }) => {
    await page.route("**/health", route => route.abort());
    await page.reload();
    await page.waitForLoadState("networkidle");
    const welcomeTrigger = page.locator(".welcome-composer-model-select button");
    await welcomeTrigger.click();
    await page.getByTestId("settings-drawer").waitFor();
    assert.equal(await page.getByRole("option", { name: /Sonnet|GPT-6/ }).count(), 0);
    await page.keyboard.press("Escape");

    // A connected desktop returns its own account-specific catalog, not a UI constant.
    await page.evaluate(() => {
      window.vooDesktop = {
        localCli: {
          connect: async () => ({
            models: [
              { id: "account-model", label: "Account model" },
              { id: "hidden-model", label: "Hidden model", hidden: true },
            ],
          }),
          checkStatus: async () => ({
            models: [{ id: "account-gemini", label: "Account Gemini" }],
          }),
        },
      };
      window.dispatchEvent(new Event("focus"));
    });
    await welcomeTrigger.click();
    const accountOption = page.getByRole("option", {
      name: "Account model",
      exact: true,
    });
    await accountOption.waitFor();
    assert.equal(
      await page.getByRole("option", { name: "Hidden model" }).count(),
      0,
    );
    await accountOption.click();
    assert.match(await welcomeTrigger.innerText(), /Account model/);

    await page.evaluate(async () => {
      const { mountAgentCatalogPanel } = await import("/tests/e2e/agent-model-catalog-harness.jsx");
      mountAgentCatalogPanel();
    });
    const agentTrigger = page.getByTestId("agent-composer-model-pill");
    await agentTrigger.waitFor();
    assert.match(await agentTrigger.innerText(), /Account model/);
    await agentTrigger.click();
    const menu = page.locator("#agent-model-menu");
    await menu.getByText("Account model", { exact: true }).waitFor();
    await menu.getByText("Account Gemini", { exact: true }).waitFor();
    assert.equal(
      await menu.getByText("Hidden model", { exact: true }).count(),
      0,
    );
    await menu.getByText("Haiku 5.5", { exact: true }).click();
    assert.match(await agentTrigger.innerText(), /Haiku 5.5/);
    console.log(
      "Agent and welcome model catalogs: current, synchronized, selectable",
    );
  },
  { openDocument: false, mcpLink: false },
);
