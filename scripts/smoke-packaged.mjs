import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
const artifacts = (await fs.readdir('release')).filter(name => name.endsWith('.AppImage')).sort();
if (artifacts.length !== 1) throw new Error('Expected exactly one release/*.AppImage; remove stale artifacts.');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'voo-packaged-smoke-'));
const hasXvfb = spawnSync('which', ['xvfb-run']).status === 0;
const appImagePath = path.resolve('release', artifacts[0]);
const appArgs = ['--appimage-extract-and-run', '--no-sandbox', '--disable-gpu', `--user-data-dir=${profile}`];
const [cmd, args] = hasXvfb ? ['xvfb-run', ['-a', appImagePath, ...appArgs]] : [appImagePath, appArgs];
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: {
        ...process.env,
        VOO_PACKAGED_SMOKE: '1',
        VOO_DISABLE_UPDATES: '1',
        XDG_CONFIG_HOME: path.join(profile, 'config'),
        XDG_CACHE_HOME: path.join(profile, 'cache'),
        VOO_SMOKE_SCREENSHOT: path.resolve(process.env.VOO_SMOKE_SCREENSHOT || 'docs/screenshots/packaged-smoke.png'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let passed = false;
    let output = '';
    const capture = chunk => { output += chunk.toString(); if (output.includes('PACKAGED_SMOKE_OK')) passed = true; }; 
    child.stdout.on('data', chunk => { process.stdout.write(chunk); capture(chunk); });
    child.stderr.on('data', chunk => { process.stderr.write(chunk); capture(chunk); });
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Packaged smoke timed out')); }, 90000);
    child.on('error', reject);
    child.on('exit', code => { clearTimeout(timeout); resolve(code === 0 && passed && !/ERR_MODULE_NOT_FOUND|Cannot find module|Could not register/.test(output) ? 0 : 1); });
  });
  if (code) throw new Error('Packaged smoke failed');
} finally { await fs.rm(profile, { recursive: true, force: true }); }
