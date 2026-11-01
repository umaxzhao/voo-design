import { createPackage } from '@electron/asar';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { generateBundledNotices } from '../../scripts/bundled-third-party-notices.mjs';
import { verifyPackage, normalizeArchiveEntry } from '../../scripts/verify-package.mjs';

const roots = [];
async function fixture({ omit, extra, runtimeDependencies, missingEmbeddedNotice = false, locales = ['en-US', 'zh-CN'] } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'voo-package-test-'));
  roots.push(root);
  const source = path.join(root, 'source');
  const app = path.join(root, 'app');
  const files = [
    'electron/main.cjs', 'electron/preload.cjs', 'dist/index.html',
    'dist/canvaskit.js', 'dist/canvaskit.wasm', 'dist/EULA.md',
    'dist/LICENSE', 'dist/THIRD_PARTY_NOTICES.json', 'dist/NOTICE', 'NOTICE',
    'dist/ort/ort-wasm-simd-threaded.wasm', 'dist/ort/ort-wasm-simd-threaded.mjs',
    'dist/ort/ort-wasm-simd-threaded.jsep.wasm', 'dist/ort/ort-wasm-simd-threaded.jsep.mjs',
    'dist/assets/voo_engine_bg-fixture.wasm',
    'dist/fonts/inter.woff2', 'dist/fonts/zcool-kuaile.woff2',
    'dist/fonts/intel-one-mono-regular.woff2', 'dist/fonts/inter.OFL.txt',
    'node_modules/ws/package.json', 'node_modules/ws/index.js',
    ...(extra ? [extra] : []),
  ];
  for (const file of files.filter(file => file !== omit)) {
    await mkdir(path.dirname(path.join(source, file)), { recursive: true });
    await writeFile(path.join(source, file), '{}');
  }
  if (omit !== 'dist/THIRD_PARTY_NOTICES.json') {
    await writeFile(path.join(source, 'dist/THIRD_PARTY_NOTICES.json'), JSON.stringify(missingEmbeddedNotice ? [] : await generateBundledNotices()));
  }
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ dependencies: { ws: '*' } }));
  if (runtimeDependencies) await writeFile(path.join(source, 'node_modules/ws/package.json'), JSON.stringify({ dependencies: runtimeDependencies }));
  await mkdir(path.join(app, 'resources'), { recursive: true });
  for (const file of ['scripts/mcp-server.mjs', 'electron/mcp_server/tool_catalog.js', 'node_modules/ws/package.json', 'cordis.patch.yml']) {
    const target = path.join(app, 'resources/connector/voo', file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, '{}');
  }
  await mkdir(path.join(app, 'locales'));
  for (const locale of locales) await writeFile(path.join(app, 'locales', `${locale}.pak`), '');
  const archiveStream = await createPackage(source, path.join(app, 'resources/app.asar'));
  // asar 3 resolves with its writable stream after end() is queued. Wait for
  // flushing/close before inspecting bytes, especially under full-suite load.
  if (archiveStream) await finished(archiveStream);
  return app;
}

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('shipped package inspection', () => {
  it('normalizes native Windows and POSIX ASAR listings before enforcing the same required files', () => {
    expect(normalizeArchiveEntry('\\electron\\main.cjs')).toBe('electron/main.cjs');
    expect(normalizeArchiveEntry('/electron/main.cjs')).toBe('electron/main.cjs');
    expect(normalizeArchiveEntry('\\node_modules\\ws\\package.json')).toBe('node_modules/ws/package.json');
  });
  it('accepts runtime assets, production dependencies, and font licenses', async () => {
    expect(verifyPackage(await fixture()).locales).toEqual(['en-US.pak', 'zh-CN.pak']);
  });
  it.each([
    'dist/fonts/inter.ttf', 'dist/assets/editor.js.map', 'electron/tests/debug.js',
    'node_modules/vite/package.json', 'node_modules/js-yaml/dist/js-yaml.min.js',
    'node_modules/js-yaml/bin/js-yaml.js',
    'node_modules/ag-psd/.v8-cache/compiled.bin',
  ])('rejects unnecessary file %s in a real ASAR', async extra => {
    const app = await fixture({ extra });
    expect(() => verifyPackage(app)).toThrow('Development files in package');
  });
  it.each(['dist/assets/ort-duplicate.wasm', 'dist/ort/ort-wasm-simd-threaded.asyncify.wasm'])(
    'rejects extra WASM payload %s', async extra => {
      const app = await fixture({ extra });
      expect(() => verifyPackage(app)).toThrow('Unexpected WASM payload');
    },
  );
  it.each([
    { omit: 'dist/assets/voo_engine_bg-fixture.wasm' },
    { extra: 'dist/assets/voo_engine_bg-second.wasm' },
  ])('requires exactly one canvas engine WASM: %j', async options => {
    const app = await fixture(options);
    expect(() => verifyPackage(app)).toThrow('Expected exactly one native canvas engine WASM');
  });
  it.each(['dist/ort/ort-wasm-simd-threaded.jsep.wasm', 'dist/fonts/inter.woff2', 'dist/EULA.md', 'dist/NOTICE', 'NOTICE'])(
    'rejects removal of required asset %s', async omit => {
      const app = await fixture({ omit });
      expect(() => verifyPackage(app)).toThrow('Missing runtime asset');
    },
  );
  it('rejects missing embedded licenses in the actual ASAR', async () => {
    const app = await fixture({ missingEmbeddedNotice: true });
    expect(() => verifyPackage(app)).toThrow('Missing embedded component license');
  });
  it('rejects missing runtime dependencies', async () => {
    const app = await fixture({ omit: 'node_modules/ws/package.json' });
    expect(() => verifyPackage(app)).toThrow('Missing runtime dependency: ws');
  });
  it('rejects missing transitive runtime dependencies rather than checking only direct entries', async () => {
    const app = await fixture({ runtimeDependencies: { 'runtime-child': '*' } });
    expect(() => verifyPackage(app)).toThrow('Missing runtime dependency: runtime-child');
  });
  it('resolves nested transitive runtime dependencies inside the shipped ASAR', async () => {
    const app = await fixture({ runtimeDependencies: { 'runtime-child': '*' }, extra: 'node_modules/ws/node_modules/runtime-child/package.json' });
    expect(verifyPackage(app).archiveEntries).toBeGreaterThan(1);
  });
  it('rejects both excess and missing locales', async () => {
    for (const locales of [['en-US'], ['en-US', 'zh-CN', 'fr']]) {
      const app = await fixture({ locales });
      expect(() => verifyPackage(app)).toThrow('Unexpected Electron locales');
    }
  });
  it('rejects a missing prebuilt connector in the real package layout', async () => {
    const app = await fixture();
    await rm(path.join(app, 'resources/connector'), { recursive: true });
    expect(() => verifyPackage(app)).toThrow('Missing prebuilt connector');
  });
  it('inspects macOS ASAR and framework locales rather than Linux paths', async () => {
    const app = await fixture();
    const mac = `${app}.app`;
    const { cp } = await import('node:fs/promises');
    await cp(path.join(app, 'resources'), path.join(mac, 'Contents/Resources'), { recursive: true });
    const locales = path.join(mac, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources');
    for (const name of ['en.lproj', 'zh_CN.lproj', 'en_FEMININE.lproj']) await mkdir(path.join(locales, name), { recursive: true });
    expect(verifyPackage(mac).locales).toContain('zh_CN.lproj');
    await mkdir(path.join(locales, 'fr.lproj'));
    expect(() => verifyPackage(mac)).toThrow('Unexpected Electron locales');
  });
});
