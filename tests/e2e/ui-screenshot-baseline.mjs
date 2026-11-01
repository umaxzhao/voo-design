// Screenshot baselines for UI states. Uses only Node's zlib so no image
// dependency is added; the pixel tolerance comes from the shared canvas
// comparison so antialiasing noise is treated the same way everywhere.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { compareRasterPixels } from "./canvas-pixel-comparison.mjs";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// Fraction of pixels allowed to differ beyond antialias tolerance before a
// state counts as visually changed. Repeated runs on one machine measured up
// to 0.02% (first-frame raster noise); a 2px top-bar shift changes ~0.12%.
const MAX_CHANGED_RATIO = 0.0005;

/** Decode an 8-bit, non-interlaced RGB/RGBA PNG (what Chromium writes). */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Not a PNG");
  let width = 0, height = 0, colorType = 0;
  const data = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); colorType = body[9];
      if (body[8] !== 8 || body[12] !== 0 || ![2, 6].includes(colorType)) throw new Error("Unsupported PNG format");
    } else if (type === "IDAT") data.push(body);
    offset += length + 12;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
        predictor = a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      row[i] = (line[i] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      pixels.set(row.subarray(x * channels, x * channels + 3), (y * width + x) * 4);
      pixels[(y * width + x) * 4 + 3] = channels === 4 ? row[x * channels + 3] : 255;
    }
    previous = row;
  }
  return { width, height, pixels };
}

function chunk(type, body) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length, 0);
  header.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([header, body, crc]);
}

/** Encode RGBA pixels as PNG, used for the diff image only. */
export function encodePng({ width, height, pixels }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) Buffer.from(pixels.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Red marks every pixel that differs; the baseline is dimmed underneath. */
function diffImage(expected, actual) {
  const pixels = new Uint8Array(expected.pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const same = expected.pixels[i] === actual.pixels[i] && expected.pixels[i + 1] === actual.pixels[i + 1]
      && expected.pixels[i + 2] === actual.pixels[i + 2];
    const gray = (expected.pixels[i] + expected.pixels[i + 1] + expected.pixels[i + 2]) / 12;
    pixels.set(same ? [gray, gray, gray, 255] : [255, 0, 64, 255], i);
  }
  return { width: expected.width, height: expected.height, pixels };
}

/**
 * Compare a screenshot to `<baselineDir>/<name>.png`. A missing baseline (or
 * UPDATE_UI_BASELINES=1) writes one and reports `created`, never `passed`,
 * because nothing was compared.
 */
export async function compareScreenshot(screenshot, { name, baselineDir, outputDir }) {
  const baselinePath = join(baselineDir, `${name}.png`);
  if (process.env.UPDATE_UI_BASELINES === "1" || !existsSync(baselinePath)) {
    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, screenshot);
    return { name, status: "created", baselinePath };
  }
  const expected = decodePng(await readFile(baselinePath));
  const actual = decodePng(screenshot);
  const actualPath = join(outputDir, `${name}.actual.png`);
  const diffPath = join(outputDir, `${name}.diff.png`);
  const save = async () => {
    await mkdir(outputDir, { recursive: true });
    await writeFile(actualPath, screenshot);
  };
  if (expected.width !== actual.width || expected.height !== actual.height) {
    await save();
    return { name, status: "changed", reason: `size ${expected.width}x${expected.height} -> ${actual.width}x${actual.height}`, actualPath };
  }
  const result = compareRasterPixels(expected.pixels, actual.pixels, expected.width);
  const ratio = result.unmatchedPixels / (expected.width * expected.height);
  if (ratio <= MAX_CHANGED_RATIO) return { name, status: "passed", ratio };
  await save();
  await writeFile(diffPath, encodePng(diffImage(expected, actual)));
  return { name, status: "changed", reason: `${(ratio * 100).toFixed(2)}% pixels changed`, actualPath, diffPath };
}
