/**
 * HistoryDrawer — the conversation-history overlay.
 *
 * Pure presentational: lists stored sessions, lets the user switch to one,
 * start a new chat, or delete a record. All state lives in AgentPanel.
 */

import PropTypes from "prop-types";
import { IconAdd, IconClose, IconTrash } from "../../icons.jsx";
import { useId, useRef, useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { useWorkflowStore } from "../../store/workflow_store.js";
import {
  getRunLineage,
  projectTaskDeliverables,
} from "../../agent-runtime/task-deliverables.js";
import { retryNodeIdsForRun } from "../../agent-runtime/run-store-operations.js";
import RunDeliveryEvidence from "./RunDeliveryEvidence.jsx";

/**
 * A stored session title can be legacy data: strings, but also the multimodal
 * message array it was derived from. Rendering one of those as a React child
 * unmounts the whole canvas (the "click History and the page goes black" bug),
 * so everything that reaches the DOM goes through here.
 */
function sessionLabel(session, t) {
  const title = session?.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  if (Array.isArray(title)) {
    const text = title
      .map((part) => (typeof part === "string" ? part : part?.text))
      .filter((part) => typeof part === "string" && part.trim())
      .join(" ")
      .trim();
    if (text) return text;
  }
  return t("agent.untitled");
}

/** `updatedAt`/`createdAt` are legacy-friendly: show nothing when unparseable. */
function sessionDate(session) {
  const stamp = Number(session?.updatedAt ?? session?.createdAt);
  if (!Number.isFinite(stamp) || stamp <= 0) return "";
  return new Date(stamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryDrawer({
  open,
  sessions = [],
  currentSessionId,
  onSelect,
  onNewChat,
  onClose,
  onDelete,
  runs = [],
  onResumeRun,
  onAbandonRun,
  onTakeoverRun,
  agentName = null,
  agentColor = null,
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState("sessions");
  const tabId = useId();
  const tabRefs = useRef([]);
  const nodes = useWorkflowStore((state) => state.nodes);
  const workflowId = useWorkflowStore((state) => state.workflowId);
  const projectRoot = useWorkflowStore((state) => state.projectRoot);
  const visibleRuns = runs.filter((run) => run.workflowId === workflowId);
  if (!open) return null;

  function handleTabKeyDown(event, currentIndex) {
    const tabKeys = ["sessions", "runs"];
    let nextIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % 2;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex + 1) % 2;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = 1;
    else return;

    event.preventDefault();
    event.stopPropagation();
    setTab(tabKeys[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <>
      <div
        data-testid="history-drawer"
        className="pointer-events-auto flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/95 px-4 py-3 shadow-panel backdrop-blur-md"
      >
        {agentName ? (
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-1.5 min-w-0">
              {agentColor ? (
                <span
                  data-testid="agent-header-color-dot"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: agentColor }}
                />
              ) : null}
              <span className="truncate text-xs font-semibold text-neutral-100">
                {agentName}
              </span>
            </div>
            <span className="text-[10px] font-medium text-neutral-500">
              Agent
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div
            role="tablist"
            className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5"
          >
            <button
              type="button"
              ref={(element) => {
                tabRefs.current[0] = element;
              }}
              id={`${tabId}-sessions-tab`}
              role="tab"
              aria-controls={`${tabId}-sessions-panel`}
              aria-selected={tab === "sessions"}
              tabIndex={tab === "sessions" ? 0 : -1}
              onClick={() => setTab("sessions")}
              onKeyDown={(event) => handleTabKeyDown(event, 0)}
              className={`rounded-md px-2 py-1 text-[10px] ${tab === "sessions" ? "bg-white/10 text-white" : "text-neutral-500"}`}
            >
              {t("agent.history")}
            </button>
            <button
              type="button"
              ref={(element) => {
                tabRefs.current[1] = element;
              }}
              id={`${tabId}-runs-tab`}
              role="tab"
              aria-controls={`${tabId}-runs-panel`}
              aria-selected={tab === "runs"}
              tabIndex={tab === "runs" ? 0 : -1}
              onClick={() => setTab("runs")}
              onKeyDown={(event) => handleTabKeyDown(event, 1)}
              className={`rounded-md px-2 py-1 text-[10px] ${tab === "runs" ? "bg-white/10 text-white" : "text-neutral-500"}`}
            >
              {t("agent.runs")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNewChat}
              className="flex items-center gap-1 text-[11px] font-medium text-[#E5B2FF] hover:underline"
            >
              <IconAdd size={12} />
              <span>{t("agent.newChat")}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("agent.history.close")}
              title={t("agent.history.close")}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              <IconClose size={14} />
            </button>
          </div>
        </div>

        {tab === "sessions" ? (
          <div
            id={`${tabId}-sessions-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-sessions-tab`}
            tabIndex={0}
            className="flex-1 overflow-y-auto ui-scroll flex flex-col gap-1.5 pt-2"
          >
            {sessions.length === 0 && (
              <p className="text-xs text-neutral-500 py-6 text-center">
                {t("agent.noHistory")}
              </p>
            )}
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className={`group flex items-center justify-between rounded-xl text-left transition-colors ${
                  sess.id === currentSessionId
                    ? "bg-white/10 text-white font-medium"
                    : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(sess)}
                  aria-current={
                    sess.id === currentSessionId ? "true" : undefined
                  }
                  className="min-w-0 flex-1 py-2 pl-3 pr-2 text-left"
                >
                  <p className="truncate text-xs">{sessionLabel(sess, t)}</p>
                  {sessionDate(sess) ? (
                    <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
                      {sessionDate(sess)}
                    </p>
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label={`${t("agent.deleteHistory")}: ${sessionLabel(sess, t)}`}
                  title={t("agent.deleteHistory")}
                  onClick={(e) => onDelete(e, sess.id)}
                  className="mr-3 flex h-6 w-6 items-center justify-center rounded-lg text-neutral-500 hover:bg-white/10 hover:text-rose-400 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div
            id={`${tabId}-runs-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-runs-tab`}
            tabIndex={0}
            className="flex-1 overflow-y-auto ui-scroll flex flex-col gap-1.5 pt-2"
          >
            {visibleRuns.length === 0 && (
              <p className="text-xs text-neutral-500 py-6 text-center">
                {t("agent.noRuns")}
              </p>
            )}
            {visibleRuns.map((run) => {
              const failedCount = (run.changeSets || []).filter(
                (entry) => entry.status === "failed",
              ).length;
              const statusLabel = t(`agent.runStatus.${run.status}`);
              const lineage = getRunLineage(run, runs);
              const delivery = projectTaskDeliverables(
                run,
                run.workflowId === workflowId ? nodes : [],
                lineage,
                { projectRoot },
              );
              const retryNodeIds = retryNodeIdsForRun(run);
              const retryable =
                ["failed", "stopped", "cancelled", "waiting_input"].includes(
                  run.status,
                ) ||
                (run.status === "completed" &&
                  delivery.status === "incomplete" &&
                  retryNodeIds.length > 0);
              const inspectRecovery =
                retryable &&
                (run.changeSets || []).some(
                  (entry) => entry.toolName === "run_workflow",
                ) &&
                retryNodeIds.length === 0;
              return (
                <div
                  key={run.id}
                  className="rounded-xl bg-white/[0.04] px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-neutral-200">
                        {run.objective || t("agent.untitled")}
                      </p>
                      <p className="mt-0.5 text-[10px] text-neutral-500">
                        {t("agent.runStatus", { status: statusLabel })}
                        {failedCount > 0
                          ? ` · ${t("agent.failedCount", { count: failedCount })}`
                          : ""}
                      </p>
                      <p className="mt-0.5 text-[10px] text-neutral-500 font-mono tabular-nums">
                        {t("agent.runProgress", {
                          step: run.currentStepId || t("agent.runStepUnknown"),
                          spent: Number(run.spentBudget || 0).toFixed(2),
                        })}
                      </p>
                      {delivery.status === "unspecified" ? (
                        <p className="mt-1 text-[10px] text-neutral-500">
                          {t("agent.deliverables.unspecified")}
                        </p>
                      ) : (
                        <div className="mt-1 flex flex-col gap-0.5 text-[10px] text-neutral-400">
                          <p
                            className={
                              delivery.completed
                                ? "text-emerald-400"
                                : "text-amber-400"
                            }
                          >
                            {t(`agent.deliverables.${delivery.status}`)}
                          </p>
                          {delivery.items.map((item) => (
                            <div key={item.mediaType} className="tabular-nums">
                              <p>
                                {t("agent.deliverables.progress", {
                                  type: t(
                                    `agent.deliverables.type.${item.mediaType}`,
                                  ),
                                  generated: item.generated,
                                  count: item.count,
                                })}
                                {item.pendingReview > 0 &&
                                !item.requireVerification
                                  ? ` · ${t("agent.deliverables.pendingReview")}`
                                  : ""}
                                {item.requireVerification &&
                                item.verified < item.count
                                  ? ` · ${t(`agent.deliverables.verification.${item.verificationStatus}`)}`
                                  : ""}
                                {item.requireExport
                                  ? ` · ${t("agent.deliverables.exportUnconfirmed")}`
                                  : ""}
                              </p>
                              <RunDeliveryEvidence item={item} />
                            </div>
                          ))}
                        </div>
                      )}
                      {inspectRecovery ? (
                        <p className="mt-1 text-[10px] text-amber-400">
                          {t("agent.deliverables.inspectRecovery")}
                        </p>
                      ) : null}
                    </div>
                    {retryable && !inspectRecovery && onResumeRun ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onResumeRun(run.id)}
                          className="shrink-0 rounded-lg bg-[#E5B2FF]/10 px-2 py-1 text-[10px] text-[#eed0ff] hover:bg-[#E5B2FF]/20"
                        >
                          {failedCount > 0
                            ? t("agent.retryFailed")
                            : t("agent.resumeRun")}
                        </button>
                        {["waiting_input", "stopped"].includes(run.status) &&
                        onTakeoverRun ? (
                          <button
                            type="button"
                            onClick={() => onTakeoverRun(run.id)}
                            className="rounded-lg bg-white/[0.06] px-2 py-1 text-[10px] text-neutral-300 hover:bg-white/[0.12]"
                          >
                            {t("agent.takeoverRun")}
                          </button>
                        ) : null}
                        {onAbandonRun ? (
                          <button
                            type="button"
                            onClick={() => onAbandonRun(run.id)}
                            className="rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/20"
                          >
                            {t("agent.abandonRun")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

HistoryDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  sessions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string,
      updatedAt: PropTypes.number,
      createdAt: PropTypes.number,
    }),
  ).isRequired,
  currentSessionId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onNewChat: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  runs: PropTypes.arrayOf(PropTypes.object),
  onResumeRun: PropTypes.func,
  onAbandonRun: PropTypes.func,
  onTakeoverRun: PropTypes.func,
  agentName: PropTypes.string,
  agentColor: PropTypes.string,
};
