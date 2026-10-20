/**
 * PlanCard — keeps the most recent agent plan visible above the message stream.
 *
 * Step payloads come from the TODO_LIST item emitted by the agent loop and may
 * carry the structured plan fields (id, dependsOn, status incl. blocked /
 * failed / skipped) from agent-runtime/plan-model.js.
 */

/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { IconChevronDown } from "../../icons.jsx";
import MessageCopyButton from "./message-copy-button.jsx";

const STATUS_GLYPHS = {
  completed: "✓",
  in_progress: "→",
  pending: "○",
  blocked: "-",
  failed: "✕",
  skipped: "-",
};

export default function PlanCard({ plan }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const items = plan?.items || [];
  const completed = items.filter((step) => step.status === "completed").length;
  const allCompleted =
    items.length > 0 &&
    completed === items.length &&
    plan?.executionVerified !== false;
  const textById = new Map(
    items.filter((step) => step.id).map((step) => [step.id, step.step]),
  );
  const blockedByText = (step) => {
    if (!Array.isArray(step.dependsOn) || step.dependsOn.length === 0) {
      return null;
    }
    const statusById = new Map(items.map((s) => [s.id, s.status]));
    const open = step.dependsOn.filter(
      (dep) => statusById.get(dep) !== "completed",
    );
    if (open.length === 0) return null;
    return t("agent.plan.blockedBy", {
      steps: open.map((dep) => textById.get(dep) || dep).join(", "),
    });
  };
  const copyText = [
    t("agent.system.plan"),
    ...items.map(
      (step) =>
        `${STATUS_GLYPHS[step.status] || STATUS_GLYPHS.pending} ${step.step}`,
    ),
  ].join("\n");

  useEffect(() => {
    setExpanded(!allCompleted);
  }, [allCompleted]);

  if (items.length === 0) return null;

  return (
    <section
      data-testid="agent-plan-card"
      aria-label={t("agent.system.plan")}
      className={`agent-plan-card ${allCompleted ? "agent-plan-card-complete" : ""}`}
    >
      <div className="agent-plan-header">
        <button
          type="button"
          className="agent-plan-toggle"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          <span className="agent-msg-label">{t("agent.system.plan")}</span>
          <span className="agent-plan-progress">
            {t("agent.plan.progress", {
              completed,
              count: items.length,
            })}
          </span>
          <IconChevronDown size={12} className={expanded ? "rotate-180" : ""} />
        </button>
        <MessageCopyButton text={copyText} className="agent-plan-copy" />
      </div>
      {expanded && (
        <ul className="agent-plan-list">
          {items.map((step) => {
            const blockedText =
              step.status === "blocked" ? blockedByText(step) : null;
            return (
              <li
                key={`${step.status}-${step.step}`}
                className={`agent-plan-step agent-plan-${step.status}`}
              >
                <span className="agent-plan-status" aria-hidden="true">
                  {STATUS_GLYPHS[step.status] || STATUS_GLYPHS.pending}
                </span>
                <span
                  className={
                    step.status === "failed"
                      ? "text-rose-400"
                      : step.status === "blocked" || step.status === "skipped"
                        ? "text-neutral-500"
                        : undefined
                  }
                >
                  {step.step}
                </span>
                {step.status === "failed" && (
                  <span className="text-[10px] text-rose-400">
                    {t("agent.plan.failed")}
                  </span>
                )}
                {blockedText && (
                  <span className="text-[10px] text-neutral-500">
                    {blockedText}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
