import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Assert the visible editor contract, independently of which element owns padding.
 * Physical insets protect controls; zero insets leave the mint frame at the edge.
 * The title gradient includes its safe-area surround and never becomes a mint cap.
 */
export async function assertEditorSafeArea(page, insets, label) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await page.evaluate(() => {
    const read = selector => {
      const element = document.querySelector(selector), style = getComputedStyle(element);
      return { ...element.getBoundingClientRect().toJSON(), radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(parseFloat) };
    };
    return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scroll: [scrollX, scrollY],
      root: read(".app-root-frame"), title: read(".app-title-bar"), shell: read(".editor-shell"),
      coarse: matchMedia("(pointer: coarse)").matches, light: document.documentElement.dataset.theme === "light" };
  });
  const horizontal = Math.max(insets.left, insets.right), { shell, title, width, height, dpr } = metrics;
  assert.deepEqual([metrics.root.x, metrics.root.y, metrics.root.width, metrics.root.height], [0, 0, width, height], label);
  assert.deepEqual([title.x, title.y, title.right], [horizontal, insets.top, width - horizontal], `${label}: title stays inside display safe bounds`);
  assert.deepEqual([shell.x, shell.right, shell.y, shell.bottom], [horizontal, width - horizontal, title.bottom, height - insets.bottom], `${label}: complete frame fits the safe rectangle without an extra decorative gutter`);
  assert.deepEqual(shell.radii, [16, 16, 16, 16], `${label}: all editor corners agree`);
  assert.deepEqual(metrics.scroll, [0, 0], `${label}: viewport does not scroll away the frame`);

  const png = await page.screenshot();
  const pixels = await page.evaluate(async ({ png, shell, title, w, h, dpr, light, insets }) => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    const pixel = (x, y) => Array.from(data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
    const mint = light ? [167, 255, 212, 255] : [178, 255, 214, 255];
    const same = (a, b) => a.every((value, i) => value === b[i]);
    const left = Math.round(shell.x * dpr), right = Math.round(shell.right * dpr) - 1;
    const top = Math.round(shell.y * dpr), bottom = Math.round(shell.bottom * dpr) - 1;
    let edgeErrors = 0;
    for (let n = 0; n < 2 * dpr; n++) {
      for (let y = top + 32 * dpr; y <= bottom - 32 * dpr; y++) {
        if (!same(pixel(left + n, y), mint)) edgeErrors++;
        if (!same(pixel(right - n, y), mint)) edgeErrors++;
      }
      for (let x = left + 32 * dpr; x <= right - 32 * dpr; x++) if (!same(pixel(x, bottom - n), mint)) edgeErrors++;
    }
    const cornerPixels = [[left, top, 1, 1], [right, top, -1, 1], [left, bottom, 1, -1], [right, bottom, -1, -1]]
      .map(([x, y, dx, dy]) => ({ stroke: [[0, 16], [5, 5], [16, 0]].map(([a, b]) => pixel(x + a * dpr * dx, y + b * dpr * dy)), inner: pixel(x + 7 * dpr * dx, y + 7 * dpr * dy) }));
    const padPixels = [[0, Math.floor((title.bottom + h - insets.bottom) / 2)], [w - 1, Math.floor((title.bottom + h - insets.bottom) / 2)], [Math.floor(w / 2), h - 1]]
      .map(([x, y]) => pixel(x * dpr, y * dpr));
    return { size: [image.width, image.height], mint, edgeErrors, cornerPixels, padPixels,
      statusLeft: pixel(0, 0), statusRight: pixel(image.width - 1, 0),
      statusSafeRight: pixel(image.width - 2 * dpr, Math.round((insets.top / 2 || 1) * dpr)),
      statusSideRight: pixel(image.width - 2 * dpr, Math.floor((title.y + title.height / 2) * dpr)) };
  }, { png: png.toString("base64"), shell, title, w: width, h: height, dpr, light: metrics.light, insets });
  // Keep failing captures too, so a CSS regression cannot be hidden by its assertion.
  if (process.env.VOO_SAFE_AREA_EVIDENCE) {
    await mkdir(process.env.VOO_SAFE_AREA_EVIDENCE, { recursive: true });
    await writeFile(join(process.env.VOO_SAFE_AREA_EVIDENCE, `${label}.png`), png);
    await writeFile(join(process.env.VOO_SAFE_AREA_EVIDENCE, `${label}.json`), JSON.stringify({ insets, metrics, pixels }, null, 2));
  }
  assert.deepEqual(pixels.size, [width * dpr, height * dpr], label);
  assert.equal(pixels.edgeErrors, 0, `${label}: uninterrupted equal 2px sides and bottom`);
  for (const corner of pixels.cornerPixels) {
    for (const stroke of corner.stroke) assert.deepEqual(stroke, pixels.mint, `${label}: opaque round frame over shadows`);
    assert.notDeepEqual(corner.inner, pixels.mint, `${label}: rounded inner cutout`);
  }
  for (const pixel of pixels.padPixels) assert.deepEqual(pixel, pixels.mint, `${label}: mint safe-area surround, no black gutter`);
  assert.deepEqual(pixels.statusLeft, [178, 255, 214, 255], `${label}: green title corner`);
  for (const key of ["statusRight", "statusSafeRight", "statusSideRight"]) assert.deepEqual(pixels[key], [0, 0, 0, 255], `${label}: black title end includes safe-area surround (${key})`);

  // Use a real control rather than inferring safety from padding. Horizontal
  // toolbar scrolling is allowed on compact screens; document scrolling is not.
  const control = page.getByTestId("editor-select-tool");
  await control.scrollIntoViewIfNeeded();
  const hit = await control.evaluate(element => {
    const r = element.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { rect: r.toJSON(), reachable: element === target || element.contains(target) };
  });
  assert.ok(hit.rect.x >= insets.left && hit.rect.right <= width - insets.right && hit.rect.y >= insets.top && hit.rect.bottom <= height - insets.bottom, `${label}: selectable tool is inside physical safe bounds`);
  assert.equal(hit.reachable, true, `${label}: frame overlay does not intercept control`);
  await page.evaluate(() => scrollBy(0, 1000));
  assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [0, 0], `${label}: no outer scroll clipping`);
  return metrics;
}
