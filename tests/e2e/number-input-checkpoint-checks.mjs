import assert from "node:assert/strict";

/** Exercise the real field when commit and undo share one React publication. */
export async function verifyNumberInputCheckpoint(page) {
  await page.evaluate(async () => {
    const { mountNumberCheckpoint } = await import("/tests/e2e/inspector-audit-panel.mjs");
    mountNumberCheckpoint();
  });
  try {
    const input = page.getByRole("textbox", { name: "Checkpoint value", exact: true });
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
  await verifyDelayedNumberPublication(page);
}

/** Enter/cancel must not need a future parent render to show the committed value. */
async function verifyDelayedNumberPublication(page) {
  await page.evaluate(async () => {
    const { mountDelayedNumberPublication } = await import("/tests/e2e/inspector-audit-panel.mjs");
    mountDelayedNumberPublication();
  });
  const input = page.getByRole("textbox", { name: "Delayed checkpoint", exact: true });
  const state = () => page.evaluate(() => ({ value: window.__numberPublication.value, commits: window.__numberPublication.commits }));
  try {
    await input.fill("150");
    await input.press("Enter");
    assert.equal(await input.inputValue(), "150");
    assert.deepEqual(await state(), { value: 150, commits: [150] });
    await input.fill("222");
    await input.press("Escape");
    assert.equal(await input.inputValue(), "150", "Escape immediately restores the latest Enter despite retained old props");
    assert.deepEqual(await state(), { value: 150, commits: [150] });
    await input.fill("");
    await input.blur();
    assert.equal(await input.inputValue(), "150");
    assert.deepEqual(await state(), { value: 150, commits: [150] });

    // Synthetic composition checks key routing only; physical IME is separate.
    await input.fill("222");
    await input.dispatchEvent("compositionstart");
    await input.press("Enter");
    await input.press("Escape");
    assert.equal(await input.inputValue(), "222");
    assert.equal(await input.evaluate(element => document.activeElement === element), true);
    assert.deepEqual(await state(), { value: 222, commits: [150] });
    await input.dispatchEvent("compositionend");
    await input.press("Escape");
    assert.equal(await input.inputValue(), "150");
    assert.deepEqual(await state(), { value: 150, commits: [150] });
    await page.evaluate(() => window.__numberPublication.publish());
    assert.equal(await input.inputValue(), "150");
  } finally {
    await page.evaluate(() => {
      window.__numberPublicationRoot.unmount();
      document.getElementById("number-publication-host").remove();
      delete window.__numberPublicationRoot;
      delete window.__numberPublication;
    });
  }
}
