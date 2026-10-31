import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { FIGMA_SCHEMA_DEFLATE_BASE64 } from '../../src/canvas/figma/figma-schema-data.js';
import { generateNotices, writeNotices } from '../../scripts/generate-third-party-notices.mjs';
it('collects transitive production licenses, deduplicates and writes renderer assets', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'voo-notices-'));
  try {
    const pkg = async (dir, data) => { await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(data)); };
    await pkg(root, { dependencies: { a: '1', b: '1' }, devDependencies: { renderer: '1', unused: '1' }, rendererDependencies: ['renderer', 'a'] });
    await pkg(path.join(root, 'node_modules/a'), { name: 'a', version: '1', license: 'MIT', dependencies: { b: '1' }, optionalDependencies: { absent: '1' } });
    await pkg(path.join(root, 'node_modules/b'), { name: 'b', version: '2', license: 'BSD-3-Clause' });
    await pkg(path.join(root, 'node_modules/renderer'), { name: 'renderer', version: '1', license: 'BSD-3-Clause', dependencies: { b: '1' } });
    await fs.writeFile(path.join(root, 'node_modules/a/LICENSE'), 'MIT text');
    for (const file of ['LICENSE', 'EULA.md', 'NOTICE']) await fs.writeFile(path.join(root, file), file);
    const notices = await generateNotices(root);
    expect(notices).toHaveLength(5); expect(notices.find(notice => notice.name === 'a')).toEqual({ name: 'a', version: '1', license: 'MIT', licenseText: 'MIT text' });
    await writeNotices(root);
    expect(await fs.readFile(path.join(root, 'public/NOTICE'), 'utf8')).toBe('NOTICE');
    expect(JSON.parse(await fs.readFile(path.join(root, 'public/THIRD_PARTY_NOTICES.json'), 'utf8'))).toEqual(notices);
    await fs.rm(path.join(root, 'node_modules/b'), { recursive: true });
    await expect(generateNotices(root)).rejects.toThrow('Missing production dependency');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

it('ships full licenses for embedded schema and adapted design guidance', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'voo-bundled-notices-'));
  try {
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: {} }));
    const notices = await generateNotices(root);
    const schema = notices.find(notice => notice.name === 'openpencil-figma-schema');
    expect(schema).toMatchObject({
      license: 'MIT',
      version: 'f5bd2425b6491be58b43c398ac1343e4d8249fe6',
    });
    expect(schema.licenseText).toContain('Copyright (c) 2026 Danila Poyarkov');
    expect(schema.licenseText).toContain('IN NO EVENT SHALL THE');
    expect(schema.sourceUrl).toContain('open-pencil/open-pencil');
    // Any schema replacement must trigger a fresh source/license review.
    const digest = createHash('sha256').update(inflateRawSync(Buffer.from(FIGMA_SCHEMA_DEFLATE_BASE64, 'base64'))).digest('hex');
    expect(schema.contentSha256).toBe(digest);
    const design = notices.find(notice => notice.name === 'opendesign-layout-guidance');
    expect(design.license).toBe('Apache-2.0');
    expect(design.licenseText).toContain('4. Redistribution.');
    expect(design.licenseText).toContain('END OF TERMS AND CONDITIONS');
    expect(design.modifications).toContain('VOO');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
