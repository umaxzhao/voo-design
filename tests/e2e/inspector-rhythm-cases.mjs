import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";

/** Existing inspector rows stay inline, aligned and reachable in a real editor. */
export async function runInspectorRhythmCases({ page, tool }) {
  const evidence =
    process.env.VOO_INSPECTOR_RHYTHM_EVIDENCE ??
    "/private/tmp/voo-inspector-rhythm";
  await mkdir(evidence, { recursive: true });
  const panel = page.getByTestId("editor-properties-panel");
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const checks = [];
  const imageId = await page.evaluate(async () => {
    const { createRectNode, createTextNode } =
      await import("/src/canvas/editor/scene_model.js");
    const rect = (id, x) => ({
      ...createRectNode({ x, y: 60, width: 120, height: 80, fill: "#ff0000" }),
      id,
    });
    const a = rect("rhythm-rect", 50),
      b = rect("rhythm-frame", 230);
    b.isFrame = true;
    const text = {
      ...createTextNode({ x: 50, y: 180, text: "Panel text", fontSize: 24 }),
      id: "rhythm-text",
    };
    const engine = window.__vooEditor;
    engine.setDoc({ ...engine.getDocument(), nodes: [a, b, text] });
    const bitmap = document.createElement("canvas");
    bitmap.width = 32;
    bitmap.height = 24;
    bitmap.getContext("2d").fillRect(0, 0, 32, 24);
    const image = await engine.insertImage(bitmap.toDataURL(), {
      x: 400,
      y: 160,
    });
    engine.selectExactly([a.id]);
    return image.id;
  });
  await settle();
  const add = panel.getByRole("button", {
    name: "Add export settings",
    exact: true,
  });
  assert.equal(
    await add.count(),
    1,
    "An unconfigured layer keeps the Export heading and plus in the inspector",
  );
  assert.equal(
    await panel.getByRole("button", { name: "Export", exact: true }).count(),
    0,
  );
  assert.equal(
    await panel.getByRole("button", { name: "Format", exact: true }).count(),
    0,
  );
  checks.push(
    "unconfigured layers expose only the Export heading and plus; no invented preset or export action",
  );
  await add.click();
  await settle();
  const suffix = panel.getByRole("textbox", { name: "Suffix", exact: true });
  await suffix.fill("proof");
  await suffix.press("Tab");
  await panel
    .getByRole("button", { name: "Export scale", exact: true })
    .click();
  await page.getByRole("option", { name: "2x", exact: true }).click();
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  const file = await download,
    bytes = await readFile(await file.path());
  assert.match(file.suggestedFilename(), /proof@2x\.png$/);
  assert.equal(bytes.readUInt32BE(16), 240);
  assert.equal(bytes.readUInt32BE(20), 160);
  await writeFile(`${evidence}/export-proof@2x.png`, bytes);
  checks.push(
    "inline suffix and scale generate actual 2x PNG bytes with exact dimensions",
  );
  await add.click();
  await settle();
  assert.equal(
    await panel.getByRole("button", { name: "Format", exact: true }).count(),
    2,
  );
  await panel
    .getByRole("button", { name: "Format", exact: true })
    .last()
    .click();
  await page.getByRole("option", { name: "JPEG", exact: true }).click();
  const downloads = [];
  const collect = (download) => {
    downloads.push(download);
  };
  page.on("download", collect);
  const bothDownloads = page.waitForEvent("download", {
    predicate: () => downloads.length === 2,
  });
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  await bothDownloads;
  page.off("download", collect);
  for (const download of downloads) {
    const data = await readFile(await download.path());
    const filename = download.suggestedFilename();
    assert.ok(/@2x\.png$|@1x\.jpg$/.test(filename), filename);
    if (filename.endsWith(".jpg"))
      assert.equal(data.subarray(0, 2).toString("hex"), "ffd8");
    await writeFile(`${evidence}/${filename}`, data);
  }
  checks.push(
    "one Export action downloads both configured PNG and JPEG with matching file signatures",
  );
  await panel
    .getByRole("button", { name: "Remove export settings", exact: true })
    .last()
    .click();
  await tool("undo");
  await settle();
  assert.equal(
    await panel.getByRole("button", { name: "Format", exact: true }).count(),
    2,
  );
  await tool("redo");
  await settle();
  assert.equal(
    await panel.getByRole("button", { name: "Format", exact: true }).count(),
    1,
  );
  checks.push(
    "multiple inline configurations add/remove, undo and redo individually",
  );
  for (const width of [1440, 768, 390, 320])
    for (const theme of ["dark", "light"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(async (theme) => {
        const { setEditorTheme } =
          await import("/src/canvas/use_editor_theme.js");
        setEditorTheme(theme);
      }, theme);
      for (const ids of [
        ["rhythm-rect"],
        ["rhythm-frame"],
        ["rhythm-text"],
        [imageId],
        ["rhythm-rect", "rhythm-text"],
      ]) {
        await page.evaluate(
          (ids) => window.__vooEditor.selectExactly(ids),
          ids,
        );
        await settle();
        const toggle = panel.locator(".editor-mobile-panel-toggle");
        if (
          (await toggle.isVisible()) &&
          (await toggle.getAttribute("aria-expanded")) === "false"
        )
          await toggle.click();
        const measurements = await panel
          .locator("[data-inspector-section]")
          .evaluateAll((sections) =>
            sections.map((section) => {
              const style = getComputedStyle(section);
              const header = section.querySelector(
                ".inspector-section-title",
              )?.parentElement;
              const children = [
                ...section.querySelectorAll(
                  'button, input, [role="radiogroup"]',
                ),
              ];
              return {
                title: header?.textContent ?? null,
                paddingBottom: style.paddingBottom,
                headerHeight: header?.getBoundingClientRect().height ?? null,
                border: style.borderTopWidth,
                overflow: section.scrollWidth > section.clientWidth + 1,
                overlap: children.some((el) => {
                  const box = el.getBoundingClientRect(),
                    parent = section.getBoundingClientRect();
                  return (
                    box.width > 0 &&
                    (box.left < parent.left - 1 || box.right > parent.right + 1)
                  );
                }),
              };
            }),
          );
        assert.ok(
          measurements.every(
            (row) => row.headerHeight == null || row.headerHeight === 24,
          ),
          JSON.stringify(measurements),
        );
        assert.ok(
          measurements.every(
            (row) =>
              row.paddingBottom === "8px" &&
              row.border === "0px" &&
              !row.overflow &&
              !row.overlap,
          ),
          JSON.stringify(measurements),
        );
        await add.scrollIntoViewIfNeeded();
        assert.equal(await add.isVisible(), true);
        await panel.screenshot({
          path: `${evidence}/${width}-${theme}-${ids.join("-")}.png`,
        });
        checks.push(
          `${width}/${theme}/${ids.join("+")}: header rhythm, control bounds and long-panel export reachability`,
        );
        if (ids[0] === "rhythm-text" && ids.length === 1) {
          const typography = panel.getByRole("button", {
            name: "Typography",
            exact: true,
          });
          await typography.click();
          assert.equal(await typography.getAttribute("aria-expanded"), "false");
          await typography.press("Enter");
          assert.equal(await typography.getAttribute("aria-expanded"), "true");
        }
      }
    }
  await writeFile(
    `${evidence}/result.json`,
    JSON.stringify({ checks, functionalCoverage: "partial" }, null, 2),
  );
  console.log(JSON.stringify({ inspectorRhythm: checks }, null, 2));
}
