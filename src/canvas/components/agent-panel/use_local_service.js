import { useSyncExternalStore } from "react";
import { localServiceDiscovery } from "./local-service-discovery.js";

/** No per-component sockets, timers, settings writes or independent probes. */
export function useLocalService() {
  const snapshot = useSyncExternalStore(localServiceDiscovery.subscribe, localServiceDiscovery.getSnapshot, localServiceDiscovery.getSnapshot);
  const native = Boolean(globalThis.window?.vooDesktop?.localCli);
  return { ...snapshot, native: snapshot.native || native,
    phase: native && !snapshot.native ? "checking" : snapshot.phase };
}
