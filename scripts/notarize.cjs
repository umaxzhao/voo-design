const { createRequire } = require('node:module');
const { join } = require('node:path');

function shouldNotarize(context, env = process.env) {
  return context.electronPlatformName === 'darwin' && Boolean(env.CSC_LINK) &&
    ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'].every(key => Boolean(env[key]));
}

async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (!shouldNotarize(context)) {
    console.warn('[voo-design] Notarization skipped: CSC_LINK and all three Apple credentials are required. See docs/code-signing.md.');
    return;
  }
  // Resolve through electron-builder's dependency tree; no extra top-level dependency.
  const builderRequire = createRequire(require.resolve('app-builder-lib'));
  let notarize;
  try {
    ({ notarize } = builderRequire('@electron/notarize'));
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    console.warn('[voo-design] Notarization skipped: bundled @electron/notarize unavailable.');
    return;
  }
  await notarize({
    appPath: join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`),
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
}
module.exports = afterSign;
module.exports.shouldNotarize = shouldNotarize;
