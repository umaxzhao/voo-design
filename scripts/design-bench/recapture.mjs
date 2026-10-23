#!/usr/bin/env node
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

// Dependency-free PNG encoder: filter-free RGBA scanlines in stored DEFLATE blocks.
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(body.length + 8);
  result.writeUInt32BE(data.length);
  body.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
function png(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}
function color(value, fallback) {
  if (value && typeof value === 'object') {
    if ('r' in value) {
      const scale = Math.max(value.r, value.g, value.b) <= 1 ? 255 : 1;
      return [value.r * scale, value.g * scale, value.b * scale, value.a ?? 1];
    }
    return color(value.color, fallback);
  }
  if (value === 'transparent' || value === 'none') return [0, 0, 0, 0];
  if (typeof value !== 'string') return fallback;
  let hex = value.replace(/^#/, '');
  if (/^[\da-f]{3,4}$/i.test(hex)) hex = [...hex].map(c => c + c).join('');
  if (/^[\da-f]{6}([\da-f]{2})?$/i.test(hex))
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1);
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)] : fallback;
}
function render(doc) {
  if (!Array.isArray(doc.nodes)) throw new Error('Document nodes must be a flat array');
  const root = doc.nodes.find(n => !n.parentId && (n.isFrame || n.frame || n.kind === 'frame' || n.containerType === 'frame'));
  const w = Number(root?.width ?? doc.width ?? doc.w), h = Number(root?.height ?? doc.height ?? doc.h);
  if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h))) throw new Error('Invalid document dimensions');
  const scale = 960 / Math.max(w, h);
  const width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
  const pixels = Buffer.alloc(width * height * 4, 255);
  const byId = new Map(doc.nodes.map(n => [n.id, n]));
  for (const node of doc.nodes) {
    let ancestor = node, opacity = 1;
    const seen = new Set();
    while (ancestor) {
      if (seen.has(ancestor)) throw new Error('Cyclic node parent hierarchy');
      seen.add(ancestor);
      opacity *= ancestor.visible === false ? 0 : Math.max(0, Math.min(1, ancestor.opacity ?? 1));
      ancestor = byId.get(ancestor.parentId);
    }
    if (!opacity) continue;
    // Editor nodes retain absolute canvas coordinates even when grouped.
    const x = (Number(node.x ?? 0) - Number(root?.x ?? 0)) * scale;
    const y = (Number(node.y ?? 0) - Number(root?.y ?? 0)) * scale;
    const nw = Number(node.width) * scale, nh = Number(node.height) * scale;
    if (![x, y, nw, nh].every(Number.isFinite) || nw <= 0 || nh <= 0) continue;
    const text = node.kind === 'text';
    const fill = node.fill ?? node.fills?.find(f => f.visible !== false);
    const rgba = text ? [65, 65, 65, 1] : color(fill, [210, 210, 210, 1]);
    const alpha = Math.max(0, Math.min(1, rgba[3] * opacity));
    const barHeight = text ? Math.min(nh, Math.max(2, nh * 0.25)) : nh;
    const top = text ? y + (nh - barHeight) / 2 : y;
    for (let py = Math.max(0, Math.floor(top)); py < Math.min(height, Math.ceil(top + barHeight)); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(width, Math.ceil(x + nw)); px++) {
        const offset = (py * width + px) * 4;
        for (let c = 0; c < 3; c++) pixels[offset + c] = Math.round(rgba[c] * alpha + pixels[offset + c] * (1 - alpha));
      }
    }
  }
  return png(width, height, pixels);
}

export async function recapture({ label, tasks, scoreOnly = false } = {}) {
  if (!['before', 'after'].includes(label)) throw new Error('--label must be before or after');
  const directory = `/workspace/tmp/design-bench/${label}`;
  const manifest = `${directory}/scores.json`;
  const scores = JSON.parse(await readFile(manifest, 'utf8'));
  const ids = tasks ?? scores.tasks.map(task => task.id);
  if (ids.some(id => !/^[\w-]+$/.test(id))) throw new Error('Invalid task ID');
  for (const id of ids) {
    const screenshot = `${directory}/${id}.png`;
    try {
      let exists = false;
      if (scoreOnly) {
        try { await access(screenshot); exists = true; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (!exists) await writeFile(screenshot, render(JSON.parse(await readFile(`${directory}/${id}.json`, 'utf8'))));
      const record = scores.tasks.find(task => task.id === id);
      if (record) record.screenshot = screenshot;
      else scores.tasks.push({ id, document: `${directory}/${id}.json`, screenshot });
      await writeFile(manifest, `${JSON.stringify(scores, null, 2)}\n`);
    } catch (error) { console.error(`Failed to recapture ${id}:`, error); }
  }
  return scores;
}

// Scoring workflows preserve existing PNGs and synthesize only missing previews.
export const scoreOnly = options => recapture({ ...options, scoreOnly: true });
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--label=')) options.label = arg.slice(8);
    else if (arg.startsWith('--tasks=')) options.tasks = arg.slice(8).split(',');
    else if (arg === '--score-only') options.scoreOnly = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  recapture(options).catch(error => { console.error(error); process.exitCode = 1; });
}
