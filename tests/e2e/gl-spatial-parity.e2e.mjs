import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// Fixed high-contrast, asymmetric fixtures exercise edge replication and catch
// Y-flips. Raw RGBA is compared, including hidden RGB at fully transparent pixels.
const CASES = [
  { kind: "highPass", amount: 1 },
  { kind: "highPass", amount: 40 },
  { kind: "highPass", amount: 100 },
  { kind: "clarity", amount: 1 },
  { kind: "clarity", amount: 30 },
  { kind: "clarity", amount: -30 },
  { kind: "clarity", amount: 100 },
  { kind: "clarity", amount: -100 },
  { kind: "motionBlur", amount: 1, angle: 30 },
  { kind: "motionBlur", amount: 3.125, angle: 30 },
  ...[0, 30, 45, 60, 90, -30, -60, 135].map((angle) => ({ kind: "motionBlur", amount: 25, angle })),
  { kind: "motionBlur", amount: 100, angle: 30 },
  { kind: "motionBlur", amount: 100, angle: -60 },
  { kind: "highPass", amount: 1, live: true },
  { kind: "clarity", amount: -30, live: true },
  { kind: "motionBlur", amount: 25, angle: 30, live: true },
  { kind: "motionBlur", amount: 100, angle: -60, live: true },
  { kind: "highPass", amount: 100, naturalScale: 2 },
  { kind: "clarity", amount: -100, naturalScale: 2 },
  { kind: "motionBlur", amount: 25, angle: 60, naturalScale: 2 },
];

await withEditorBrowser(async ({ page }) => {
  const result = await page.evaluate(async (specs) => {
    const { createSpatialStage } = await import("/src/canvas/editor/gl_spatial.js");
    const cpu = await import("/src/canvas/editor/spatial_filter.js");
    const cases = [], renderers = [];
    for (const mixedAlpha of [false, true]) {
      const width = 31, height = 23;
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const gl = canvas.getContext("webgl2", {
        alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false,
      });
      if (!gl) throw new Error("GPU parity requires a real WebGL2 context; it must not silently skip");
      gl.disable(gl.DITHER); gl.disable(gl.BLEND);
      let bytes = 0;
      const stage = createSpatialStage(gl, {
        add: (n) => { bytes += n; }, remove: (n) => { bytes -= n; },
      });
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      renderers.push(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      const source = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        source[i] = x === 0 ? 255 : (x * 37 + y * 53) % 256;
        source[i + 1] = y === 0 ? 255 : (x * 17 + y * 71) % 256;
        source[i + 2] = (x * 97 + y * 13) % 256;
        source[i + 3] = mixedAlpha && (x + y * 3) % 17 === 0 ? 0 : mixedAlpha && (x + y) % 7 === 0 ? 128 : 255;
      }
      const flip = (data) => {
        const flipped = new Uint8Array(data.length);
        for (let y = 0; y < height; y += 1) {
          flipped.set(data.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
        }
        return flipped;
      };
      try {
        for (const spec of specs) {
          if (!stage.begin(width, height)) throw new Error("Shader compilation/framebuffer allocation failed");
          // Seed the stage's actual input attachment. finish() runs the exact
          // production programs and all real ping-pong passes before readback.
          const texture = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, flip(source));
          const naturalWidth = width * (spec.naturalScale ?? 1);
          const radius = cpu.scaledRadius(Math.abs(spec.amount), width, naturalWidth);
          const options = { width, height };
          if (spec.live) {
            options.liveFilters = [{ kind: spec.kind, radius, strength: spec.amount / 100 * 2, angle: spec.angle ?? 0 }];
          } else if (spec.kind === "highPass") options.highPassRadius = radius;
          else if (spec.kind === "clarity") { options.clarityRadius = radius; options.clarityStrength = spec.amount / 100 * 2; }
          else { options.motionBlurRadius = radius; options.motionBlurAngle = spec.angle; }
          stage.finish(options);
          const raw = new Uint8Array(source.length);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
          if (gl.getError() !== gl.NO_ERROR) throw new Error("Spatial GPU draw/readback returned a GL error");
          const gpu = flip(raw), expected = Uint8ClampedArray.from(source);
          if (spec.kind === "highPass") cpu.applyHighPass(expected, width, height, spec.amount, naturalWidth);
          else if (spec.kind === "clarity") cpu.applyClarity(expected, width, height, spec.amount, naturalWidth);
          else cpu.applyMotionBlur(expected, width, height, spec.amount, spec.angle, naturalWidth);
          let maxDifference = 0, visibleMaxDifference = 0, maxIndex = 0;
          let gpuChanged = false, cpuChanged = false, alphaPreserved = true;
          for (let i = 0; i < gpu.length; i += 1) {
            const difference = Math.abs(gpu[i] - expected[i]);
            if (difference > maxDifference) { maxDifference = difference; maxIndex = i; }
            const alphaIndex = Math.floor(i / 4) * 4 + 3;
            const visibleDifference = i % 4 === 3 ? difference
              : Math.abs(gpu[i] * gpu[alphaIndex] / 255 - expected[i] * expected[alphaIndex] / 255);
            visibleMaxDifference = Math.max(visibleMaxDifference, visibleDifference);
            gpuChanged ||= gpu[i] !== source[i]; cpuChanged ||= expected[i] !== source[i];
            if (i % 4 === 3) alphaPreserved &&= gpu[i] === source[i] && expected[i] === source[i];
          }
          const pixel = Math.floor(maxIndex / 4), offset = pixel * 4;
          cases.push({ ...spec, fixture: mixedAlpha ? "mixed-alpha" : "opaque", maxDifference, visibleMaxDifference,
            gpuChanged, cpuChanged, alphaPreserved, worst: { x: pixel % width, y: Math.floor(pixel / width),
              channel: maxIndex % 4, gpu: Array.from(gpu.slice(offset, offset + 4)), cpu: Array.from(expected.slice(offset, offset + 4)) } });
        }
      } finally {
        stage.dispose();
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      if (bytes !== 0) throw new Error(`Spatial target leak: ${bytes} bytes after dispose`);
    }
    return { cases, renderers, remainingSpatialBytes: 0 };
  }, CASES);

  for (const item of result.cases) {
    const details = JSON.stringify(item);
    assert.ok(item.maxDifference <= 3, `Raw RGBA parity exceeds 3: ${details}`);
    assert.ok(item.visibleMaxDifference <= 3, `Visible RGBA parity exceeds 3: ${details}`);
    assert.equal(item.gpuChanged, item.cpuChanged, `Unexpected no-op/filter result: ${details}`);
    assert.equal(item.alphaPreserved, true, `Spatial filter changed original alpha: ${details}`);
  }
  const passed = [];
  for (const fixture of ["opaque", "mixed-alpha"]) for (const kind of ["highPass", "clarity", "motionBlur"]) {
    const group = result.cases.filter((item) => item.fixture === fixture && item.kind === kind);
    passed.push(`${kind}/${fixture}: real WebGL2 raw and visible RGBA difference <=3 across ${group.length} edge/radius/angle cases`);
  }
  console.log(JSON.stringify({ passed, ...result }, null, 2));
});
