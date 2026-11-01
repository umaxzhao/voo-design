import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';
import { prepareSigningEnv } from '../../scripts/signing-env.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml'); // already in the locked electron-builder dependency tree
const hook = require('../../scripts/notarize.cjs');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

describe('optional code signing', () => {
  it('warns and disables discovery without modifying the input environment', () => {
    const warn = vi.fn();
    const env = {};
    expect(prepareSigningEnv(env, warn).CSC_IDENTITY_AUTO_DISCOVERY).toBe('false');
    expect(env).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Building unsigned'));
  });
  it('preserves explicit credentials and prevents Windows-only mac discovery', () => {
    const warn = vi.fn();
    expect(prepareSigningEnv({ CSC_LINK: 'cert', CSC_KEY_PASSWORD: 'test' }, warn)).toEqual({ CSC_LINK: 'cert', CSC_KEY_PASSWORD: 'test' });
    expect(prepareSigningEnv({ WIN_CSC_LINK: 'cert' }, warn).CSC_IDENTITY_AUTO_DISCOVERY).toBe('false');
    expect(warn).not.toHaveBeenCalled();
  });
  it('requires a signed mac build and the complete Apple credential set', () => {
    const context = { electronPlatformName: 'darwin' };
    const env = { CSC_LINK: 'cert', APPLE_ID: 'id', APPLE_APP_SPECIFIC_PASSWORD: 'test', APPLE_TEAM_ID: 'team' };
    expect(hook.shouldNotarize(context, {})).toBe(false);
    for (const key of Object.keys(env)) expect(hook.shouldNotarize(context, { ...env, [key]: '' })).toBe(false);
    expect(hook.shouldNotarize(context, env)).toBe(true);
    expect(hook.shouldNotarize({ electronPlatformName: 'win32' }, env)).toBe(false);
  });
  it('wires a single notarization hook and wraps every packaging command', () => {
    expect(existsSync(pkg.build.afterSign)).toBe(true);
    expect(pkg.build.mac.notarize).toBe(false);
    expect(pkg.build.mac.gatekeeperAssess).toBe(false);
    expect(pkg.build.mac.entitlementsInherit).toBe(pkg.build.mac.entitlements);
    for (const key of ['dist', 'dist:all', 'dist:dir', 'electron:build']) expect(pkg.scripts[key]).toContain('scripts/signing-env.mjs');
  });
  it('builds four native targets before a write-scoped draft job', () => {
    const source = readFileSync('.github/workflows/release.yml', 'utf8');
    const workflow = yaml.load(source);
    expect(workflow.on.push.tags).toEqual(['v*']);
    expect(workflow.on.workflow_dispatch.inputs.create_draft.default).toBe(false);
    expect(workflow.permissions.contents).toBe('read');
    expect(workflow.jobs.build.if).toBeUndefined();
    expect(workflow.jobs.build.strategy.matrix.include.map(target => `${target.platform}/${target.arch}`)).toEqual(['linux/x64', 'win/x64', 'mac/x64', 'mac/arm64']);
    expect(workflow.jobs.draft.needs).toEqual(['checks', 'build']);
    expect(workflow.jobs.draft.permissions.contents).toBe('write');
    expect(source).toContain('--draft --prerelease');
    expect(pkg.build.nsis.artifactName).not.toBe(pkg.build.portable.artifactName);
    for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) expect(source).toContain(`secrets.${key}`);
    expect(source).not.toMatch(/BEGIN (?:RSA |EC )?PRIVATE KEY|-----BEGIN CERTIFICATE|(?:password|token):\s*["']?[A-Za-z0-9]{12}/i);
  });
});
