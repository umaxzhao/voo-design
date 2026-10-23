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
