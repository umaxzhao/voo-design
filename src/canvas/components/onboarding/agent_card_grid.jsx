import PropTypes from "prop-types";
import { ProviderLogo } from "../provider_icons.jsx";
import { IconApi, IconCheck, ICON_STROKE_WIDTH } from "../../icons.jsx";
import { getVisibleCliAgents } from "../../../shared/cli-agents.js";
import { AGENT_DEFAULT_MODELS } from "./onboarding_agent_model.js";
import { AGENT_STATUS, AGENT_STATUS_KEY, cliAgentStatus, customAgentStatus } from "./agent_status_model.js";

const FOCUS_CLASS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40";
/** Cards keep the dialog's established order; platforms not listed follow the catalog. */
const CARD_ORDER = ["codex", "claude", "antigravity", "deepseek-harness"];

/**
 * The CLI platforms a first-run card can pick: visible in the catalog and
 * runnable as a native agent (they have a default model to apply on selection).
 */
export function selectableCliAgents(agents = getVisibleCliAgents(), order = CARD_ORDER) {
  const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
  return agents
    .filter((agent) => Object.hasOwn(AGENT_DEFAULT_MODELS, agent.id))
    .sort((a, b) => rank(a.id) - rank(b.id));
}

/** Test ids of the first-run dialog; other hosts pass their own via `testIds`. */
const DEFAULT_TEST_IDS = Object.freeze({
  grid: "first-run-agent-grid",
  card: "first-run-agent-card",
  status: "first-run-agent-status",
});

function AgentCard({ id, icon, name, status, statusText, selected, onSelect, testIds }) {
  const settled = status !== AGENT_STATUS.CHECKING;
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={`${testIds.card}-${id}`}
      onClick={onSelect}
      className={`relative flex min-h-[116px] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center transition-colors ${FOCUS_CLASS} ${
        selected ? "bg-white/[0.1]" : "bg-white/[0.04] hover:bg-white/[0.07]"
      }`}
    >
      {selected && (
        <span aria-hidden="true" className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-white text-black">
          <IconCheck size={10} strokeWidth={3} />
        </span>
      )}
      <span aria-hidden="true" className="flex size-7 items-center justify-center text-neutral-100">{icon}</span>
      <span className="max-w-full break-normal text-xs font-semibold text-neutral-100">{name}</span>
      <span
        data-testid={`${testIds.status}-${id}`}
        data-status={status}
        className={`max-w-full break-words text-[11px] ${status === AGENT_STATUS.CONNECTED ? "text-[#a7ffd4]" : "text-neutral-400"} ${settled ? "" : "animate-pulse"}`}
      >
        {status === AGENT_STATUS.CONNECTED ? (
          <span className="mr-1 inline-block size-1.5 rounded-full bg-[#a7ffd4]" aria-hidden="true" />
        ) : null}
        {statusText}
      </span>
    </button>
  );
}

AgentCard.propTypes = {
  id: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  name: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  statusText: PropTypes.string.isRequired,
  selected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  testIds: PropTypes.shape({ card: PropTypes.string.isRequired, status: PropTypes.string.isRequired }).isRequired,
};

/**
 * Two groups of cards: agents first (row 1), API providers second (row 2).
 *
 * Hosts adapt it through props, not forks: `agentIds` picks and orders the CLI
 * platforms, `showCustom` toggles the custom-model card, `testIds` renames hooks.
 */
export default function AgentCardGrid({
  t, label, selected, detection, customConfigured = false, onSelect,
  agentIds, showCustom = true, showCliAgents = true, testIds = DEFAULT_TEST_IDS,
  cloudProviders = [],
}) {
  const customStatus = customAgentStatus(customConfigured);
  const agents = showCliAgents
    ? selectableCliAgents(undefined, agentIds).filter((agent) => !agentIds || agentIds.includes(agent.id))
    : [];
  const hasApiProviders = cloudProviders.length > 0 || showCustom;
  const apiLabel = t("firstRun.provider.apiLabel");
  return (
    <div data-testid={testIds.grid ?? DEFAULT_TEST_IDS.grid} className="flex flex-col gap-3">
      {agents.length > 0 ? (
        <div role="group" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {agents.map((agent) => {
            const status = cliAgentStatus(agent, detection);
            return (
              <AgentCard
                key={agent.id}
                id={agent.id}
                icon={<ProviderLogo providerId={agent.providerId} size={28} />}
                name={t(`firstRun.provider.${agent.id}`)}
                status={status}
                statusText={t(AGENT_STATUS_KEY[status])}
                selected={selected === agent.id}
                onSelect={() => onSelect(agent.id)}
                testIds={testIds}
              />
            );
          })}
        </div>
      ) : null}
      {hasApiProviders && (
        <div role="group" aria-label={apiLabel} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-400">{apiLabel}</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cloudProviders.map((provider) => {
              const status = customAgentStatus(provider.configured);
              return (
                <AgentCard
                  key={provider.id}
                  id={provider.id}
                  icon={<ProviderLogo providerId={provider.logoId ?? provider.id} size={28} />}
                  name={t(provider.labelKey)}
                  status={status}
                  statusText={t(AGENT_STATUS_KEY[status])}
                  selected={selected === provider.id}
                  onSelect={() => onSelect(provider.id)}
                  testIds={testIds}
                />
              );
            })}
            {showCustom && (
              <AgentCard
                id="custom"
                icon={<IconApi size={26} strokeWidth={ICON_STROKE_WIDTH} />}
                name={t("firstRun.provider.custom")}
                status={customStatus}
                statusText={t(AGENT_STATUS_KEY[customStatus])}
                selected={selected === "custom"}
                onSelect={() => onSelect("custom")}
                testIds={testIds}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

AgentCardGrid.propTypes = {
  t: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  selected: PropTypes.string.isRequired,
  detection: PropTypes.shape({ phase: PropTypes.string.isRequired }).isRequired,
  customConfigured: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
  agentIds: PropTypes.arrayOf(PropTypes.string),
  showCustom: PropTypes.bool,
  showCliAgents: PropTypes.bool,
  cloudProviders: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    labelKey: PropTypes.string.isRequired,
    configured: PropTypes.bool,
  })),
  testIds: PropTypes.shape({ grid: PropTypes.string, card: PropTypes.string.isRequired, status: PropTypes.string.isRequired }),
};
