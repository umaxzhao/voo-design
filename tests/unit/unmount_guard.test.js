import { describe, it, expect } from "vitest";
import { createUnmountGuard } from "../../src/canvas/components/agent-panel/unmount_guard.js";

function manualScheduler() {
  const queue = [];
  return {
    schedule: (fn) => queue.push(fn),
    flush: () => {
      while (queue.length) queue.shift()();
    },
  };
}

describe("createUnmountGuard", () => {
  it("survives the StrictMode mount → unmount → mount sequence", () => {
    const scheduler = manualScheduler();
    let aborted = 0;
    const guard = createUnmountGuard(() => { aborted += 1; }, { schedule: scheduler.schedule });

    guard.mount();       // first mount
    guard.unmount();      // StrictMode simulated unmount schedules the abort
    guard.mount();       // remount before the microtask runs
    scheduler.flush();

    expect(aborted).toBe(0);
    expect(guard.isAlive()).toBe(true);
  });

  it("aborts exactly once on a real unmount", () => {
    const scheduler = manualScheduler();
    let aborted = 0;
    const guard = createUnmountGuard(() => { aborted += 1; }, { schedule: scheduler.schedule });

    guard.mount();
    guard.unmount();
    scheduler.flush();

    expect(aborted).toBe(1);
    expect(guard.isAlive()).toBe(false);
  });

  it("does not abort when the mount is still active", () => {
    const scheduler = manualScheduler();
    let aborted = 0;
    const guard = createUnmountGuard(() => { aborted += 1; }, { schedule: scheduler.schedule });
    guard.mount();
    scheduler.flush();
    expect(aborted).toBe(0);
  });
});
