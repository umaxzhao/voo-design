/**
 * ApprovalMenu — the "more" overlay for the composer bar.
 *
 * Hosts the controls that do not fit the bottom bar: execution speed
 * (Thinking/Fast, or the Codex reasoning-effort slider), the four approval
 * modes, the session token usage and the default media models. Pure
 * presentational; all state lives in AgentPanel, except the model routes,
 * which ComposerModelRoutes reads and writes through the settings store.
 */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import InfoHint from "../info_hint.jsx";
import { APPROVAL_MODE } from "./eventTypes.js";
import ComposerModelRoutes from "./composer_model_routes.jsx";
import ReasoningEffortSelect from "./reasoning_effort_select.jsx";
import ComposerAgentModel from "./composer_agent_model.jsx";

/** "1234" → "1.2K"; "1234567" → "1.2M". */
export function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ApprovalMenu({
  open,
  approvalMode,
  budgetUsed,
  tokenBudget,
  onSelect,
  agentSpeed,
  onSelectSpeed,
  planReviewEnabled = false,
  onTogglePlanReview = null,
  reasoning = null,
  llmConfig = null,
  isRunning = false,
  onOpenSettings = null,
  onCloseMenu = null,
}) {
  const { t } = useI18n();
  if (!open) return null;

  const modes = [
    {
      mode: APPROVAL_MODE.AUTO_CREATE,
      label: t("agent.approval.autoCreate"),
    },
    {
      mode: APPROVAL_MODE.FULL_AUTO,
      label: t("agent.approval.fullAuto"),
    },
    {
      mode: APPROVAL_MODE.AUTO_REVIEW,
      label: t("agent.approval.autoReview"),
    },
    {
      mode: APPROVAL_MODE.SUGGEST,
      label: t("agent.approval.onRequest"),
    },
  ];

  // `max-h` + `ui-scroll` rather than `overflow-hidden`: the model section
  // made this tall enough to reach the top of a short window, and a menu that
  // clips its own top row hides the controls it was opened for. Same cap as
  // ModeSkillMenu, which sits in the same corner.
  return (
    <div
      data-testid="agent-more-menu"
      className="ui-scroll absolute bottom-full left-0 mb-2 z-50 max-h-[calc(100vh-220px)] w-64 overflow-y-auto overflow-x-hidden rounded-xl bg-neutral-900 p-1.5 shadow-menu border border-white/10"
    >
      <ComposerAgentModel
        llmConfig={llmConfig}
        isRunning={isRunning}
        onOpenSettings={onOpenSettings}
        onCloseMenu={onCloseMenu}
      />

      <div className="px-2 py-1 text-[10px] text-neutral-500 font-semibold uppercase tracking-wider border-t border-white/10 mt-1 pt-2">
        {reasoning
          ? t("agent.reasoning.label")
          : t("agent.executionMode.title")}
      </div>
      {reasoning ? (
        <div className="px-1 pb-1">
          <ReasoningEffortSelect
            key={reasoning.model}
            className="w-full"
            model={reasoning.model}
            effort={reasoning.effort}
            efforts={reasoning.efforts}
            capabilityError={reasoning.capabilityError}
            disabled={reasoning.disabled}
            onRefresh={reasoning.onRefresh}
            onError={reasoning.onError}
          />
        </div>
      ) : (
        <div
          className="mx-1 mb-1 flex items-center rounded-lg bg-white/[0.06] p-0.5"
          data-testid="agent-speed-toggle"
          role="group"
        >
          {["thinking", "fast"].map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => onSelectSpeed(speed)}
              aria-pressed={agentSpeed === speed}
              aria-label={t(`agent.executionMode.${speed}`)}
              className={`flex-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                agentSpeed === speed
                  ? "bg-[#E5B2FF]/20 text-[#eed0ff]"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {t(`agent.executionMode.${speed}`)}
            </button>
          ))}
        </div>
      )}

      <div className="px-2 py-1 text-[10px] text-neutral-500 font-semibold uppercase tracking-wider border-t border-white/10 mt-1 pt-2 flex items-center justify-between gap-2">
        <span className="truncate">{t("agent.approvalMode")}</span>
        {/* Sits on the section heading rather than on its own row: the menu is
            capped by max-height, and an extra row pushed the composer's
            Thinking/Fast control underneath it. */}
        <button
          type="button"
          data-testid="agent-plan-review-toggle"
          onClick={() => onTogglePlanReview?.(!planReviewEnabled)}
          aria-pressed={planReviewEnabled}
          title={t("agent.plan.review.toggle")}
          className="flex shrink-0 items-center gap-1.5 normal-case tracking-normal font-normal text-neutral-400 transition-colors hover:text-white"
        >
          <span>{t("agent.plan.review.toggleShort")}</span>
          <span
            aria-hidden="true"
            className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${
              planReviewEnabled ? "bg-[#a7ffd4]/60" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${
                planReviewEnabled ? "left-3" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </div>
      {modes.map((item) => (
        <button
          key={item.mode}
          type="button"
          onClick={() => onSelect(item.mode)}
          className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.06] ${
            approvalMode === item.mode
              ? "font-semibold text-white bg-white/10"
              : "text-neutral-400"
          }`}
        >
          {item.label}
        </button>
      ))}
      <div className="mt-1 pt-1 border-t border-white/10 px-2 py-1 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
        <span>{t("agent.tokens")}</span>
        <span>
          {formatTokens(budgetUsed)}
          {Number.isFinite(tokenBudget) && ` / ${formatTokens(tokenBudget)}`}
        </span>
      </div>

      {/* Default models for new image / video / audio generations. The
          same routes as Settings, written to the same store. */}
      <div className="px-2 py-1 text-[10px] text-neutral-500 font-semibold uppercase tracking-wider border-t border-white/10 mt-1 pt-2">
        <InfoHint
          label={t("agent.defaultModels.title")}
          text={t("agent.defaultModels.hint")}
        />
      </div>
      <ComposerModelRoutes />
    </div>
  );
}

ApprovalMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  approvalMode: PropTypes.string.isRequired,
  budgetUsed: PropTypes.number.isRequired,
  tokenBudget: PropTypes.number.isRequired,
  onSelect: PropTypes.func.isRequired,
  agentSpeed: PropTypes.string.isRequired,
  onSelectSpeed: PropTypes.func.isRequired,
  planReviewEnabled: PropTypes.bool,
  onTogglePlanReview: PropTypes.func,
  reasoning: PropTypes.shape({
    model: PropTypes.string.isRequired,
    effort: PropTypes.string,
    efforts: PropTypes.arrayOf(PropTypes.string),
    capabilityError: PropTypes.string,
    disabled: PropTypes.bool,
    onRefresh: PropTypes.func.isRequired,
    onError: PropTypes.func.isRequired,
  }),
  llmConfig: PropTypes.shape({
    providerId: PropTypes.string,
    model: PropTypes.string,
    availableProviders: PropTypes.array,
  }),
  isRunning: PropTypes.bool,
  onOpenSettings: PropTypes.func,
  onCloseMenu: PropTypes.func,
};
