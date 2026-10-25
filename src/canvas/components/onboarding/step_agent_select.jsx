import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import AgentCardGrid from "./agent_card_grid.jsx";
import { useAgentDetection } from "./use_agent_detection.js";

/** The guide offers the CLI platforms only (no custom model) and keeps Claude Code first. */
const GUIDE_AGENT_IDS = ["claude", "codex", "antigravity"];

const GUIDE_TEST_IDS = Object.freeze({
  grid: "onboarding-agent-grid",
  card: "onboarding-agent-option",
  status: "onboarding-agent-status",
});

/** Step 2: the same card grid as the first-run dialog, bound to the guide's own selection. */
export default function StepAgentSelect({ selectedAgent, onSelectAgent }) {
  const { t } = useI18n();
  // The step mounts when the user reaches it, so detection runs once per visit.
  const detection = useAgentDetection(true);
  return (
    <AgentCardGrid
      t={t}
      label={t("firstRun.provider.label")}
      selected={selectedAgent}
      detection={detection}
      agentIds={GUIDE_AGENT_IDS}
      showCustom={false}
      testIds={GUIDE_TEST_IDS}
      onSelect={onSelectAgent}
    />
  );
}

StepAgentSelect.propTypes = {
  selectedAgent: PropTypes.string.isRequired,
  onSelectAgent: PropTypes.func.isRequired,
};
