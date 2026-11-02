import { expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { awaitKill } from '../../scripts/design-bench/runtime.mjs';

it.each([false, true])('awaits server exit (ignores SIGTERM: %s)', async ignoreTerm => {
  vi.useFakeTimers();
  const child = Object.assign(new EventEmitter(), { pid: 12345, exitCode: null, signalCode: null });
  const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    expect(pid).toBe(-child.pid);
    if (child.signalCode === null && (signal === 'SIGKILL' || !ignoreTerm)) setTimeout(() => {
      child.signalCode = signal;
      child.emit('exit', null, signal);
    }, 5);
    return true;
  });
  try {
    let finished = false;
    const stopping = awaitKill(child, { termMs: 30, killMs: 1000 }).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(ignoreTerm ? 30 : 4);
    expect(finished).toBe(false);
    await vi.runAllTimersAsync();
    await stopping;
    expect(child.signalCode).toBe(ignoreTerm ? 'SIGKILL' : 'SIGTERM');
    expect(child.listenerCount('exit')).toBe(0);
    expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
  } finally { vi.restoreAllMocks(); vi.useRealTimers(); }
});
