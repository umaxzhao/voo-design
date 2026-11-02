import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareAppImageCompression, shouldOptimizeAppImage } from '../../scripts/appimage-compression.mjs';

describe('AppImage XZ compression toolset', () => {
  it('only wraps Linux x64 XZ builds using the legacy toolset', () => {
    const config = { compression: 'maximum', appImage: { compression: 'xz' } };
    for (const args of [['--linux', 'AppImage'], ['-mwl']]) {
      expect(shouldOptimizeAppImage(args, config)).toBe(true);
    }
    for (const args of [['--dir'], ['--mac'], ['--linux', '--arm64'], ['--linux', '--ia32']]) {
      expect(shouldOptimizeAppImage(args, config)).toBe(false);
    }
    expect(shouldOptimizeAppImage(['--linux'], { ...config, toolsets: { appimage: '1.0.3' } })).toBe(false);
    expect(shouldOptimizeAppImage(['--linux'], { ...config, appImage: { compression: 'gzip' } })).toBe(false);
  });
  it('forwards arguments safely, adds BCJ and resource limits, and cleans up', async () => {
    const source = await mkdtemp(path.join(os.tmpdir(), "voo-tool's space-"));
    let prepared;
    try {
      const executable = path.join(source, 'tool');
      await writeFile(executable, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n', { mode: 0o755 });
      await mkdir(path.join(source, 'lib'));
      const tools = { mksquashfs: executable, desktopFileValidate: executable, runtime: executable, runtimeLibraries: path.join(source, 'lib') };
      prepared = await prepareAppImageCompression({ env: { KEEP: 'value' }, platform: 'linux', arch: 'x64', getTools: async () => tools });
      const root = prepared.env.APPIMAGE_TOOLS_PATH;
      const args = ['source with spaces', 'output', '-comp', 'xz', '-b', '1048576'];
      expect(JSON.parse(execFileSync(path.join(root, 'linux-x64/mksquashfs'), args, { encoding: 'utf8' })))
        .toEqual([...args, '-Xbcj', 'x86', '-processors', '2', '-mem', '512M']);
      expect(prepared.env.KEEP).toBe('value');
      expect(await readFile(path.join(root, 'runtime-x64'), 'utf8')).toContain('process.argv');
      await access(path.join(root, 'lib/x64'));
      await prepared.cleanup();
      await expect(access(root)).rejects.toThrow();
    } finally {
      await prepared?.cleanup();
      await rm(source, { recursive: true, force: true });
    }
  });

  it.each([
    { platform: 'darwin', arch: 'x64', env: {} },
    { platform: 'linux', arch: 'arm64', env: {} },
    { platform: 'linux', arch: 'x64', env: { APPIMAGE_TOOLS_PATH: '/custom' } },
  ])('preserves other platforms and explicit toolset overrides: %j', async options => {
    const result = await prepareAppImageCompression({ ...options, getTools: () => { throw new Error('must not download'); } });
    expect(result.env).toBe(options.env);
    await result.cleanup();
  });
});
