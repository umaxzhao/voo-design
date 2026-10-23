import { createPackage } from '@electron/asar';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyPackage } from '../../scripts/verify-package.mjs';

const roots = [];
async function fixture({ omit, extra, locales = ['en-US', 'zh-CN'] } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'voo-package-test-'));
  roots.push(root);
  const source = path.join(root, 'source');
  const app = path.join(root, 'app');
  const files = [
    'electron/main.cjs', 'electron/preload.cjs', 'dist/index.html',
    'dist/canvaskit.js', 'dist/canvaskit.wasm', 'dist/EULA.md',
    'dist/LICENSE', 'dist/THIRD_PARTY_NOTICES.json',
    'dist/ort/ort-wasm-simd-threaded.wasm', 'dist/ort/ort-wasm-simd-threaded.mjs',
    'dist/ort/ort-wasm-simd-threaded.jsep.wasm', 'dist/ort/ort-wasm-simd-threaded.jsep.mjs',
    'dist/fonts/inter.woff2', 'dist/fonts/zcool-kuaile.woff2',
    'dist/fonts/intel-one-mono-regular.woff2', 'dist/fonts/inter.OFL.txt',
    'node_modules/ws/package.json', 'node_modules/ws/index.js',
    ...(extra ? [extra] : []),
  ];
  for (const file of files.filter(file => file !== omit)) {
    await mkdir(path.dirname(path.join(source, file)), { recursive: true });
    await writeFile(path.join(source, file), '{}');
  }
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ dependencies: { ws: '*' } }));
  await mkdir(path.join(app, 'resources'), { recursive: true });
  await mkdir(path.join(app, 'locales'));
  for (const locale of locales) await writeFile(path.join(app, 'locales', `${locale}.pak`), '');
  await createPackage(source, path.join(app, 'resources/app.asar'));
  return app;
}

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('shipped package inspection', () => {
  it('accepts runtime assets, production dependencies, and font licenses', async () => {
    expect(verifyPackage(await fixture()).locales).toEqual(['en-US.pak', 'zh-CN.pak']);
  });
  it.each([
    'dist/fonts/inter.ttf', 'dist/assets/editor.js.map', 'electron/tests/debug.js',
    'node_modules/vite/package.json', 'node_modules/js-yaml/dist/js-yaml.min.js',
    'node_modules/js-yaml/bin/js-yaml.js',
  ])('rejects unnecessary file %s in a real ASAR', async extra => {
    const app = await fixture({ extra });
    expect(() => verifyPackage(app)).toThrow('Development files in package');
  });
  it.each(['dist/ort/ort-wasm-simd-threaded.jsep.wasm', 'dist/fonts/inter.woff2', 'dist/EULA.md'])(
    'rejects removal of required asset %s', async omit => {
      const app = await fixture({ omit });
      expect(() => verifyPackage(app)).toThrow('Missing runtime asset');
    },
  );
  it('rejects missing runtime dependencies', async () => {
    const app = await fixture({ omit: 'node_modules/ws/package.json' });
    expect(() => verifyPackage(app)).toThrow('Missing runtime dependency: ws');
  });
  it('rejects both excess and missing locales', async () => {
    for (const locales of [['en-US'], ['en-US', 'zh-CN', 'fr']]) {
      const app = await fixture({ locales });
      expect(() => verifyPackage(app)).toThrow('Unexpected Electron locales');
    }
  });
});
