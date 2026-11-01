import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseMacReleaseEnvironment, redactMacDiagnostics, macSmokeEnvironment } from '../../scripts/mac-release-environment.mjs';
import { prepareSigningEnv } from '../../scripts/signing-env.mjs';

const require = createRequire(import.meta.url);
const { notarizationOptions, verifyMacSignature, verifyNotarizedApp, signingSourceRevision, selectDeveloperIdIdentity } = require('../../scripts/mac-signing.cjs');
const api = { APPLE_API_KEY: '/fixture/key.p8', APPLE_API_KEY_ID: 'fixture-id', APPLE_API_ISSUER: 'fixture-issuer' };
const trust = { developerId: true, expectedTeam: true, hardenedRuntime: true, stapled: true, gatekeeper: true };

function hookFixture(env, notarize = vi.fn(async () => {})) {
  const verify = vi.fn();
  const verified = vi.fn(() => trust);
  const module = { exports: {} };
  const fakeRequire = name => {
    if (name === 'node:module') return { createRequire: () => () => ({ notarize }) };
    if (name === './mac-signing.cjs') return { notarizationOptions, verifyMacSignature: verify, verifyNotarizedApp: verified };
    return require(name);
  };
  fakeRequire.resolve = () => '/fixture/builder.js';
  vm.runInNewContext(readFileSync('scripts/notarize.cjs', 'utf8'), { require: fakeRequire, module, process: { env }, console });
  return { run: module.exports, notarize, verify, verified };
}

describe('reuse existing macOS signing configuration', () => {
  it('uses the builder identity format without losing the expected team qualifier', () => {
    const listing = '1) fixture "Developer ID Application: Example (TEAM123456)"';
    expect(selectDeveloperIdIdentity(listing)).toEqual({ name: 'Example (TEAM123456)', teamId: 'TEAM123456' });
    expect(() => selectDeveloperIdIdentity(listing, 'OTHERTEAM')).toThrow('exactly one');
    expect(() => selectDeveloperIdIdentity(listing + listing)).toThrow('exactly one');
    expect(() => selectDeveloperIdIdentity('Apple Development: Example')).toThrow('exactly one');
  });
  it('rejects dirty/untracked source before loading any signing configuration', () => {
    expect(() => signingSourceRevision(() => ({ status: 0, stdout: '?? draft.jsx' }))).toThrow('clean source');
    expect(() => signingSourceRevision(() => ({ status: 1, stdout: '' }))).toThrow('clean source');
    expect(signingSourceRevision((command, args) => ({ status: 0, stdout: args[0] === 'status' ? '' : 'a'.repeat(40) }))).toBe('a'.repeat(40));
  });
  it('accepts App Store Connect credentials with an explicitly requested existing keychain signer', () => {
    const hook = require('../../scripts/notarize.cjs');
    expect(hook.shouldNotarize({ electronPlatformName: 'darwin' }, { ...api, VOO_MAC_SIGNING_REQUIRED: '1' })).toBe(true);
    expect(hook.shouldNotarize({ electronPlatformName: 'win32' }, { ...api, VOO_MAC_SIGNING_REQUIRED: '1' })).toBe(false);
    expect(notarizationOptions({ ...api, APPLE_TEAM_ID: 'TEAM123456', APPLE_ID: 'account-label' }, true))
      .toEqual({ appleApiKey: api.APPLE_API_KEY, appleApiKeyId: api.APPLE_API_KEY_ID, appleApiIssuer: api.APPLE_API_ISSUER });
  });
  it('supports an existing profile without importing a certificate or storing credentials', () => {
    expect(notarizationOptions({ APPLE_KEYCHAIN_PROFILE: 'existing-profile', APPLE_KEYCHAIN: '/fixture/login.keychain-db' }, true))
      .toEqual({ keychainProfile: 'existing-profile', keychain: '/fixture/login.keychain-db' });
    expect(prepareSigningEnv({ VOO_MAC_SIGNING_REQUIRED: '1' }, vi.fn()).CSC_IDENTITY_AUTO_DISCOVERY).toBe('true');
    expect(() => prepareSigningEnv({ VOO_MAC_SIGNING_REQUIRED: '1', CSC_IDENTITY_AUTO_DISCOVERY: 'false' }, vi.fn())).toThrow('conflicts');
    expect(prepareSigningEnv({ ...api }, vi.fn()).CSC_IDENTITY_AUTO_DISCOVERY).toBe('false');
  });
  it('fails closed for missing, partial or conflicting notarization routes', () => {
    for (const env of [{}, { APPLE_API_KEY: 'fixture' }, { APPLE_ID: 'account' }]) {
      expect(() => notarizationOptions(env, true)).toThrow('complete');
      expect(notarizationOptions(env)).toBe(null);
    }
    expect(() => notarizationOptions({ ...api, APPLE_KEYCHAIN_PROFILE: 'profile' }, true)).toThrow('Conflicting');
    expect(() => notarizationOptions({ ...api, APPLE_APP_SPECIFIC_PASSWORD: 'fixture-password' }, true)).toThrow('Conflicting');
  });
  it('loads only allowlisted configuration, preserves exported values and treats shell syntax as data', () => {
    const source = 'APPLE_API_KEY="./private/key.p8"\nexport APPLE_API_KEY_ID=from-file\nOPENAI_API_KEY=unrelated\nAPPLE_API_ISSUER=$(do-not-execute)\n';
    const env = parseMacReleaseEnvironment(source, { APPLE_API_KEY_ID: 'exported' }, '/fixture');
    expect(env).toEqual({ APPLE_API_KEY_ID: 'exported', APPLE_API_KEY: '/fixture/private/key.p8', APPLE_API_ISSUER: '$(do-not-execute)' });
    expect(redactMacDiagnostics(`key ${env.APPLE_API_KEY}; id exported; issuer $(do-not-execute)`, env))
      .toBe('key [redacted]; id [redacted]; issuer [redacted]');
  });
  it('verifies signatures before notarization and verifies stapling and Gatekeeper after success', async () => {
    const fixture = hookFixture({ ...api, VOO_MAC_SIGNING_REQUIRED: '1', VOO_APPLE_TEAM_ID: 'TEAM123456' });
    await fixture.run({ electronPlatformName: 'darwin', appOutDir: '/fixture', packager: { appInfo: { productFilename: 'VOO Design' } } });
    expect(fixture.verify).toHaveBeenCalledWith('/fixture/VOO Design.app', 'TEAM123456');
    expect(fixture.notarize).toHaveBeenCalledWith({ appPath: '/fixture/VOO Design.app', ...notarizationOptions(api) });
    expect(fixture.verify.mock.invocationCallOrder[0]).toBeLessThan(fixture.notarize.mock.invocationCallOrder[0]);
    expect(fixture.verified.mock.invocationCallOrder[0]).toBeGreaterThan(fixture.notarize.mock.invocationCallOrder[0]);
  });
  it('does not expose release or GitHub credentials to the smoke-test application', () => {
    expect(macSmokeEnvironment({ ...api, APPLE_ID: 'account', CSC_LINK: 'certificate', CSC_NAME: 'identity',
      GH_TOKEN: 'fixture-token', GITHUB_TOKEN: 'fixture-token', VOO_RELEASE_CREDENTIALS_FILE: 'private-config',
      VOO_MAC_SIGNING_REQUIRED: '1', PATH: '/bin', GITHUB_SHA: 'a'.repeat(40) }))
      .toEqual({ PATH: '/bin', GITHUB_SHA: 'a'.repeat(40) });
  });
  it('propagates Apple submission failure rather than reporting a signed release pass', async () => {
    const fixture = hookFixture({ ...api, VOO_MAC_SIGNING_REQUIRED: '1', VOO_APPLE_TEAM_ID: 'TEAM123456' }, vi.fn(async () => { throw new Error('Apple rejected fixture'); }));
    await expect(fixture.run({ electronPlatformName: 'darwin', appOutDir: '/fixture', packager: { appInfo: { productFilename: 'App' } } })).rejects.toThrow('Apple rejected');
    expect(fixture.verified).not.toHaveBeenCalled();
  });
  it('requires a Developer ID signature, the expected team and Hardened Runtime', () => {
    const metadata = 'Authority=Developer ID Application: Fixture\nTeamIdentifier=TEAM123456\nCodeDirectory v=20500 flags=0x10000(runtime) hashes=1';
    const runner = text => vi.fn((command, args) => ({ status: 0, stderr: args[0] === '-dv' ? text : '' }));
    expect(verifyMacSignature('/fixture/App.app', 'TEAM123456', runner(metadata))).toEqual({ developerId: true, expectedTeam: true, hardenedRuntime: true });
    for (const text of [metadata.replace('Developer ID Application:', 'Apple Development:'), metadata.replace('TEAM123456', 'OTHERTEAM'), metadata.replace('(runtime)', '(none)')]) {
      expect(() => verifyMacSignature('/fixture/App.app', 'TEAM123456', runner(text))).toThrow();
    }
    expect(() => verifyMacSignature('/fixture/App.app', 'TEAM123456', () => ({ status: 1 }))).toThrow('verification failed');
    expect(verifyNotarizedApp('/fixture/App.app', 'TEAM123456', runner(metadata))).toEqual(trust);
    expect(() => verifyNotarizedApp('/fixture/App.app', 'TEAM123456', (command, args) => command === 'xcrun' ? { status: 1 } : runner(metadata)(command, args))).toThrow('trust check failed');
  });
});
