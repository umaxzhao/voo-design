import PropTypes from "prop-types";
import { getSetting } from "../../../shared/settings.js";

const AGENT_NAMES = {
  claude: "Claude Code",
  codex: "OpenAI Codex",
  antigravity: "Google Antigravity",
};

const WORKSPACE_NAMES = {
  electron: "本地磁盘",
  "web-fsa": "本地文件夹",
  "web-idb": "沙盒工作区",
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
  const activePath =
    workspaceConfig?.path || getSetting("voo.workspace.path") || "~/Documents/VOO/Projects";
  const activeType =
    workspaceConfig?.type || getSetting("voo.workspace.type") || "electron";

  return (
    <div className="flex flex-col gap-3">
      <SummaryRow
        testId="onboarding-ready-workspace-summary"
        label="工作区"
        value={WORKSPACE_NAMES[activeType] || WORKSPACE_NAMES.electron}
        detail={activePath}
      />
      <SummaryRow
        testId="onboarding-ready-agent-summary"
        label="智能体"
        value={AGENT_NAMES[selectedAgent] || AGENT_NAMES.claude}
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
