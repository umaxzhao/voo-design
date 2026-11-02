import assert from "node:assert/strict";
import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument } from "./ui-responsive-editor-helpers.mjs";

// T02 / UF12 regression: the centre cross of the constraints diagram must read as one
// continuous cross (strokes meet at the diagram centre) while the two hit targets stay
// separate and focusable. Measured from real layout boxes in Chromium, not from class names.

const rectOf = (box) => ({ left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height });
const overlapArea = (a, b) => {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};

await withEditorBrowser(async ({ page }) => {
  await seedResponsiveDocument(page);

  const diagram = await page.getByTestId("editor-constraints-diagram").boundingBox();
  assert.ok(diagram, "constraints diagram must be visible");
  const centre = { x: diagram.x + diagram.width / 2, y: diagram.y + diagram.height / 2 };

  const vertical = page.getByTestId("editor-constraints-center-vertical");
  const horizontal = page.getByTestId("editor-constraints-center-horizontal");
  const vStroke = await vertical.locator("span[aria-hidden='true']").boundingBox();
  const hStroke = await horizontal.locator("span[aria-hidden='true']").boundingBox();
  assert.ok(vStroke && hStroke, "both centre strokes must render");

  const vCenterX = vStroke.x + vStroke.width / 2;
  const hCenterY = hStroke.y + hStroke.height / 2;
  const tolerance = 0.5;
  assert.ok(Math.abs(vCenterX - centre.x) <= tolerance,
    `vertical centre stroke must sit on the diagram centre x: ${vCenterX} vs ${centre.x}`);
  assert.ok(Math.abs(hCenterY - centre.y) <= tolerance,
    `horizontal centre stroke must sit on the diagram centre y: ${hCenterY} vs ${centre.y}`);

  // The strokes must meet: the horizontal bar spans the vertical bar's x, and vice versa.
  assert.ok(hStroke.x <= vCenterX + tolerance && hStroke.x + hStroke.width >= vCenterX - tolerance,
    `horizontal centre stroke must cross the vertical stroke x (no gap): h=[${hStroke.x}, ${hStroke.x + hStroke.width}] v=${vCenterX}`);
  assert.ok(vStroke.y <= hCenterY + tolerance && vStroke.y + vStroke.height >= hCenterY - tolerance,
    `vertical centre stroke must cross the horizontal stroke y (no gap): v=[${vStroke.y}, ${vStroke.y + vStroke.height}] h=${hCenterY}`);

  // Hit targets stay separate: no pixel of one target is inside the other.
  const vTarget = await vertical.boundingBox();
  const hTarget = await horizontal.boundingBox();
  assert.equal(overlapArea(rectOf(vTarget), rectOf(hTarget)), 0, "centre hit targets must not overlap");
  assert.ok(vTarget.width >= 12 && vTarget.height >= 12 && hTarget.width >= 12 && hTarget.height >= 12,
    "centre hit targets must stay usable (>=12px)");

  // Keyboard focus is visible on the centre pins.
  await vertical.focus();
  const focusOutline = await vertical.evaluate((el) => getComputedStyle(el).outlineStyle);
  assert.notEqual(focusOutline, "none", "focused centre pin must show a visible outline");

  await page.screenshot({ path: editorArtifactPath("voo-constraint-cross.png") });
  console.log(`Constraint cross continuity: centre (${centre.x.toFixed(1)}, ${centre.y.toFixed(1)}), strokes meet, targets separate, focus outline ${focusOutline}.`);
});
