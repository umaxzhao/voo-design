import assert from "node:assert/strict";

/** Exercise the real field when commit and undo share one React publication. */
export async function verifyNumberInputCheckpoint(page) {
  await page.evaluate(async () => {
    const { mountNumberCheckpoint } = await import("/tests/e2e/inspector-audit-panel.mjs");
    mountNumberCheckpoint();
  });
  try {
    const input = page.getByRole("spinbutton", { name: "Checkpoint value", exact: true });
    await input.fill("30");
    assert.equal(await input.inputValue(), "30");
    await input.press("Enter");
    assert.deepEqual(await page.evaluate(() => window.__numberCheckpoint), { value: 0, commits: [30] });
    await page.waitForFunction(() => document.querySelector("#number-checkpoint-host input")?.value === "0");
    await input.fill("12");
    assert.equal(await input.inputValue(), "12");
    await input.press("Escape");
    assert.equal(await input.inputValue(), "0");
    assert.deepEqual(await page.evaluate(() => window.__numberCheckpoint), { value: 0, commits: [30] });
    await input.fill("25");
    await input.blur();
    await page.waitForFunction(() => document.querySelector("#number-checkpoint-host input")?.value === "0");
    assert.deepEqual(await page.evaluate(() => window.__numberCheckpoint), { value: 0, commits: [30, 25] });
  } finally {
    await page.evaluate(() => {
      window.__numberCheckpointRoot.unmount();
      document.getElementById("number-checkpoint-host").remove();
      delete window.__numberCheckpointRoot;
      delete window.__numberCheckpoint;
    });
  }
}
