/**
 * RunStore initialization for the agent loop.
 *
 * Extracted from useAgentLoop (AO3c). React-free: the store lives in the
 * injected ref, persistence errors surface through the injected store.
 *
 * @module agent-runtime/agent-run-store-init
 */

import { RunStore } from "./run-store.js";
import {
  CAPABILITY,
  isCapabilitySupported,
} from "../platform_capabilities.js";

/**
 * Lazily create the persistent run store. In standalone web mode, tabs have
 * no background execution daemon; on reload/mount any orphaned in-flight runs
 * are immediately recovered as stopped/resumable. In extension/desktop mode,
 * allow 60s grace for active tabs.
 */
export function ensureAgentRunStore({ runStoreRef, storagePrefix, getStore }) {
  if (!runStoreRef.current) {
    runStoreRef.current = new RunStore({
      storagePrefix:
        storagePrefix === null ? null : storagePrefix || "voo.agent.runs",
      onWriteError: (outcome) => {
        const isQuota = outcome?.code === "quota_exceeded";
        getStore?.()?.setSaveError?.(isQuota ? "quota_exceeded" : true);
      },
    });
    runStoreRef.current.recoverStaleRuns({
      maxAgeMs: isCapabilitySupported(CAPABILITY.BACKGROUND_AGENT)
        ? 60_000
        : 0,
    });
  }
  return runStoreRef.current;
}
