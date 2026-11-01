const { createRequire } = require('node:module');
const { join } = require('node:path');
const { notarizationOptions, verifyMacSignature, verifyNotarizedApp } = require('./mac-signing.cjs');

function shouldNotarize(context, env = process.env) {
  return context.electronPlatformName === 'darwin' &&
    Boolean(env.CSC_LINK || env.VOO_MAC_SIGNING_REQUIRED === '1') && Boolean(notarizationOptions(env));
}

async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const required = process.env.VOO_MAC_SIGNING_REQUIRED === '1';
  const credentials = notarizationOptions(process.env, required);
  if (!shouldNotarize(context)) {
    console.warn('[voo-design] Notarization skipped: signed build and complete Apple credentials are required. See docs/code-signing.md.');
    return;
  }
  // Resolve through electron-builder's dependency tree; no extra top-level dependency.
  const builderRequire = createRequire(require.resolve('app-builder-lib'));
  let notarize;
  try {
    ({ notarize } = builderRequire('@electron/notarize'));
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    if (required) throw new Error('Required notarization module is unavailable.');
    console.warn('[voo-design] Notarization skipped: bundled @electron/notarize unavailable.');
    return;
  }
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const team = process.env.VOO_APPLE_TEAM_ID || process.env.APPLE_TEAM_ID;
  if (required) verifyMacSignature(appPath, team);
  await notarize({ appPath, ...credentials });
  if (required) verifyNotarizedApp(appPath, team);
}
module.exports = afterSign;
module.exports.shouldNotarize = shouldNotarize;
