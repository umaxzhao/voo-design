import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const artifacts = '/workspace/tmp/shots-export-verify';
const goldenDir = new URL('./golden/', import.meta.url);
let server, browser, page, samples;
beforeAll(async () => {
  await mkdir(artifacts, { recursive: true });
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/export/blank.html`);
  // A browser-served module keeps Vitest's SSR import rewrites out of page.evaluate.
  samples = await page.evaluate(`(async () => {
    const { exportComplexDesign } = await import('/tests/export/complex-design.js');
    return exportComplexDesign();
  })()`);
  for (const [name, value] of Object.entries(samples)) {
    if (name === 'svgUrl') continue;
    await writeFile(`${artifacts}/complex.${name}`, name === 'svg' ? value : Buffer.from(value.split(',')[1], 'base64'));
  }
});
afterAll(async () => { await browser?.close(); await server?.close(); });

async function pixels(url) {
  return page.evaluate(async (src) => {
    const image = new Image(); image.src = src; await image.decode();
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
    const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
    return { width: c.width, height: c.height, data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data), png: c.toDataURL() };
  }, url);
}
for (const format of ['png', 'svg']) {
  it(`${format}: gradients, embedded bitmap, translucent fill and multiline text match golden pixels`, async () => {
    const actual = await pixels(format === 'png' ? samples.png : samples.svgUrl);
    await writeFile(`${artifacts}/${format}-actual.png`, Buffer.from(actual.png.split(',')[1], 'base64'));
    expect([actual.width, actual.height]).toEqual([256, 160]);
    expect(actual.data[(20 * 256 + 12) * 4]).toBeGreaterThan(actual.data[(20 * 256 + 68) * 4]);
    expect(actual.data[(20 * 256 + 68) * 4 + 2]).toBeGreaterThan(actual.data[(20 * 256 + 12) * 4 + 2]);
    const pixel = (x, y) => actual.data.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4);
    expect(pixel(0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(20, 100)[3]).toBeCloseTo(64, 0);
    expect(pixel(184, 16)).toEqual([0, 255, 0, 128]);
    expect(pixel(104, 24)[0]).toBeGreaterThan(245); // off-centre radial origin
    expect(pixel(120, 24)[0]).toBeGreaterThan(100); // unequal ellipse radii
    expect(pixel(104, 40)[0]).toBeLessThan(5);
    const textAlpha = [];
    for (let y = 88; y < 148; y++) for (let x = 72; x < 248; x++) textAlpha.push(pixel(x, y)[3]);
    expect(Math.max(...textAlpha)).toBeGreaterThan(90);
    expect(Math.max(...textAlpha)).toBeLessThanOrEqual(102);
    const path = new URL(`complex-${format}.png`, goldenDir);
    if (process.env.UPDATE_EXPORT_GOLDENS === '1') await writeFile(path, Buffer.from(actual.png.split(',')[1], 'base64'));
    const golden = await pixels(`data:image/png;base64,${(await readFile(path)).toString('base64')}`);
    expect([golden.width, golden.height]).toEqual([actual.width, actual.height]);
    const diff = actual.data.map((v, i) => Math.abs(v - golden.data[i]));
    const changed = diff.filter(v => v > 2).length;
    if (changed) {
      await writeFile(`${artifacts}/${format}-actual.png`, Buffer.from(actual.png.split(',')[1], 'base64'));
      const diffUrl = await page.evaluate(({ data, width, height }) => {
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        const ctx = c.getContext('2d');
        const rgba = new Uint8ClampedArray(data);
        for (let i = 0; i < rgba.length; i += 4) { rgba[i] = Math.min(255, Math.max(...data.slice(i, i + 4)) * 8); rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 255; }
        ctx.putImageData(new ImageData(rgba, width, height), 0, 0); return c.toDataURL();
      }, { data: diff, width: actual.width, height: actual.height });
      await writeFile(`${artifacts}/${format}-diff.png`, Buffer.from(diffUrl.split(',')[1], 'base64'));
    }
    await writeFile(`${artifacts}/${format}-golden.png`, await readFile(path));
    expect(changed, `${format} channels differing by >2; see ${artifacts}`).toBe(0);
  });
}
it('PDF: valid signature, page size, xref and lossless RGB/alpha image content', async () => {
  const bytes = Buffer.from(samples.pdf.split(',')[1], 'base64');
  const pdf = bytes.toString('latin1');
  expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
  expect(pdf).toContain('/MediaBox [0 0 192 120]');
  expect(pdf).toContain('/SMask 6 0 R');
  expect(pdf).toContain('/Im0 Do');
  const xref = Number(/startxref\n(\d+)/.exec(pdf)[1]);
  expect(pdf.slice(xref, xref + 4)).toBe('xref');
  for (const offset of pdf.slice(xref).matchAll(/(\d{10}) 00000 n/g)) expect(pdf.slice(Number(offset[1]))).toMatch(/^\d 0 obj/);
  const source = (await pixels(samples.png)).data;
  for (const [id, channels] of [[4, 3], [6, 1]]) {
    const start = pdf.indexOf(`${id} 0 obj\n`);
    const stream = pdf.indexOf('stream\n', start) + 7;
    const length = Number(/\/Length (\d+)/.exec(pdf.slice(start, stream))[1]);
    const decoded = inflateSync(bytes.subarray(stream, stream + length));
    const expected = source.filter((_, i) => channels === 3 ? i % 4 !== 3 : i % 4 === 3);
    expect(decoded.equals(Buffer.from(expected))).toBe(true);
  }
});
