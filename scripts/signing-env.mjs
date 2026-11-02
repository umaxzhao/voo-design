import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { prepareAppImageCompression, shouldOptimizeAppImage } from './appimage-compression.mjs';

export function prepareSigningEnv(env = process.env, warn = console.warn) {
  const prepared = { ...env };
  // Actions supplies missing secrets as empty strings. electron-builder treats
  // an empty CSC_LINK as the working directory, rather than an absent cert.
  for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD',
    'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID',
    'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER',
    'APPLE_KEYCHAIN_PROFILE', 'APPLE_KEYCHAIN', 'CSC_NAME']) {
    if (prepared[key] === '') delete prepared[key];
  }
  const requiredMac = prepared.VOO_MAC_SIGNING_REQUIRED === '1';
  if (requiredMac && prepared.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    throw new Error('Required macOS signing conflicts with disabled identity discovery.');
  }
  // Only an explicit signed-release request enables the existing local signer.
  // Windows certificates and Apple credentials alone must not enable discovery.
  if (!prepared.CSC_LINK) prepared.CSC_IDENTITY_AUTO_DISCOVERY = requiredMac ? 'true' : 'false';
  if (!prepared.CSC_LINK && !prepared.WIN_CSC_LINK && !requiredMac) {
    warn('[voo-design] Code signing skipped: CSC_LINK / WIN_CSC_LINK not set. Building unsigned. See docs/code-signing.md.');
  }
  return prepared;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const require = createRequire(import.meta.url);
  const args = process.argv.slice(2);
  const config = require('../package.json').build;
  const signingEnv = prepareSigningEnv();
  const optimize = shouldOptimizeAppImage(args, config);
  const tools = optimize
    ? await prepareAppImageCompression({ env: signingEnv })
    : { env: signingEnv, cleanup: async () => {} };
  try {
    const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), ...args], {
      env: tools.env, stdio: 'inherit',
    });
    if (result.error) console.error('[voo-design] Unable to start electron-builder:', result.error.message);
    process.exitCode = result.status ?? 1;
  } finally {
    await tools.cleanup();
  }
}
