import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export function prepareSigningEnv(env = process.env, warn = console.warn) {
  const prepared = { ...env };
  // A Windows certificate must not enable macOS keychain discovery.
  if (!env.CSC_LINK) prepared.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  if (!env.CSC_LINK && !env.WIN_CSC_LINK) {
    warn('[voo-design] Code signing skipped: CSC_LINK / WIN_CSC_LINK not set. Building unsigned. See docs/code-signing.md.');
  }
  return prepared;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const require = createRequire(import.meta.url);
  const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), ...process.argv.slice(2)], {
    env: prepareSigningEnv(), stdio: 'inherit',
  });
  if (result.error) console.error('[voo-design] Unable to start electron-builder:', result.error.message);
  process.exitCode = result.status ?? 1;
}
