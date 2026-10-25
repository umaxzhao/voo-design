import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../use_i18n.js";
import AgentAssistantSettings from "./agent_assistant_settings.jsx";
import AgentMcpSettings from "./agent_mcp_settings.jsx";
import AgentModelsSettings from "./agent_models_settings.jsx";
import SettingsSection from "./settings_section.jsx";
import SettingsTabStrip, { SettingsTabPanel } from "./settings_tab_strip.jsx";

export const AGENT_TAB = { ASSISTANT: "assistant", MODELS: "models", MCP: "mcp", CLI: "cli" };
const AGENT_TAB_PREFIX = "agent-settings";
const DEFAULT_AGENT_TAB = AGENT_TAB.ASSISTANT;

/** Tab order and labels; the Assistant tab is first and the default. */
const AGENT_TABS = [
  { id: AGENT_TAB.ASSISTANT, labelKey: "settings.assistant.tabAssistant" },
  { id: AGENT_TAB.MODELS, labelKey: "settings.assistant.modelsTitle" },
  { id: AGENT_TAB.MCP, labelKey: "settings.assistant.tabMcp" },
  { id: AGENT_TAB.CLI, labelKey: "settings.assistant.tabCli" },
];

const BUTTON_CLASS =
  "min-h-9 self-start rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-neutral-200 outline-none hover:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

/** The Local CLI tab: opens the setup wizard, which lives outside the settings drawer. */
function AgentCliSettings({ onOpenWizard }) {
  const { t } = useI18n();
  return (
    <SettingsSection title={t("settings.assistant.tabCli")} hint={t("settings.assistant.cliHint")}>
      <button type="button" onClick={onOpenWizard} className={BUTTON_CLASS}>
        {t("titlebar.cliWizard")}
      </button>
    </SettingsSection>
  );
}

AgentCliSettings.propTypes = { onOpenWizard: PropTypes.func };

/** Renders only the selected tab's content. */
function AgentTabContent({ tab, onOpenProviders, onOpenWizard }) {
  if (tab === AGENT_TAB.MODELS) return <AgentModelsSettings onOpenProviders={onOpenProviders} />;
  if (tab === AGENT_TAB.MCP) return <AgentMcpSettings />;
  if (tab === AGENT_TAB.CLI) return <AgentCliSettings onOpenWizard={onOpenWizard} />;
  return <AgentAssistantSettings />;
}

AgentTabContent.propTypes = {
  tab: PropTypes.string.isRequired,
  onOpenProviders: PropTypes.func,
  onOpenWizard: PropTypes.func,
};

/** Agent settings as tabs. Provider keys live in AI Providers; models are chosen here from them. */
export default function AgentSettings({ onOpenProviders, onOpenWizard }) {
  const { t } = useI18n();
  const [tab, setTab] = useState(DEFAULT_AGENT_TAB);
  const tabs = AGENT_TABS.map(({ id, labelKey }) => ({
    id,
    label: t(labelKey),
    testId: `agent-settings-tab-${id}`,
  }));

  return (
    <div className="flex flex-col gap-3">
      <SettingsTabStrip
        tabs={tabs}
        selectedId={tab}
        onSelect={setTab}
        label={t("settings.tabAssistant")}
        idPrefix={AGENT_TAB_PREFIX}
        columnsClass="grid-cols-2 sm:grid-cols-4"
      />
      <SettingsTabPanel idPrefix={AGENT_TAB_PREFIX} selectedId={tab} testId="agent-settings-panel">
        <AgentTabContent tab={tab} onOpenProviders={onOpenProviders} onOpenWizard={onOpenWizard} />
      </SettingsTabPanel>
    </div>
  );
}

AgentSettings.propTypes = {
  /** Switches the drawer to the AI Providers tab. */
  onOpenProviders: PropTypes.func,
  /** Closes the drawer and opens the Local CLI setup wizard. */
  onOpenWizard: PropTypes.func,
};
