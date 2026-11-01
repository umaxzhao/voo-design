import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const MAC_CREDENTIAL_KEYS = Object.freeze([
  'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER',
  'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID',
  'APPLE_KEYCHAIN_PROFILE', 'APPLE_KEYCHAIN', 'VOO_APPLE_TEAM_ID',
]);

/** Only an explicitly supplied configuration file may supply signing values.
 * Keep unrelated provider keys out of the build environment and never evaluate
 * shell expressions or log the source content. Existing exported values win. */
export function parseMacReleaseEnvironment(source, base = {}, directory = process.cwd()) {
  const env = { ...base };
  const allowed = new Set(MAC_CREDENTIAL_KEYS);
  for (const line of source.split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !allowed.has(match[1]) || env[match[1]]) continue;
    env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  for (const key of ['APPLE_API_KEY', 'APPLE_KEYCHAIN']) {
    if (env[key]) env[key] = path.resolve(directory, env[key]);
  }
  return env;
}

export async function loadMacReleaseEnvironment(file, base = process.env) {
  if (!file) return { ...base };
  const absolute = path.resolve(file);
  return parseMacReleaseEnvironment(await readFile(absolute, 'utf8'), base, path.dirname(absolute));
}

/** Subprocess diagnostics may echo command arguments; redact values before
 * retaining a build log. The private-key file itself is never opened here. */
export function redactMacDiagnostics(output, env) {
  const values = MAC_CREDENTIAL_KEYS.map(key => env[key]).filter(value => typeof value === 'string' && value.length > 0)
    .sort((left, right) => right.length - left.length);
  return values.reduce((text, value) => text.split(value).join('[redacted]'), String(output));
}

/** The test application needs no signing or repository credentials. */
export function macSmokeEnvironment(env) {
  const clean = { ...env };
  for (const key of [...MAC_CREDENTIAL_KEYS, 'CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME',
    'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'VOO_RELEASE_CREDENTIALS_FILE',
    'VOO_MAC_SIGNING_REQUIRED', 'GH_TOKEN', 'GITHUB_TOKEN']) delete clean[key];
  return clean;
}
