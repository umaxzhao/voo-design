import { BG } from "../../shared/messages.js";
import {
  CAPABILITY,
  isCapabilitySupported,
  isChatAutomationAvailable,
} from "../platform_capabilities.js";

const CONNECTION_RETRY_LIMIT = 20;
const CONNECTION_RETRY_DELAY_MS = 500;
const RETRYABLE_CODES = new Set([
  "extensionRequired",
  "extensionDisconnected",
  "desktopUnreachable",
  "desktopDisconnected",
]);

/** Probe the transport, never a platform page: readiness must not reload a conversation. */
export async function webRecoveryConnectionReady() {
  const { callBackground, getEnvironment } = await import("../rpc.js");
  const environment = getEnvironment();
  const desktop =
    isCapabilitySupported(CAPABILITY.DESKTOP_INTEGRATIONS, environment.mode) ||
    typeof environment.bridge?.onConnectionChange === "function";
  if (desktop) {
    const reply = await callBackground(
      BG.DESKTOP_LINKED,
      {},
      { timeoutMs: 1000 },
    );
    return reply?.linked === true;
  }
  return isChatAutomationAvailable(environment.mode);
}

/** Cancelled waits leave the durable journal untouched; disconnected waits are bounded. */
export async function waitForWebRecoveryConnection({
  isCurrent,
  ready = webRecoveryConnectionReady,
  pause = () =>
    new Promise((resolve) => setTimeout(resolve, CONNECTION_RETRY_DELAY_MS)),
  attempts = CONNECTION_RETRY_LIMIT,
}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!isCurrent()) return false;
    let connected = false;
    try {
      connected = await ready();
    } catch (error) {
      if (!RETRYABLE_CODES.has(error?.code)) throw error;
    }
    if (!isCurrent()) return false;
    if (connected) return true;
    if (attempt + 1 < attempts) await pause();
  }
  throw Object.assign(new Error("extensionRequired"), {
    code: "extensionRequired",
  });
}
