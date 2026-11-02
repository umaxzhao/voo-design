/**
 * Separates "React ran an effect cleanup" from "the component is really gone".
 *
 * React StrictMode mounts effects twice in development: mount → cleanup →
 * mount. A cleanup that aborts an in-flight agent turn on every call would kill
 * the turn a welcome-screen handoff had just started. The guard defers the
 * decision to a microtask, by which point a StrictMode remount has re-armed it;
 * only a real unmount leaves it disarmed.
 */
export function createUnmountGuard(onRealUnmount, { schedule = (fn) => queueMicrotask(fn) } = {}) {
  let alive = false;
  return {
    mount() {
      alive = true;
    },
    unmount() {
      alive = false;
      schedule(() => {
        if (!alive) onRealUnmount();
      });
    },
    isAlive() {
      return alive;
    },
  };
}
