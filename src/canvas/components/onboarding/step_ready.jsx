import PropTypes from "prop-types";
import { getSetting } from "../../../shared/settings.js";
import { useI18n } from "../../use_i18n.js";
import { AGENT_NAME_KEYS } from "./onboarding_state.js";

/** i18n key of each workspace type's display name. */
const WORKSPACE_NAME_KEYS = {
  electron: "onboardingGuide.workspace.native",
  "web-fsa": "onboardingGuide.workspace.fsa",
  "web-idb": "onboardingGuide.workspace.virtual",
};

function SummaryRow({ testId, label, value, detail }) {
  return (
    <div data-testid={testId} className="flex flex-col gap-1 rounded-2xl bg-white/[0.04] p-4">
      <span className="text-[11px] text-neutral-400">{label}</span>
      <span className="text-xs font-semibold text-neutral-100">{value}</span>
      {detail && <span className="truncate font-mono text-[11px] text-neutral-400">{detail}</span>}
    </div>
  );
}

SummaryRow.propTypes = {
  testId: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  detail: PropTypes.string,
};

export default function StepReady({ selectedAgent, workspaceConfig }) {
  const { t } = useI18n();
  const activePath =
    workspaceConfig?.path || getSetting("voo.workspace.path") || "~/Documents/VOO/Projects";
  const activeType =
    workspaceConfig?.type || getSetting("voo.workspace.type") || "electron";

  return (
    <div className="flex flex-col gap-3">
      <SummaryRow
        testId="onboarding-ready-workspace-summary"
        label={t("onboardingGuide.ready.workspace")}
        value={t(WORKSPACE_NAME_KEYS[activeType] || WORKSPACE_NAME_KEYS.electron)}
        detail={activePath}
      />
      <SummaryRow
        testId="onboarding-ready-agent-summary"
        label={t("firstRun.provider.label")}
        value={t(AGENT_NAME_KEYS[selectedAgent] || AGENT_NAME_KEYS.claude)}
      />
    </div>
  );
}

StepReady.propTypes = {
  selectedAgent: PropTypes.string.isRequired,
  workspaceConfig: PropTypes.shape({
    path: PropTypes.string,
    type: PropTypes.string,
    name: PropTypes.string,
    isDefault: PropTypes.bool,
    isConfigured: PropTypes.bool,
  }),
};
