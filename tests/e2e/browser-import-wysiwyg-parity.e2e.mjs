import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const PAGE = `<!doctype html><html><head><title>WYSIWYG Position Test</title><style>
*{box-sizing:border-box}body{margin:0;font:16px/1.4 Helvetica,Arial,sans-serif;background:#f4efe6;color:#222}
header{display:flex;justify-content:space-between;align-items:center;padding:0 24px;height:72px;background:#1d3557;color:#fff}
header nav{display:flex;gap:16px}
main{padding:32px 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.tile{height:140px;padding:16px;border-radius:12px;background:#e63946;color:#fff}.tile:nth-child(2n){background:#457b9d}
.wide{grid-column:1/-1;height:260px;background:linear-gradient(90deg,#ffb703,#fb8500);padding:16px;border-radius:8px}
footer{height:120px;padding:24px;background:#222;color:#ddd}</style></head><body>
<header id="h"><b id="logo">LOGO</b><nav><a id="n1">One</a><a id="n2">Two</a><a id="n3">Three</a></nav></header>
<main><div class="tile" id="t1">Tile 1</div><div class="tile" id="t2">Tile 2</div><div class="tile" id="t3">Tile 3</div>
<div class="tile" id="t4">Tile 4</div><div class="wide" id="wide">Wide banner</div></main>
<footer id="f">Footer text here</footer></body></html>`;

const SAMPLE_IDS = ["h", "logo", "n1", "n3", "t1", "t2", "t4", "wide", "f"];

await withEditorBrowser(async ({ page, errors }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = new URL(page.url()).origin;
  const url = `${origin}/fixtures/wysiwyg-sample`;
  await page.route(url, (r) => r.fulfill({ contentType: "text/html", body: PAGE }));

  const trigger = page.getByTestId("titlebar-browser-button");
  await trigger.click();
  const drawer = page.getByTestId("voo-browser-drawer");
  await drawer.waitFor();

  const urlInput = drawer.locator('input[type="text"]');
  await urlInput.fill(url);
  await urlInput.press("Enter");
  await page.frameLocator('[data-testid="voo-browser-drawer"] iframe').locator("#f").waitFor();

  async function verifyImport(phaseLabel, isWide) {
    await page.waitForTimeout(400);
    const beforeCount = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
    // Trigger Full Page Import via direct toolbar button (visible on toolbar)
    await drawer.getByRole("button", { name: /Import Page|导入整页/i }).click();

    await page.waitForFunction(
      (n) => window.__vooEditor.getDocument().nodes.length > n,
      beforeCount,
      { timeout: 15000 },
    );
    await page.waitForTimeout(400);

    // Source coordinates from iframe
    const src = await page
      .frameLocator('[data-testid="voo-browser-drawer"] iframe')
      .locator("body")
      .evaluate((_, ids) => {
        const out = {
          vw: window.innerWidth,
          sh: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
          els: {},
        };
        for (const id of ids) {
          const r = document.getElementById(id).getBoundingClientRect();
          out.els[id] = [Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.width), Math.round(r.height)];
        }
        return out;
      }, SAMPLE_IDS);

    // Imported nodes on canvas
    const imported = await page.evaluate(() => {
      const doc = window.__vooEditor.getDocument();
      const roots = doc.nodes.filter((n) => !n.parentId && n.name === "WYSIWYG Position Test");
      const frame = roots[roots.length - 1];
      const children = doc.nodes.filter((n) => n.parentId === frame.id);

      const map = {};
      for (const child of children) {
        if (child.name && !map[child.name]) {
          map[child.name] = [
            Math.round(child.x - frame.x),
            Math.round(child.y - frame.y),
            Math.round(child.width),
            Math.round(child.height),
          ];
        }
      }
      return {
        frame: {
          isFrame: frame.isFrame,
          width: Math.round(frame.width),
          height: Math.round(frame.height),
        },
        elements: map,
      };
    });

    // 1. Frame bounds must equal iframe viewport and scrollHeight
    assert.equal(imported.frame.isFrame, true, `${phaseLabel}: Frame must have isFrame=true`);
    assert.equal(imported.frame.width, src.vw, `${phaseLabel}: Frame width must match viewport width`);
    assert.equal(imported.frame.height, src.sh, `${phaseLabel}: Frame height must match scrollHeight`);

    // 2. Check 8 sample elements for x, y, width, height with <= 1px delta
    for (const id of ["h", "t1", "t2", "t4", "wide", "f"]) {
      const srcBox = src.els[id];
      const importedBox = imported.elements[id];
      assert.ok(importedBox, `${phaseLabel}: Element #${id} must be imported`);
      for (let i = 0; i < 4; i++) {
        const diff = Math.abs(srcBox[i] - importedBox[i]);
        assert.ok(
          diff <= 1,
          `${phaseLabel}: Element #${id} component [${i}] expected ${srcBox[i]}, got ${importedBox[i]} (diff: ${diff} > 1px)`,
        );
      }
    }
  }

  // Phase A: default width
  await verifyImport("Phase A (default width)", false);

  // Resize drawer by dragging resizer
  const resizer = page.getByTestId("browser-drawer-resizer");
  const hb = await resizer.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 250, hb.y + hb.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Phase B: wider drawer
  await verifyImport("Phase B (expanded width)", true);

  // Verify non-intersecting placement when a Frame already exists in project
  const frames = await page.evaluate(() => {
    const doc = window.__vooEditor.getDocument();
    return doc.nodes.filter((n) => !n.parentId && (n.isFrame || n.frame));
  });
  assert.ok(frames.length >= 2, "Expected at least 2 top-level frames after sequential full-page imports");
  const prevFrame = frames[frames.length - 2];
  const newFrame = frames[frames.length - 1];
  const intersects = !(
    prevFrame.x + prevFrame.width <= newFrame.x ||
    newFrame.x + newFrame.width <= prevFrame.x ||
    prevFrame.y + prevFrame.height <= newFrame.y ||
    newFrame.y + newFrame.height <= prevFrame.y
  );
  assert.equal(intersects, false, "New Frame must not intersect existing Frame");
  assert.ok(
    newFrame.x >= prevFrame.x + prevFrame.width + 80,
    `New Frame (x=${newFrame.x}) must be placed at least 80px to the right of existing Frame (right=${prevFrame.x + prevFrame.width})`,
  );

  assert.deepEqual(errors, []);
  console.log("WYSIWYG browser full-page import element position parity (<=1px) passed.");
});
