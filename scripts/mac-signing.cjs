const { spawnSync } = require('node:child_process');

const APPLE_TRUST_ATTEMPTS = 3;
const APPLE_TRUST_TIMEOUT_MS = 90_000;
const waitForAppleRetry = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3_000);

function isAppleNetworkFailure(text) {
  return /ETIMEDOUT|NSURLErrorDomain Code=-(?:1001|1005)\b|The network connection was lost/i.test(text);
}

/** Only public staple/policy commands use this helper; never pass auth args.
 * A retry still needs an actual zero exit. Invalid or missing tickets fail
 * immediately; a network outage cannot produce a successful trust receipt. */
function runAppleTrustCheck(command, args, run, wait) {
  for (let attempt = 1; attempt <= APPLE_TRUST_ATTEMPTS; attempt += 1) {
    const result = run(command, args, { encoding: 'utf8', timeout: APPLE_TRUST_TIMEOUT_MS });
    if (!result.error && result.status === 0) return;
    const diagnostic = [result.error?.code, result.signal, result.stdout, result.stderr]
      .filter(Boolean).join('\n').trim().slice(-12_000);
    if (attempt === APPLE_TRUST_ATTEMPTS || !isAppleNetworkFailure(diagnostic)) {
      throw new Error(`macOS release trust check failed: ${command} (exit ${result.status}: ${diagnostic || 'no command diagnostic'}).`);
    }
    console.warn(`[voo-design] Apple trust service network failure; retry ${attempt}/${APPLE_TRUST_ATTEMPTS - 1}.`);
    wait();
  }
}

/** The locked notarize library reaches stapling only after Apple accepted the
 * submission. Recover its explicit network-only staple failure without
 * uploading again or replaying any authentication material. */
function recoverNotaryStapling(error, appPath, run = spawnSync, wait = waitForAppleRetry) {
  const diagnostic = String(error?.message ?? error);
  if (!diagnostic.includes('Failed to staple your application') || !isAppleNetworkFailure(diagnostic)) throw error;
  runAppleTrustCheck('xcrun', ['stapler', 'staple', appPath], run, wait);
}

const ROUTES = [
  { name: 'keychain', keys: ['APPLE_KEYCHAIN_PROFILE'], fields: ['keychainProfile'] },
  { name: 'api', keys: ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'], fields: ['appleApiKey', 'appleApiKeyId', 'appleApiIssuer'] },
  { name: 'apple-id', keys: ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'], fields: ['appleId', 'appleIdPassword', 'teamId'] },
];

function signingSourceRevision(run = spawnSync) {
  const status = run('git', ['status', '--porcelain'], { encoding: 'utf8' });
  if (status.error || status.status !== 0 || status.stdout.trim()) throw new Error('Signed release requires a clean source checkout.');
  const head = run('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const revision = head.stdout?.trim();
  if (head.error || head.status !== 0 || !/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Cannot identify signed application source.');
  return revision;
}

function selectDeveloperIdIdentity(output, expectedTeamId) {
  const identities = [...output.matchAll(/"Developer ID Application: ([^"]+ \(([A-Z0-9]+)\))"/g)]
    .filter(match => !expectedTeamId || match[2] === expectedTeamId);
  if (identities.length !== 1) throw new Error('Select exactly one existing Developer ID Application identity using VOO_APPLE_TEAM_ID.');
  // Builder chooses the Developer ID certificate type itself and explicitly
  // rejects a CSC_NAME containing that type prefix. Keep the team qualifier.
  return { name: identities[0][1], teamId: identities[0][2] };
}

/** Select exactly one existing credential route; never read credential files. */
function notarizationOptions(env, required = false) {
  const active = ROUTES.filter(route => {
    if (route.name !== 'apple-id') return route.keys.some(key => env[key]?.trim());
    // A team ID/account label may accompany an API key without selecting
    // password authentication. An actual second secret remains a conflict.
    return Boolean(env.APPLE_APP_SPECIFIC_PASSWORD?.trim()) ||
      (!ROUTES.slice(0, 2).some(other => other.keys.some(key => env[key]?.trim())) && Boolean(env.APPLE_ID?.trim()));
  });
  if (active.length > 1) throw new Error('Conflicting macOS notarization routes; configure only one.');
  const route = active[0];
  if (!route || route.keys.some(key => !env[key]?.trim())) {
    if (required) throw new Error('Signed macOS release requires one complete notarization route.');
    return null;
  }
  const options = Object.fromEntries(route.keys.map((key, index) => [route.fields[index], env[key]]));
  if (route.name === 'keychain' && env.APPLE_KEYCHAIN) options.keychain = env.APPLE_KEYCHAIN;
  return options;
}

/** Inspect public signature metadata without exporting a certificate or key. */
function verifyMacSignature(appPath, expectedTeamId, run = spawnSync) {
  if (!expectedTeamId) throw new Error('Expected macOS signing team is required.');
  const verified = run('codesign', ['--verify', '--deep', '--strict', appPath], { encoding: 'utf8', timeout: 45000 });
  if (verified.error || verified.status !== 0) throw new Error('macOS signature verification failed.');
  const inspected = run('codesign', ['-dv', '--verbose=4', appPath], { encoding: 'utf8', timeout: 45000 });
  if (inspected.error || inspected.status !== 0) throw new Error('macOS signature inspection failed.');
  const details = `${inspected.stdout ?? ''}\n${inspected.stderr ?? ''}`;
  if (!/^Authority=Developer ID Application:/m.test(details)) throw new Error('Developer ID Application signature is required.');
  if (details.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim() !== expectedTeamId) throw new Error('macOS signing team does not match.');
  if (!/^CodeDirectory .*flags=.*\(.*runtime.*\)/m.test(details)) throw new Error('Hardened Runtime is required.');
  return { developerId: true, expectedTeam: true, hardenedRuntime: true };
}

function verifyNotarizedApp(appPath, expectedTeamId, run = spawnSync, wait = waitForAppleRetry) {
  const signature = verifyMacSignature(appPath, expectedTeamId, run);
  for (const [command, args] of [
    ['xcrun', ['stapler', 'validate', appPath]],
    ['spctl', ['--assess', '--type', 'execute', appPath]],
  ]) {
    runAppleTrustCheck(command, args, run, wait);
  }
  return { ...signature, stapled: true, gatekeeper: true };
}

module.exports = { notarizationOptions, verifyMacSignature, verifyNotarizedApp, signingSourceRevision, selectDeveloperIdIdentity, recoverNotaryStapling };
