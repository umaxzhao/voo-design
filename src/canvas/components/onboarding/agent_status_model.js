import { CLI_TRANSPORT, isCliAgentConnected } from "../../../shared/cli-agents.js";

/** What a first-run agent card says about its platform. */
export const AGENT_STATUS = Object.freeze({
  CHECKING: "checking",
  CONNECTED: "connected",
  NOT_INSTALLED: "notInstalled",
  NOT_SIGNED_IN: "notSignedIn",
  /** No bridge to ask (web build, read-only link) or the bridge could not answer. */
  UNAVAILABLE: "unavailable",
  /** Custom model only: no provider with models yet. */
  CONFIGURE: "configure",
  /** Custom model only: at least one provider with models. */
  CONFIGURED: "configured",
});

/** Phases of the one-shot local CLI detection run when the dialog opens. */
export const DETECTION_PHASE = Object.freeze({
  CHECKING: "checking",
  DONE: "done",
  UNAVAILABLE: "unavailable",
});

export const AGENT_STATUS_KEY = Object.freeze({
  [AGENT_STATUS.CHECKING]: "firstRun.agentStatus.checking",
  [AGENT_STATUS.CONNECTED]: "firstRun.agentStatus.connected",
  [AGENT_STATUS.NOT_INSTALLED]: "firstRun.agentStatus.notInstalled",
  [AGENT_STATUS.NOT_SIGNED_IN]: "firstRun.agentStatus.notSignedIn",
  [AGENT_STATUS.UNAVAILABLE]: "firstRun.agentStatus.unavailable",
  [AGENT_STATUS.CONFIGURE]: "firstRun.agentStatus.configure",
  [AGENT_STATUS.CONFIGURED]: "firstRun.agentStatus.configured",
});

/**
 * Maps one `localCli.checkAll()` entry onto a card status.
 *
 * "Connected" is decided by `isCliAgentConnected` — the app's single rule for a
 * usable CLI — so this card cannot call green what a run would refuse.
 *
 * @param {{id: string}} agent a `CLI_AGENTS` entry
 * @param {{phase: string, transport?: string, statuses?: object|null}} detection
 */
export function cliAgentStatus(agent, detection) {
  if (detection.phase === DETECTION_PHASE.CHECKING) return AGENT_STATUS.CHECKING;
  if (detection.phase !== DETECTION_PHASE.DONE) return AGENT_STATUS.UNAVAILABLE;
  const status = detection.statuses?.[agent.id];
  if (!status) return AGENT_STATUS.UNAVAILABLE;
  if (!status.installed) return AGENT_STATUS.NOT_INSTALLED;
  if (status.status === "unavailable") return AGENT_STATUS.UNAVAILABLE;
  return isCliAgentConnected(agent, status, detection.transport ?? CLI_TRANSPORT.NONE)
    ? AGENT_STATUS.CONNECTED
    : AGENT_STATUS.NOT_SIGNED_IN;
}

/** The custom-model card reports provider settings, not a CLI. */
export function customAgentStatus(configured) {
  return configured ? AGENT_STATUS.CONFIGURED : AGENT_STATUS.CONFIGURE;
}
