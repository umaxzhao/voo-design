import { listPackage, extractFile } from '@electron/asar';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Inspect the shipped archive, rather than trusting glob configuration alone.
export function verifyPackage(appDir) {
  const archive = path.join(appDir, 'resources/app.asar');
  const files = new Set(listPackage(archive).map(name => name.replace(/^\//, '')));
  const required = [
    'electron/main.cjs', 'electron/preload.cjs', 'dist/index.html',
    'dist/canvaskit.js', 'dist/canvaskit.wasm', 'dist/EULA.md',
    'dist/LICENSE', 'dist/THIRD_PARTY_NOTICES.json',
    ...['wasm', 'mjs', 'jsep.wasm', 'jsep.mjs'].map(ext => `dist/ort/ort-wasm-simd-threaded.${ext}`),
    ...['inter', 'zcool-kuaile', 'intel-one-mono-regular'].map(font => `dist/fonts/${font}.woff2`),
  ];
  for (const file of required) {
    if (!files.has(file)) throw new Error(`Missing runtime asset: ${file}`);
  }
  const wasm = [...files].filter(file => file.endsWith('.wasm'));
  const engineWasm = wasm.filter(file => /^dist\/assets\/voo_engine_bg-[\w-]+\.wasm$/.test(file));
  if (engineWasm.length !== 1) throw new Error('Expected exactly one native canvas engine WASM');
  const unexpectedWasm = wasm.filter(file => !required.includes(file) && !engineWasm.includes(file));
  if (unexpectedWasm.length) throw new Error(`Unexpected WASM payload: ${unexpectedWasm.join(', ')}`);
  const manifest = JSON.parse(extractFile(archive, 'package.json').toString());
  for (const name of Object.keys(manifest.dependencies || {})) {
    if (!files.has(`node_modules/${name}/package.json`)) throw new Error(`Missing runtime dependency: ${name}`);
  }
  const forbidden = [...files].filter(file =>
    /\.(?:map|ts|tsx)$/.test(file) ||
    /(?:^|\/)(?:tests?|__tests__|docs|examples?|benchmarks?|coverage|\.cache|\.v8-cache|\.nyc_output)(?:\/|$)/.test(file) ||
    /^dist\/fonts\/.*\.ttf$/.test(file) ||
    /^node_modules\/(?:electron|electron-builder|vite|vitest|react|onnxruntime-web)(?:\/|$)/.test(file) ||
    /^node_modules\/(?:js-yaml|semver)\/bin(?:\/|$)/.test(file) ||
    /^node_modules\/js-yaml\/dist\/.*\.js$/.test(file));
  if (forbidden.length) throw new Error(`Development files in package: ${forbidden.join(', ')}`);
  const locales = readdirSync(path.join(appDir, 'locales')).filter(name => name.endsWith('.pak')).sort();
  if (locales.join(',') !== 'en-US.pak,zh-CN.pak') throw new Error(`Unexpected Electron locales: ${locales.join(', ')}`);
  return { archiveEntries: files.size, locales };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Package contents verified:', verifyPackage(path.resolve(process.argv[2] || 'release/linux-unpacked')));
}
