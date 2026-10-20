/* eslint-disable react/prop-types */
import { useI18n } from "../../use_i18n.js";

export default function AgentStatusBar({ isRunning }) {
  const { t } = useI18n();
  if (!isRunning) return null;

  return (
    <div className="agent-typing flex items-center gap-1.5 py-1 px-1">
      <span className="agent-dot" />
      <span className="agent-dot" />
      <span className="agent-dot" />
      <span className="text-[11px] text-neutral-500 pl-1">
        {t("agent.thinking")}
      </span>
    </div>
  );
}
