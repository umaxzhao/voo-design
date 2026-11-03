import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
const { bootUpdateChain, flush } = createRequire(import.meta.url)('./updater-chain-fixture.cjs');
const installations = f => f.events.filter(event => event === 'install.boundary' || event === 'native.install');

describe('explicit update installation confirmation across real modules', () => {
  for (const kind of ['base', 'mac']) {
    for (const response of [0, -1]) {
      it(`${kind}: keep editing/cancel ${response} cannot install or quit`, async () => {
        const f = bootUpdateChain({ kind, response });
        expect(await f.install()).toBe(false); await flush();
        expect(installations(f)).toEqual([]);
        expect(f.events).not.toContain('app.quit'); expect(f.events).not.toContain('bridge.close');
        expect(f.events.filter(event => event === 'prompt')).toHaveLength(1);
      });
    }
    it(`${kind}: query rejection cannot install, quit or close bridge`, async () => {
      const f = bootUpdateChain({ kind, response: 1 }); f.state.queryError = new Error('renderer unavailable');
      expect(await f.install()).toBe(false); await flush();
      expect(installations(f)).toEqual([]); expect(f.events).not.toContain('app.quit');
      expect(f.events).not.toContain('bridge.close'); expect(f.status().state).toBe('error');
    });
    it(`${kind}: repeated clicks share pending confirmation and install only once after approval`, async () => {
      const f = bootUpdateChain({ kind, response: 1 }); let resolve;
      f.state.prompt = new Promise(done => { resolve = done; });
      const first = f.install(); const second = f.install();
      expect(second).toBe(first); await Promise.resolve(); await Promise.resolve();
      expect(installations(f)).toEqual([]); resolve({ response: 1 });
      expect(await first).toBe(true); expect(await second).toBe(true); await flush();
      expect(installations(f)).toHaveLength(1); expect(await f.install()).toBe(true);
      expect(installations(f)).toHaveLength(1); expect(f.events.filter(event => event === 'prompt')).toHaveLength(1);
      expect(f.events.indexOf('prompt')).toBeLessThan(f.events.indexOf(installations(f)[0]));
      if (kind === 'base') expect(f.events).toContain('quit.completed');
    });
    it(`${kind}: thrown installation error revokes approval; later ordinary quit prompts again`, async () => {
      const f = bootUpdateChain({ kind, response: 1 }); f.state.installError = new Error('install failed');
      expect(await f.install()).toBe(false); await flush(); expect(f.status().state).toBe('error');
      expect(f.events).not.toContain('app.quit'); expect(f.events).not.toContain('bridge.close');
      f.state.response = 0; f.app.quit(); await flush();
      expect(f.events.filter(event => event === 'prompt')).toHaveLength(2);
      expect(f.events).not.toContain('bridge.close'); expect(f.events).not.toContain('quit.completed');
    });
  }
  it('Base false install result is failure and cannot retain discard approval', async () => {
    const f = bootUpdateChain({ response: 1, installResult: false });
    expect(await f.install()).toBe(false); expect(f.status().state).toBe('error');
    f.state.response = 0; f.app.quit(); await flush();
    expect(f.events.filter(event => event === 'prompt')).toHaveLength(2);
    expect(f.events).not.toContain('bridge.close'); expect(f.events).not.toContain('quit.completed');
  });
  it('Base asynchronous error invalidates scheduled adapter quit before bridge shutdown', async () => {
    const f = bootUpdateChain({ response: 1 });
    const request = f.install(); await Promise.resolve(); await Promise.resolve();
    f.updateEvents.emit('error', new Error('asynchronous installer error'));
    expect(await request).toBe(false); await flush();
    expect(f.status().state).toBe('error'); expect(f.events).not.toContain('app.quit');
    expect(f.events).not.toContain('bridge.close');
  });
  it('ordinary Quit automatic install runs only after confirmation and quit completion', async () => {
    const f = bootUpdateChain({ response: 0 }); f.updater.addQuitHandler();
    f.app.quit(); await flush(); expect(installations(f)).toEqual([]); expect(f.events).not.toContain('bridge.close');
    f.state.response = 1; f.app.quit(); await flush();
    expect(installations(f)).toHaveLength(1);
    expect(f.events.indexOf('quit.completed')).toBeLessThan(f.events.indexOf('install.boundary'));
    expect(f.events.indexOf('prompt')).toBeLessThan(f.events.indexOf('bridge.close'));
  });
  it('Base late error cancels an already scheduled quit and a later retry cannot revive it', async () => {
    const f = bootUpdateChain({ response: 1 });
    expect(await f.install()).toBe(true); expect(installations(f)).toHaveLength(1);
    f.updateEvents.emit('error', new Error('late installer failure'));
    expect(f.status().state).toBe('error');
    f.updateEvents.emit('update-downloaded'); f.state.response = 0;
    expect(await f.install()).toBe(false); await flush();
    expect(f.events).not.toContain('app.quit'); expect(f.events).not.toContain('bridge.close');
  });
  it('Mac readiness error removes its pending listener and cannot install on a later native event', async () => {
    const f = bootUpdateChain({ kind: 'mac', response: 1 }); f.updater.squirrelDownloadedUpdate = false;
    const request = f.install(); await Promise.resolve(); await Promise.resolve();
    expect(f.native.listenerCount('update-downloaded')).toBe(1);
    f.updateEvents.emit('error', new Error('native fetch failed'));
    expect(await request).toBe(false); expect(f.native.listenerCount('update-downloaded')).toBe(0);
    f.native.emit('update-downloaded'); await flush(); expect(installations(f)).toEqual([]);
    expect(f.events).not.toContain('prompt'); expect(f.events).not.toContain('bridge.close');
  });
  it('Mac waits for existing native readiness, then prompts before native installation', async () => {
    const f = bootUpdateChain({ kind: 'mac', response: 1 }); f.updater.squirrelDownloadedUpdate = false;
    const request = f.install(); await Promise.resolve(); await Promise.resolve();
    expect(f.events).not.toContain('prompt');
    f.updater.squirrelDownloadedUpdate = true; f.native.emit('update-downloaded');
    expect(await request).toBe(true); expect(installations(f)).toEqual(['native.install']);
    expect(f.events.indexOf('prompt')).toBeLessThan(f.events.indexOf('native.install'));
  });
  it('error while ordinary quit waits for startup revokes approval before bridge disposal', async () => {
    let ready; const startup = new Promise(resolve => { ready = resolve; });
    const f = bootUpdateChain({ response: 1, startup });
    expect(await f.install()).toBe(true); await flush();
    f.updateEvents.emit('error', new Error('error before bridge disposal')); ready(); await flush();
    expect(f.events).not.toContain('bridge.close'); expect(f.events).not.toContain('quit.completed');
    f.state.response = 0; f.app.quit(); await flush();
    expect(f.events.filter(event => event === 'prompt')).toHaveLength(2);
  });

  for (const quitFirst of [true, false]) {
    it(`shares a prompt with concurrent ordinary Quit (quitFirst=${quitFirst})`, async () => {
      const f = bootUpdateChain({ response: 1 }); let resolve;
      f.state.prompt = new Promise(done => { resolve = done; });
      if (quitFirst) f.app.quit();
      const request = f.install(); if (!quitFirst) f.app.quit();
      await Promise.resolve(); await Promise.resolve(); resolve({ response: 1 });
      expect(await request).toBe(true); await flush();
      expect(f.events.filter(event => event === 'prompt')).toHaveLength(1);
      expect(installations(f)).toHaveLength(1);
    });
  }
  it('clean documents install without a dirty prompt after the query', async () => {
    const f = bootUpdateChain({ dirty: false });
    expect(await f.install()).toBe(true); await flush();
    expect(f.events).not.toContain('prompt');
    expect(f.events.indexOf('dirty.query')).toBeLessThan(f.events.indexOf('install.boundary'));
  });
  it('Mac asynchronous error revokes discard before a later normal close', async () => {
    const f = bootUpdateChain({ kind: 'mac', response: 1 });
    expect(await f.install()).toBe(true); f.updateEvents.emit('error', new Error('native error'));
    expect(f.status().state).toBe('error'); f.state.response = 0; f.app.quit(); await flush();
    expect(f.events.filter(event => event === 'prompt')).toHaveLength(2);
    expect(f.events).not.toContain('bridge.close'); expect(f.events).not.toContain('quit.completed');
  });
  it('duplicate downloaded events do not permit another install during one confirmation', async () => {
    const f = bootUpdateChain({ response: 1 }); let resolve;
    f.state.prompt = new Promise(done => { resolve = done; });
    const request = f.install(); await Promise.resolve(); await Promise.resolve();
    f.updateEvents.emit('update-downloaded'); expect(f.install()).toBe(request);
    resolve({ response: 1 }); expect(await request).toBe(true); await flush();
    expect(installations(f)).toHaveLength(1);
  });

  it('a failed explicit install is not silently repeated on a later approved ordinary Quit', async () => {
    const f = bootUpdateChain({ response: 1, installResult: false }); f.updater.addQuitHandler();
    expect(await f.install()).toBe(false); expect(installations(f)).toHaveLength(1);
    f.app.quit(); await flush();
    expect(f.events.filter(event => event === 'prompt')).toHaveLength(2);
    expect(f.events).toContain('quit.completed'); expect(installations(f)).toHaveLength(1);
  });
  it('an error arriving during the install call cannot be mistaken for a successful handoff', async () => {
    const f = bootUpdateChain({ response: 1 });
    f.state.installHook = () => queueMicrotask(() => f.updateEvents.emit('error', new Error('async failure')));
    expect(await f.install()).toBe(false); await flush();
    expect(installations(f)).toHaveLength(1); expect(f.status().state).toBe('error');
    expect(f.events).not.toContain('app.quit'); expect(f.events).not.toContain('bridge.close');
    let overridden = false;
    f.windowEvents.get('will-prevent-unload')({ preventDefault() { overridden = true; } });
    expect(overridden).toBe(false);
  });

  it('an error during awaited bridge disposal restores connectivity instead of completing quit', async () => {
    let closed; const bridgeClose = new Promise(resolve => { closed = resolve; });
    const f = bootUpdateChain({ response: 1, bridgeClose });
    expect(await f.install()).toBe(true); await flush(); expect(f.events).toContain('bridge.close');
    f.updateEvents.emit('error', new Error('failure during shutdown')); closed(); await flush();
    expect(f.events).toContain('bridge.restart'); expect(f.events).not.toContain('quit.completed');
    f.state.response = 0; f.app.quit(); await flush();
    expect(f.events.filter(event => event === 'prompt')).toHaveLength(2);
  });

  it('a cancelled confirmation can be requested again without reusing a stale decision', async () => {
    const f = bootUpdateChain({ response: 0 });
    expect(await f.install()).toBe(false); f.state.response = 1;
    expect(await f.install()).toBe(true); await flush();
    expect(f.events.filter(event => event === 'prompt')).toHaveLength(2);
    expect(installations(f)).toHaveLength(1); expect(f.events).toContain('quit.completed');
  });

});
