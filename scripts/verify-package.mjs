import { listPackage, extractFile } from '@electron/asar';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const normalizeArchiveEntry = entry => entry.replaceAll('\\', '/').replace(/^\/+/, '');

function verifyRuntimeDependencies(archive, files) {
  const queue = ['package.json'];
  const visited = new Set();
  while (queue.length) {
    const manifestPath = queue.pop();
    if (visited.has(manifestPath)) continue;
    visited.add(manifestPath);
    const manifest = JSON.parse(extractFile(archive, manifestPath).toString());
    for (const name of Object.keys(manifest.dependencies || {})) {
      if (manifest.optionalDependencies?.[name]) continue;
      const segments = path.posix.dirname(manifestPath).split('/').filter(segment => segment !== '.');
      let found;
      while (!found) {
        const candidate = [...segments, 'node_modules', name, 'package.json'].join('/');
        if (files.has(candidate)) found = candidate;
        else if (!segments.length) throw new Error(`Missing runtime dependency: ${name} (required by ${manifestPath})`);
        else segments.pop();
      }
      queue.push(found);
    }
  }
}

// Inspect the shipped archive, rather than trusting glob configuration alone.
export function verifyPackage(appDir) {
  const mac = appDir.endsWith('.app');
  const resources = path.join(appDir, mac ? 'Contents/Resources' : 'resources');
  const archive = path.join(resources, 'app.asar');
  const files = new Set(listPackage(archive).map(normalizeArchiveEntry));
  const required = [
    'electron/main.cjs', 'electron/preload.cjs', 'dist/index.html',
    'dist/canvaskit.js', 'dist/canvaskit.wasm', 'dist/EULA.md',
    'dist/LICENSE', 'dist/THIRD_PARTY_NOTICES.json', 'dist/NOTICE', 'NOTICE',
    ...['wasm', 'mjs', 'jsep.wasm', 'jsep.mjs'].map(ext => `dist/ort/ort-wasm-simd-threaded.${ext}`),
    ...['inter', 'zcool-kuaile', 'intel-one-mono-regular'].map(font => `dist/fonts/${font}.woff2`),
  ];
  for (const file of required) {
    if (!files.has(file)) throw new Error(`Missing runtime asset: ${file}`);
  }
  const notices = JSON.parse(extractFile(archive, 'dist/THIRD_PARTY_NOTICES.json').toString());
  for (const [name, license, marker] of [
    ['openpencil-figma-schema', 'MIT', 'Copyright (c) 2026 Danila Poyarkov'],
    ['opendesign-layout-guidance', 'Apache-2.0', 'END OF TERMS AND CONDITIONS'],
  ]) {
    const notice = notices.find(entry => entry.name === name);
    if (notice?.license !== license || !notice.licenseText?.includes(marker)) {
      throw new Error(`Missing embedded component license: ${name}`);
    }
  }
  const wasm = [...files].filter(file => file.endsWith('.wasm'));
  const engineWasm = wasm.filter(file => /^dist\/assets\/voo_engine_bg-[\w-]+\.wasm$/.test(file));
  if (engineWasm.length !== 1) throw new Error('Expected exactly one native canvas engine WASM');
  const unexpectedWasm = wasm.filter(file => !required.includes(file) && !engineWasm.includes(file));
  if (unexpectedWasm.length) throw new Error(`Unexpected WASM payload: ${unexpectedWasm.join(', ')}`);
  verifyRuntimeDependencies(archive, files);
  const forbidden = [...files].filter(file =>
    /\.(?:map|ts|tsx)$/.test(file) ||
    /(?:^|\/)(?:tests?|__tests__|docs|examples?|benchmarks?|coverage|\.cache|\.v8-cache|\.nyc_output)(?:\/|$)/.test(file) ||
    /^dist\/fonts\/.*\.ttf$/.test(file) ||
    /^node_modules\/(?:electron|electron-builder|vite|vitest|react|onnxruntime-web)(?:\/|$)/.test(file) ||
    /^node_modules\/(?:js-yaml|semver)\/bin(?:\/|$)/.test(file) ||
    /^node_modules\/js-yaml\/dist\/.*\.js$/.test(file));
  if (forbidden.length) throw new Error(`Development files in package: ${forbidden.join(', ')}`);
  const localeDir = mac ? path.join(appDir, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources')
    : path.join(appDir, 'locales');
  const locales = readdirSync(localeDir).filter(name => name.endsWith(mac ? '.lproj' : '.pak')).sort();
  if (mac) {
    const baseLocales = locales.filter(name => !/_(?:FEMININE|MASCULINE|NEUTER)\.lproj$/.test(name));
    if (!baseLocales.includes('en.lproj') || !baseLocales.includes('zh_CN.lproj') ||
        baseLocales.some(name => !['en.lproj', 'en_US.lproj', 'zh_CN.lproj'].includes(name))) {
      throw new Error(`Unexpected Electron locales: ${locales.join(', ')}`);
    }
  } else if (locales.join(',') !== 'en-US.pak,zh-CN.pak') {
    throw new Error(`Unexpected Electron locales: ${locales.join(', ')}`);
  }
  for (const file of ['scripts/mcp-server.mjs', 'electron/mcp_server/tool_catalog.js', 'node_modules/ws/package.json', 'cordis.patch.yml']) {
    if (!existsSync(path.join(resources, 'connector/voo', file))) throw new Error(`Missing prebuilt connector: ${file}`);
  }
  return { archiveEntries: files.size, locales };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Package contents verified:', verifyPackage(path.resolve(process.argv[2] || 'release/linux-unpacked')));
}
