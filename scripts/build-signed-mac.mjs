import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadMacReleaseEnvironment, redactMacDiagnostics, macSmokeEnvironment } from './mac-release-environment.mjs';
import { desktopReleasePlan } from './desktop-release-plan.mjs';

const require = createRequire(import.meta.url);
const { notarizationOptions, verifyNotarizedApp, signingSourceRevision, selectDeveloperIdIdentity } = require('./mac-signing.cjs');
const [arch = process.arch] = process.argv.slice(2);
if (process.platform !== 'darwin' || process.arch !== arch) throw new Error('Signed release requires its native macOS architecture.');
if (!process.env.npm_execpath) throw new Error('Run through npm run release:mac-signed.');
const revision = signingSourceRevision();
const env = await loadMacReleaseEnvironment(process.env.VOO_RELEASE_CREDENTIALS_FILE);
env.VOO_MAC_SIGNING_REQUIRED = '1';
// A cross-repository runner's GITHUB_SHA identifies its workflow, not the
// checked-out app. Receipts must always describe the source actually built.
env.GITHUB_SHA = revision;
const credentials = notarizationOptions(env, true);

function run(command, args, timeout = 45_000, childEnv = env) {
  const result = spawnSync(command, args, { env: childEnv, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });
  const output = redactMacDiagnostics(`${result.stdout ?? ''}\n${result.stderr ?? ''}`, env);
  if (result.error || result.status !== 0) {
    // Only sanitized diagnostics reach logs; do not retain raw Error objects,
    // which can include credentials in the child-process argument vector.
    throw new Error(`Signed macOS step failed (${command}, exit ${result.status}, ${result.error?.code ?? 'no process error'}):\n${output}`);
  }
  return { output, stdout: result.stdout };
}

const identities = run('security', ['find-identity', '-v', '-p', 'codesigning']).stdout;
const identity = selectDeveloperIdIdentity(identities, env.VOO_APPLE_TEAM_ID);
env.CSC_NAME = identity.name;
env.VOO_APPLE_TEAM_ID = identity.teamId;
if (env.APPLE_TEAM_ID && env.APPLE_TEAM_ID !== env.VOO_APPLE_TEAM_ID) throw new Error('Configured Apple team differs from the existing signing identity.');

let authArgs;
if (credentials.keychainProfile) authArgs = ['--keychain-profile', credentials.keychainProfile,
  ...(credentials.keychain ? ['--keychain', credentials.keychain] : [])];
else if (credentials.appleApiKey) authArgs = ['--key', credentials.appleApiKey,
  '--key-id', credentials.appleApiKeyId, '--issuer', credentials.appleApiIssuer];
else authArgs = ['--apple-id', credentials.appleId, '--password', credentials.appleIdPassword, '--team-id', credentials.teamId];
run('xcrun', ['notarytool', 'history', ...authArgs, '--output-format', 'json']);
console.log('Existing Developer ID and Apple notarization authentication passed.');

const build = run(process.execPath, [process.env.npm_execpath, 'run', 'release:build', '--', 'mac', arch], 30 * 60 * 1000);
process.stdout.write(build.output);
const plan = desktopReleasePlan('mac', arch);
const trust = verifyNotarizedApp(plan.appDir, env.VOO_APPLE_TEAM_ID);
const smoke = run(process.execPath, [process.env.npm_execpath, 'run', 'release:smoke', '--', 'mac', arch], 5 * 60 * 1000, macSmokeEnvironment(env));
process.stdout.write(smoke.output);
const evidence = path.join(plan.output, 'evidence');
await mkdir(evidence, { recursive: true });
await writeFile(path.join(evidence, `signing-mac-${arch}.json`), JSON.stringify({
  version: require('../package.json').version, revision: env.GITHUB_SHA,
  platform: 'mac', arch, ...trust, credentialValuesDisclosed: false,
}, null, 2));
const smokeFile = path.join(evidence, `mac-${arch}.json`);
const receipt = JSON.parse(await readFile(smokeFile, 'utf8'));
if (receipt.revision !== env.GITHUB_SHA) throw new Error('Native smoke receipt source differs from the signed build.');
receipt.signing = trust;
receipt.remaining = receipt.remaining.filter(context => context !== 'signed/notarized distribution trust');
await writeFile(smokeFile, JSON.stringify(receipt, null, 2));
console.log(`Signed/notarized macOS ${arch} package and native smoke passed.`);
