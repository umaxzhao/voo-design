import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const quote = value => `'${value.replace(/'/g, `'\\''`)}'`;

export function shouldOptimizeAppImage(args, config) {
  return args.some(arg => ['--linux', '-l', '-mwl', 'AppImage'].includes(arg)) &&
    !args.some(arg => ['--dir', '--arm64', '--armv7l', '--ia32', '--universal'].includes(arg)) &&
    (!config.toolsets?.appimage || config.toolsets.appimage === '0.0.0') &&
    config.compression === 'maximum' && config.appImage?.compression === 'xz';
}

// Builder exposes no extra SquashFS arguments. Wrap its verified, pinned toolset
// in a private temporary directory; never modify the shared builder cache.
export async function prepareAppImageCompression({
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  getTools = () => require('app-builder-lib/out/toolsets/linux.js').getAppImageTools('0.0.0', require('builder-util').Arch.x64),
} = {}) {
  if (platform !== 'linux' || arch !== 'x64' || env.APPIMAGE_TOOLS_PATH) {
    return { env, cleanup: async () => {} };
  }
  const tools = await getTools();
  const root = await mkdtemp(path.join(os.tmpdir(), 'voo-appimage-tools-'));
  try {
    await mkdir(path.join(root, 'linux-x64'));
    await symlink(tools.runtime, path.join(root, 'runtime-x64'));
    await mkdir(path.join(root, 'lib'));
    await symlink(tools.runtimeLibraries, path.join(root, 'lib/x64'));
    await symlink(tools.desktopFileValidate, path.join(root, 'linux-x64/desktop-file-validate'));
    // BCJ tries x86 branch normalization as well as unfiltered XZ per block.
    // Bound compression workers/memory on shared build machines.
    await writeFile(path.join(root, 'linux-x64/mksquashfs'),
      `#!/bin/sh\nexec ${quote(tools.mksquashfs)} "$@" -Xbcj x86 -processors 2 -mem 512M\n`,
      { mode: 0o755 });
    return {
      env: { ...env, APPIMAGE_TOOLS_PATH: root },
      cleanup: () => rm(root, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
