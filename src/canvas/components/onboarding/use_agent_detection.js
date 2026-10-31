import { useEffect } from "react";
import { useLocalService } from "../agent-panel/use_local_service.js";
import { localServiceDiscovery } from "../agent-panel/local-service-discovery.js";
import { resolveCliTransport } from "../agent-panel/local_cli_bridge.js";
import { CLI_TRANSPORT } from "../../../shared/cli-agents.js";
import { DETECTION_PHASE } from "./agent_status_model.js";

const UNAVAILABLE = Object.freeze({ phase: DETECTION_PHASE.UNAVAILABLE });

/**
 * Asks the app's local CLI bridge for every CLI's status (`localCli.checkAll`).
 *
 * Never dials the loopback bridge: drawing the dialog must not make a browser
 * ask for local-network access, so a web page without an already-open bridge
 * resolves to UNAVAILABLE ("Not detected"), which is a state, not an error.
 * A read-only link is treated the same way: its reads are true, but the CLI
 * cannot be run from there. A failed probe is also UNAVAILABLE; the setup
 * guide offers the full diagnostics.
 */
export async function detectLocalClis(resolveTransport = resolveCliTransport) {
  try {
    const { bridge, transport } = await resolveTransport();
    if (transport !== CLI_TRANSPORT.RUNNABLE || typeof bridge?.checkAll !== "function") {
      return UNAVAILABLE;
    }
    const statuses = await bridge.checkAll();
    return { phase: DETECTION_PHASE.DONE, transport, statuses };
  } catch {
    return UNAVAILABLE;
  }
}

/** Reuse the same live detection as the welcome and agent model menus. */
export function useAgentDetection(open) {
  const service = useLocalService();
  useEffect(() => { if (open) void localServiceDiscovery.refresh(); }, [open]);
  return { ...service, transport: service.available ? CLI_TRANSPORT.RUNNABLE : CLI_TRANSPORT.NONE,
    showLocal: service.native || service.available, refresh: localServiceDiscovery.refresh };
}
