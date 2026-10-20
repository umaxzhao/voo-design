/**
 * PlanReviewCard — the pre-execution plan review gate's editable card.
 *
 * Shown beside PlanCard while a submitted plan waits for the user's decision.
 * The plan is initialised from the AgentRun's persisted `planReview` (so it
 * survives a reload) and edits are validated with `normalizePlanSteps` BEFORE
 * resolving; a `PlanValidationError` — e.g. removing a step another step still
 * depends on — is rendered inline and never allowed to throw into the loop.
 */

/* eslint-disable react/prop-types */
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import {
  PlanValidationError,
  normalizePlanSteps,
} from "../../agent-runtime/plan-model.js";
import { IconAdd, IconTrash } from "../../icons.jsx";

/** A draft keeps every normalized field so an untouched approve round-trips. */
function toDraft(step) {
  return {
    id: step.id || null,
    step: step.step || "",
    status: step.status || "pending",
    dependsOn: Array.isArray(step.dependsOn) ? [...step.dependsOn] : [],
    expectedResult: step.expectedResult ?? null,
    verification: step.verification ?? null,
    estimatedCost: step.estimatedCost ?? null,
    tools: Array.isArray(step.tools) ? [...step.tools] : [],
    toolCallIds: Array.isArray(step.toolCallIds) ? [...step.toolCallIds] : [],
    result: step.result ?? null,
  };
}

function newDraft() {
  return {
    id: null,
    step: "",
    status: "pending",
    dependsOn: [],
    expectedResult: null,
    verification: null,
    estimatedCost: null,
    tools: [],
    toolCallIds: [],
    result: null,
  };
}

/** Draft → raw update_plan shape. Ids are preserved so dependsOn stays valid. */
function toRawSteps(drafts) {
  return drafts.map((draft) => {
    const raw = { step: draft.step, status: draft.status };
    if (draft.id) raw.id = draft.id;
    if (draft.dependsOn.length > 0) raw.dependsOn = draft.dependsOn;
    if (draft.expectedResult != null) raw.expectedResult = draft.expectedResult;
    if (draft.verification != null) raw.verification = draft.verification;
    if (draft.estimatedCost != null) raw.estimatedCost = draft.estimatedCost;
    if (draft.tools.length > 0) raw.tools = draft.tools;
    return raw;
  });
}

export default function PlanReviewCard({ review, onResolve }) {
  const { t } = useI18n();
  const runId = review?.runId ?? null;
  const initialSteps = Array.isArray(review?.plan?.steps)
    ? review.plan.steps
    : [];
  const [drafts, setDrafts] = useState(() => initialSteps.map(toDraft));
  const [error, setError] = useState(null);

  if (initialSteps.length === 0) return null;

  const estimatedCost = Number(review?.estimatedCost) || 0;

  const updateDraft = (index, text) => {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, step: text } : draft)),
    );
  };

  const removeDraft = (index) => {
    setDrafts((current) => current.filter((_, i) => i !== index));
    setError(null);
  };

  const handleApprove = () => {
    setError(null);
    onResolve?.({ approved: true }, runId);
  };

  const handleEditAndRun = () => {
    try {
      const normalized = normalizePlanSteps(toRawSteps(drafts));
      setError(null);
      onResolve?.({ approved: true, editedSteps: normalized }, runId);
    } catch (err) {
      setError(
        err instanceof PlanValidationError
          ? err.message
          : t("agent.plan.review.invalid"),
      );
    }
  };

  const handleCancel = () => {
    setError(null);
    onResolve?.({ approved: false, cancelled: true }, runId);
  };

  return (
    <section
      data-testid="agent-plan-review-card"
      aria-label={t("agent.plan.review.title")}
      className="agent-plan-review rounded-xl bg-neutral-800 p-2.5"
    >
      <div className="flex items-center gap-2">
        <span className="agent-msg-label">{t("agent.plan.review.title")}</span>
        {estimatedCost > 0 && (
          <span className="ml-auto font-mono text-[10px] text-neutral-500">
            {t("agent.plan.review.estimatedCost", {
              cost: estimatedCost.toFixed(2),
            })}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[10px] text-neutral-500">
        {t("agent.plan.review.hint")}
      </p>

      <ul className="mt-1.5 flex flex-col gap-1">
        {drafts.map((draft, index) => (
          <li
            key={`${draft.id || "draft"}-${index}`}
            className="flex items-center gap-1.5"
          >
            <span className="w-3 shrink-0 text-center text-[10px] text-neutral-500">
              {index + 1}
            </span>
            <input
              type="text"
              value={draft.step}
              onChange={(event) => updateDraft(index, event.target.value)}
              aria-label={t("agent.plan.review.stepLabel", { index: index + 1 })}
              className="min-w-0 flex-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:bg-white/[0.1]"
            />
            <button
              type="button"
              onClick={() => removeDraft(index)}
              aria-label={t("agent.plan.review.removeStep", { index: index + 1 })}
              className="shrink-0 rounded-lg p-1 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <IconTrash size={12} />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        data-testid="agent-plan-review-add"
        onClick={() => setDrafts((current) => [...current, newDraft()])}
        className="mt-1.5 flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <IconAdd size={12} />
        {t("agent.plan.review.addStep")}
      </button>

      {error && (
        <p
          data-testid="agent-plan-review-error"
          className="mt-1.5 rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] text-rose-400"
        >
          {t("agent.plan.review.invalid")}: {error}
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          data-testid="agent-plan-review-approve"
          onClick={handleApprove}
          className="rounded-lg bg-[#a7ffd4]/15 px-2.5 py-1 text-[11px] font-medium text-[#a7ffd4] transition-colors hover:bg-[#a7ffd4]/25"
        >
          {t("agent.plan.review.approve")}
        </button>
        <button
          type="button"
          data-testid="agent-plan-review-edit"
          onClick={handleEditAndRun}
          className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-neutral-200 transition-colors hover:bg-white/[0.12]"
        >
          {t("agent.plan.review.editAndRun")}
        </button>
        <button
          type="button"
          data-testid="agent-plan-review-cancel"
          onClick={handleCancel}
          className="ml-auto rounded-lg px-2.5 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          {t("agent.plan.review.cancel")}
        </button>
      </div>
    </section>
  );
}
