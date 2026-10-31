import { CLI_AGENTS, CLI_TRANSPORT, isCliAgentConnected, isDeepSeekHarnessAgent } from "../../../shared/cli-agents.js";
import { DSH_MODEL_PROVIDER_ID } from "./cloud_provider_presets.js";

/** What a first-run agent card says about its platform. */
export const AGENT_STATUS = Object.freeze({
  CHECKING: "checking",
  CONNECTED: "connected",
  NOT_INSTALLED: "notInstalled",
  NOT_SIGNED_IN: "notSignedIn",
  /**
   * DeepSeek Harness only: the app is installed, the VOO connector plugin is
   * not. It is not a sign-in problem — the dialog shows install guidance.
   */
  PLUGIN_MISSING: "pluginMissing",
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
  [AGENT_STATUS.PLUGIN_MISSING]: "firstRun.agentStatus.pluginMissing",
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
 * DeepSeek Harness is the one exception: the bridge reports the app as
 * `installed` and the VOO connector plugin as `authenticated`, so an installed
 * app without the plugin is `PLUGIN_MISSING` — a "third fact" the generic
 * signed-in/signed-out pair cannot express (the user has nothing to sign into).
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
  if (isDeepSeekHarnessAgent(agent)) {
    return status.authenticated === true ? AGENT_STATUS.CONNECTED : AGENT_STATUS.PLUGIN_MISSING;
  }
  return isCliAgentConnected(agent, status, detection.transport ?? CLI_TRANSPORT.NONE)
    ? AGENT_STATUS.CONNECTED
    : AGENT_STATUS.NOT_SIGNED_IN;
}

/** Hide the optional local model shortcut when its Harness connector is ready. */
export function visibleCloudProviderPresets(presets, detection, customGroups = []) {
  const availablePresets = presets.filter(preset => preset.id !== DSH_MODEL_PROVIDER_ID ||
    detection.showLocal !== false || customGroups.some(group => group.cliId === preset.customProviderId && group.models.length > 0));
  const harness = CLI_AGENTS.find(isDeepSeekHarnessAgent);
  if (!harness || cliAgentStatus(harness, detection) !== AGENT_STATUS.CONNECTED) {
    return availablePresets;
  }
  return availablePresets.filter((preset) => preset.id !== DSH_MODEL_PROVIDER_ID);
}

/** The custom-model card reports provider settings, not a CLI. */
export function customAgentStatus(configured) {
  return configured ? AGENT_STATUS.CONFIGURED : AGENT_STATUS.CONFIGURE;
}
