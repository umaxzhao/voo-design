/**
 * Read-only adapter for the same platform-tab events used by WebSidebar.
 *
 * `getConnectedPlatforms` is the ONLY way the connected set leaves this module:
 * the failure advice needs to tell a website that can run now from one that
 * needs its tab opened, and the resolver below collapses the set to a single
 * pick, so a snapshot getter is required. Do not add a second listener or a
 * second cache elsewhere — that would give the codebase two connectivity
 * truths that can disagree.
 *
 * `isPlatformProbeUnknown` is the second thing this module owns: whether the
 * set above is an ANSWER or merely the last one we had. A failed listing keeps
 * the previous set and says so, so the resolver can refuse to move the user
 * onto the paid API route on the strength of a question nobody answered.
 */
import { BG, EVENTS } from "../shared/messages.js";
import { getSetting } from "../shared/settings.js";
import { getEnvironment, isHostAvailable } from "./rpc_environment.js";
import { callBackground } from "./rpc_background.js";
import { onHostEvent } from "./rpc_events.js";
import {
  normalizePlatformList,
  resolveGenerationTarget,
} from "./generation_target_defaults.js";

let connectedPlatforms = new Set();
let revision = 0;
let transportConnected = true;
/**
 * True when the last listing FAILED, so the adapter cannot say which websites
 * the user has open. Distinct from an empty listing on purpose: "we could not
 * ask" must never be read as "there is nothing there", because the caller then
 * routes the user onto the paid API path. Cleared by any listing we did get an
 * answer to, and by losing the host or the transport — those are answered
 * questions ("no host", "transport gone"), not unanswered ones.
 */
let probeUnknown = false;

function replacePlatforms(value) {
  revision += 1;
  connectedPlatforms = normalizePlatformList(value);
}

export async function refreshConnectedPlatforms() {
  if (!isHostAvailable() || !transportConnected) {
    probeUnknown = false;
    replacePlatforms([]);
    return;
  }
  const requestRevision = ++revision;
  try {
    const response = await callBackground(BG.LIST_PLATFORM_TABS);
    // A close/disconnect event must beat an older in-flight listing.
    if (requestRevision === revision) {
      probeUnknown = false;
      replacePlatforms(response);
    }
  } catch (error) {
    if (requestRevision === revision) {
      // The listing stays as it was and reads as unknown: a node created now
      // goes to the website path (see resolveGenerationTarget) rather than to
      // the configured API route, which spends the user's credits on a question
      // nobody answered.
      probeUnknown = true;
    }
    console.warn(
      "[generation-target] Platform tabs could not be listed; connectivity is unknown",
      error,
    );
  }
}

/**
 * Snapshot of the platforms connected right now.
 *
 * A fresh Set per call, so a caller mutating the result cannot change what the
 * adapter holds. Losing the host reads as "nothing connected" rather than as
 * the last listing we happened to have — a stale set would let the agent offer
 * a website whose tab is already gone. A failed listing is the one case that is
 * NOT "nothing connected": it keeps the previous set and reports itself through
 * `isPlatformProbeUnknown`, so the resolver can decline to choose.
 */
export function getConnectedPlatforms() {
  if (!isHostAvailable() || !transportConnected) return new Set();
  return new Set(connectedPlatforms);
}

/**
 * Whether VOO could not find out which websites are open.
 *
 * Callers that must decide between a website and a paid API route pass this to
 * `resolveGenerationTarget` as `connectivityUnknown`, so a failed probe never
 * bills the user for a website that was merely undetected.
 */
export function isPlatformProbeUnknown() {
  return probeUnknown && isHostAvailable() && transportConnected;
}

/** Install only AFTER environment detection, otherwise bridge events are lost. */
export function initializeGenerationTargets() {
  probeUnknown = false;
  replacePlatforms([]);
  transportConnected = true;
  const update = (payload) => {
    // A tab listing pushed by the host is an ANSWER, not a failed question, so
    // it also settles an earlier failed probe.
    if (payload?.tabs || payload?.platforms) {
      probeUnknown = false;
      replacePlatforms(payload);
    } else void refreshConnectedPlatforms();
  };
  const stop = [
    onHostEvent("ciw.platformTabs", update),
    onHostEvent("ciw.tabsChanged", update),
    onHostEvent(EVENTS.BRIDGE_INVALIDATED, () => {
      transportConnected = false;
      // The host is gone, which is an answer: nothing can be driven, and the
      // API route does not need it.
      probeUnknown = false;
      replacePlatforms([]);
    }),
  ];
  const bridge = getEnvironment().bridge;
  if (bridge?.onConnectionChange) {
    stop.push(
      bridge.onConnectionChange((connected) => {
        transportConnected = connected;
        probeUnknown = false;
        replacePlatforms([]);
        if (connected) void refreshConnectedPlatforms();
      }),
    );
  }
  const focus = () => void refreshConnectedPlatforms();
  globalThis.window?.addEventListener("focus", focus);
  const dispose = () => {
    revision += 1;
    probeUnknown = false;
    connectedPlatforms = new Set();
    stop.forEach((unsubscribe) => unsubscribe?.());
    globalThis.window?.removeEventListener("focus", focus);
    globalThis.window?.removeEventListener("pagehide", dispose);
  };
  globalThis.window?.addEventListener("pagehide", dispose, { once: true });
  return dispose;
}

/** Every creation reads current connectivity and settings, never a boot default. */
export function resolveNewGenerationTarget(options) {
  return resolveGenerationTarget({
    ...options,
    connectedPlatforms:
      isHostAvailable() && transportConnected ? connectedPlatforms : [],
    connectivityUnknown: isPlatformProbeUnknown(),
    disabledSites: getSetting("ciw.disabledSitePlatforms") ?? [],
  });
}
