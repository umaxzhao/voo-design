export async function ready(url, child) {
  const deadline = Date.now() + Number(process.env.VOO_DESIGN_BENCH_READY_MS || 240000);
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.startError) throw child.startError || new Error(`Server exited: ${child.exitCode}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error(`Server did not become ready: ${url}`);
}

export const browserOptions = { headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=3072', '--disable-dev-shm-usage'] };

// Children are detached so terminate the whole server process group.
export async function awaitKill(child, { termMs = 1500, killMs = 1500 } = {}) {
  if (!child.pid) return;
  const exited = () => child.exitCode !== null || child.signalCode != null;
  const signal = name => {
    try { process.kill(-child.pid, name); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const wait = ms => new Promise(resolve => {
    if (exited()) return resolve(true);
    const onExit = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { child.removeListener('exit', onExit); resolve(exited()); }, ms);
    child.once('exit', onExit);
  });
  signal('SIGTERM');
  await wait(termMs);
  // The group may still contain descendants after its leader exits.
  signal('SIGKILL');
  if (!await wait(killMs)) throw new Error(`Process ${child.pid} did not exit after SIGKILL`);
}
