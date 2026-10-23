import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';
import { generateNotices, writeNotices } from '../../scripts/generate-third-party-notices.mjs';
it('collects transitive production licenses, deduplicates and writes renderer assets', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'voo-notices-'));
  try {
    const pkg = async (dir, data) => { await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(data)); };
    await pkg(root, { dependencies: { a: '1', b: '1' }, devDependencies: { unused: '1' } });
    await pkg(path.join(root, 'node_modules/a'), { name: 'a', version: '1', license: 'MIT', dependencies: { b: '1' }, optionalDependencies: { absent: '1' } });
    await pkg(path.join(root, 'node_modules/b'), { name: 'b', version: '2', license: 'BSD-3-Clause' });
    await fs.writeFile(path.join(root, 'node_modules/a/LICENSE'), 'MIT text');
    for (const file of ['LICENSE', 'EULA.md']) await fs.writeFile(path.join(root, file), file);
    const notices = await generateNotices(root);
    expect(notices).toHaveLength(2); expect(notices[0]).toEqual({ name: 'a', version: '1', license: 'MIT', licenseText: 'MIT text' });
    await writeNotices(root);
    expect(JSON.parse(await fs.readFile(path.join(root, 'public/THIRD_PARTY_NOTICES.json'), 'utf8'))).toEqual(notices);
    await fs.rm(path.join(root, 'node_modules/b'), { recursive: true });
    await expect(generateNotices(root)).rejects.toThrow('Missing production dependency');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
