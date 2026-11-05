import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { editorArtifactPath } from "./editor-test-artifacts.mjs";

const MINT = { r: 178, g: 255, b: 214 };

function mintTolerance(pixel) {
  return Math.abs(pixel.r - MINT.r) <= 8 && Math.abs(pixel.g - MINT.g) <= 8 && Math.abs(pixel.b - MINT.b) <= 8;
}

/** The 2px stroke is antialiased on the 16px arc; a corner pixel may be a blend. */
function mintCornerTolerance(pixel) {
  return mintTolerance(pixel) || (
    pixel.g >= 180 &&
    pixel.g - pixel.r >= 25 &&
    pixel.g - pixel.b >= 20
  );
}

async function readFramePixels(page) {
  const shell = await page.getByTestId("editor-shell").boundingBox();
  assert.ok(shell && shell.width > 0 && shell.height > 0, "editor shell must be laid out");
  const screenshot = await page.screenshot();
  const pixels = await page.evaluate(async ({ data, shell }) => {
    const image = new Image();
    image.src = "data:image/png;base64," + data;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const at = (x, y) => {
      const [r, g, b, a] = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return { r, g, b, a };
    };
    const isMint = (pixel) =>
      Math.abs(pixel.r - 178) <= 8 && Math.abs(pixel.g - 255) <= 8 && Math.abs(pixel.b - 214) <= 8;
    const left = { x: shell.x, y: shell.y + shell.height / 2 };
    const right = { x: shell.x + shell.width - 1, y: left.y };
    const run = (start, step, limit) => {
      let length = 0;
      for (let i = 0; i < limit; i += 1) {
        const pixel = at(start.x + step * i, start.y);
        if (!isMint(pixel)) break;
        length += 1;
      }
      return length;
    };
    // A 16px radius border band sits on a 14-16px arc. Scan the diagonal just
    // inside each corner: the stroke is antialiased, so require at least one
    // mint pixel on the arc rather than a single exact sample. Sampling the
    // padded 7px interior would only read the content and prove nothing.
    const diagonalScan = (x, y, sx, sy) => {
      const samples = [];
      for (let offset = 2; offset <= 10; offset += 1) {
        samples.push(at(x + sx * offset, y + sy * offset));
      }
      return samples;
    };
    const corners = {
      topLeft: diagonalScan(shell.x, shell.y, 1, 1),
      topRight: diagonalScan(shell.x + shell.width, shell.y, -1, 1),
      bottomLeft: diagonalScan(shell.x, shell.y + shell.height, 1, -1),
      bottomRight: diagonalScan(shell.x + shell.width, shell.y + shell.height, -1, -1),
    };
    const top = { x: shell.x + shell.width / 2, y: shell.y };
    const bottom = { x: top.x, y: shell.y + shell.height - 1 };
    const verticalRun = (start, step) => {
      let n = 0;
      for (let i = 0; i < 8; i += 1) {
        if (!isMint(at(start.x, start.y + step * i))) break;
        n += 1;
      }
      return n;
    };
    return {
      rect: shell,
      leftRun: run(left, 1, 20),
      rightRun: run(right, -1, 20),
      topRun: verticalRun(top, 1),
      bottomRun: verticalRun(bottom, -1),
      justInsideLeft: at(shell.x + 2, left.y),
      corners,
    };
  }, { data: screenshot.toString("base64"), shell });
  return { shell, pixels };
}

await withEditorBrowser(async ({ page }) => {
  const checks = [];

  const computed = await page.evaluate(() => {
    const root = document.querySelector(".app-root-frame");
    const title = document.querySelector(".app-title-bar");
    const rootStyle = getComputedStyle(root);
    const titleStyle = getComputedStyle(title);
    return {
      rootPadding: rootStyle.padding,
      rootBackground: rootStyle.backgroundColor,
      titleBackground: titleStyle.backgroundImage,
      titleAppRegion: titleStyle.getPropertyValue("-webkit-app-region"),
    };
  });
  assert.equal(computed.rootPadding, "0px", "desktop frame must be flush with the window, not inset by safe-area padding");
  assert.equal(computed.rootBackground, "rgb(0, 0, 0)", "the window behind the rounded frame must stay black");
  assert.match(computed.titleBackground, /linear-gradient/, "the title bar must keep the hosted editor's mint gradient");
  assert.equal(computed.titleAppRegion, "drag", "the title bar must stay a native drag region");

  // Desktop only: the narrow (<768px) layout is not part of this Linux desktop
  // window fix and deliberately keeps the hosted editor's 24px frame.
  for (const [width, height] of [[1440, 900], [1024, 700]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    const { shell, pixels } = await readFramePixels(page);
    assert.equal(shell.x, 0, `${width}x${height}: frame must touch the left window edge`);
    assert.equal(shell.y, 40, `${width}x${height}: frame must start directly below the 40px title bar`);
    assert.equal(shell.x + shell.width, width, `${width}x${height}: frame must touch the right window edge`);
    assert.equal(shell.y + shell.height, height, `${width}x${height}: frame must touch the bottom window edge`);
    assert.equal(pixels.leftRun, 2, `${width}x${height}: left frame must be exactly one 2px mint line`);
    assert.equal(pixels.rightRun, 2, `${width}x${height}: right frame must be exactly one 2px mint line`);
    assert.equal(pixels.topRun, 2, `${width}x${height}: top frame must be exactly one 2px mint line`);
    assert.equal(pixels.bottomRun, 2, `${width}x${height}: bottom frame must be exactly one 2px mint line`);
    assert.equal(pixels.leftRun, pixels.rightRun, `${width}x${height}: left and right frame widths must match`);
    assert.equal(mintTolerance(pixels.justInsideLeft), false, `${width}x${height}: a second mint rail must not sit inside the 2px border`);
    for (const [name, samples] of Object.entries(pixels.corners)) {
      assert.ok(
        samples.some(mintCornerTolerance),
        `${width}x${height}: ${name} border must stay mint around the arc, got ${JSON.stringify(samples)}`,
      );
    }
    await page.screenshot({ path: editorArtifactPath(`voo-mint-frame-${width}x${height}.png`) });
    checks.push(`${width}x${height}: flush 2px symmetric frame, no inner rail, continuous corner stroke`);
  }
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
