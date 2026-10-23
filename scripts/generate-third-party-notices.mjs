import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function generateNotices(root = process.cwd()) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const seen = new Set();
  const notices = [];
  async function visit(name, from) {
    let dir = from;
    let location;
    while (true) {
      const candidate = path.join(dir, 'node_modules', name);
      try { await fs.access(path.join(candidate, 'package.json')); location = await fs.realpath(candidate); break; } catch {}
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error(`Missing production dependency: ${name}`);
      dir = parent;
    }
    if (seen.has(location)) return;
    seen.add(location);
    const pkg = JSON.parse(await fs.readFile(path.join(location, 'package.json'), 'utf8'));
    const texts = [];
    for (const file of (await fs.readdir(location)).sort()) {
      if (/^(licen[sc]e|copying|notice)([.\-_]|$)/i.test(file) && (await fs.stat(path.join(location, file))).isFile()) {
        texts.push(await fs.readFile(path.join(location, file), 'utf8'));
      }
    }
    if (!texts.length && ['onnxruntime-web', 'onnxruntime-common'].includes(pkg.name)) {
      texts.push(await fs.readFile(new URL('./license-texts/onnxruntime.txt', import.meta.url), 'utf8'));
    }
    // Some published packages declare a license but omit its text. Include the
    // standard terms explicitly marked as a supplement, without inventing dates.
    if (!texts.length && pkg.license === 'MIT') {
      const mit = await fs.readFile(new URL('../LICENSE', import.meta.url), 'utf8');
      texts.push(`Standard MIT terms (package declares MIT; no license file supplied). Author: ${typeof pkg.author === 'string' ? pkg.author : pkg.author?.name || 'see package metadata'}\n\n${mit.slice(mit.indexOf('Permission is hereby granted'))}`);
    }
    if (!texts.length && pkg.license === 'ISC') {
      texts.push(await fs.readFile(new URL('./license-texts/ISC.txt', import.meta.url), 'utf8'));
    }
    notices.push({ name: pkg.name, version: pkg.version, license: pkg.license || 'UNDECLARED', licenseText: texts.join('\n\n') || 'No license text supplied by this package.' });
    for (const dep of Object.keys(pkg.dependencies || {}).sort()) await visit(dep, location);
    for (const dep of Object.keys(pkg.optionalDependencies || {}).sort()) {
      try { await visit(dep, location); } catch (error) { if (!error.message.startsWith('Missing production dependency:')) throw error; }
    }
  }
  for (const name of [...new Set([...Object.keys(manifest.dependencies || {}), ...(manifest.rendererDependencies || [])])].sort()) await visit(name, root);
  return notices.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}
export async function writeNotices(root = process.cwd()) {
  const output = path.join(root, 'public');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'THIRD_PARTY_NOTICES.json'), JSON.stringify(await generateNotices(root), null, 2) + '\n');
  for (const file of ['LICENSE', 'EULA.md']) await fs.copyFile(path.join(root, file), path.join(output, file));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await writeNotices();
