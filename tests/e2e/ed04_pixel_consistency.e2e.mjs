// Browser pixel gate for ED-04's GL spatial filters.
// Run with: node tests/e2e/ed04_pixel_consistency.e2e.mjs
import { spawn } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GL_UNAVAILABLE = "WebGL2 spatial filter path unavailable";

async function reachable(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

async function reserveUrl() {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()),
  );
  return `http://127.0.0.1:${port}/?voo-test=1`;
}

async function startVite(url) {
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "--host", "127.0.0.1", "--port", new URL(url).port, "--strictPort"],
    { cwd: ROOT, detached: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  child.on("error", () => {});
  child.stderr?.on("data", chunk => process.stderr.write(chunk));
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && child.exitCode === null) {
    if (await reachable(url)) return child;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  stopProcess(child);
  throw new Error(`Vite did not start at ${url}`);
}

function stopProcess(child) {
  if (!child) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch { /* Already stopped. */ }
  }
}

let child = null;
let browser = null;
let exitCode = 1;
try {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("Playwright is unavailable; install it and Chromium to run this test.");
  }

  const explicitUrl = process.env.VOO_URL;
  let url = explicitUrl && await reachable(explicitUrl) ? explicitUrl : null;
  if (!url) {
    url = explicitUrl || await reserveUrl();
    child = await startVite(url);
  }

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__vooEditor), null, { timeout: 60000 });

  const result = await page.evaluate(async () => {
    const width = 64;
    const height = 64;
    const { createAdjustmentRenderer } = await import("/src/canvas/editor/gl_adjustments.js");
    const { applyAdjustments } = await import("/src/canvas/editor/cpu_adjustments_runner.js");
    const { createDefaultAdjustments } = await import("/src/canvas/editor/scene_model.js");
    const renderer = createAdjustmentRenderer();
    if (!renderer.isAvailable()) return { unavailable: true };

    // Fixed, opaque, non-periodic RGB pattern exercises edges and smooth areas.
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const context = source.getContext("2d", { willReadFrequently: true });
    const input = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        input.data[offset] = (x * 17 + y * 3 + ((x ^ y) * 7)) & 255;
        input.data[offset + 1] = (x * 5 + y * 19 + ((x * y) % 251)) & 255;
        input.data[offset + 2] = (x * 11 + y * 13 + ((x + y) % 97) * 2) & 255;
        input.data[offset + 3] = 255;
      }
    }
    context.putImageData(input, 0, 0);

    const cases = [
      { kind: "highPass", value: 45 },
      { kind: "clarity", value: 38 },
      { kind: "motionBlur", value: 42, angle: 31 },
    ];
    const toPixels = (canvas) => {
      const copy = document.createElement("canvas");
      copy.width = width;
      copy.height = height;
      const copyContext = copy.getContext("2d", { willReadFrequently: true });
      copyContext.drawImage(canvas, 0, 0, width, height);
      return copyContext.getImageData(0, 0, width, height).data;
    };
    const differences = [];
    for (const testCase of cases) {
      const adjustments = createDefaultAdjustments();
      adjustments[testCase.kind] = {
        ...adjustments[testCase.kind],
        enabled: true,
        value: testCase.value,
        ...(testCase.kind === "motionBlur" ? { angle: testCase.angle } : {}),
      };
      // Fresh source identities prevent the renderer's WeakMap cache from
      // allowing one filter's pixels to stand in for another's.
      const glSource = document.createElement("canvas");
      glSource.width = width;
      glSource.height = height;
      glSource.getContext("2d").putImageData(input, 0, 0);
      const glCanvas = renderer.render({
        source: glSource,
        adjustments,
        width,
        height,
      });
      if (!glCanvas) return { unavailable: true };

      const cpuSource = document.createElement("canvas");
      cpuSource.width = width;
      cpuSource.height = height;
      cpuSource.getContext("2d").putImageData(input, 0, 0);
      const cpuCanvas = applyAdjustments(cpuSource, adjustments, {
        targetWidth: width,
        targetHeight: height,
      });
      if (!cpuCanvas || cpuCanvas === cpuSource) {
        throw new Error(`CPU path did not render ${testCase.kind}`);
      }

      // The GL result is a WebGL canvas, which has no 2D context: copy it into
      // a 2D canvas in the same task so the drawing buffer is still valid.
      const glPixels = toPixels(glCanvas);
      const cpuPixels = toPixels(cpuCanvas);
      let maxDelta = 0;
      for (let index = 0; index < glPixels.length; index++) {
        maxDelta = Math.max(maxDelta, Math.abs(glPixels[index] - cpuPixels[index]));
      }
      differences.push({ filter: testCase.kind, maxChannelDelta: maxDelta });
    }
    renderer.dispose();
    return { differences };
  });

  if (result.unavailable) {
    process.stderr.write(`${GL_UNAVAILABLE}\n`);
    exitCode = 2;
  } else {
    for (const difference of result.differences) {
      process.stdout.write(`${difference.filter}: max channel delta ${difference.maxChannelDelta}\n`);
    }
    exitCode = result.differences.some(difference => difference.maxChannelDelta > 3) ? 1 : 0;
  }
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  stopProcess(child);
  process.exitCode = exitCode;
}
