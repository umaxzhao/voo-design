/* eslint-disable react/prop-types */
/**
 * @file AgentReviewCard.jsx
 * Visual change review card for agent actions.
 * Features side-by-side & slider image comparisons, property diffs,
 * conflict protection indicators, and object-level partial acceptance.
 * Complies with Design.md and user touch-target accessibility (>= 48px).
 */

import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../../../use_i18n.js";
import { useWorkflowStore } from "../../../store/workflow_store.js";
import { buildObjectReviewModel } from "../reviewDiffHelper.js";
import VisualDiffViewer from "./VisualDiffViewer.jsx";
import PropertyDiffList from "./PropertyDiffList.jsx";
import { IconChevronDown, IconChevronUp } from "../../../icons.jsx";

export default function AgentReviewCard({
  toolId,
  review,
  resolveReview,
  getStore,
}) {
  const { t } = useI18n();

  const affected = useMemo(
    () => review.affectedObjects || review.undoData?.affectedObjects || [],
    [review.affectedObjects, review.undoData],
  );

  const [selectedIds, setSelectedIds] = useState(
    () => new Set(affected.map((o) => o.id)),
  );
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  // Sync selection when affected items update
  useEffect(() => {
    setSelectedIds(new Set(affected.map((o) => o.id)));
  }, [affected]);

  // Read current live store state for conflict detection and thumbnail lookup
  const liveStore = useMemo(() => {
    if (typeof getStore === "function") {
      const s = getStore();
      if (s) return s;
    }
    return useWorkflowStore.getState?.() || {};
  }, [getStore]);

  // Compute structured review models for each affected object
  const objectModels = useMemo(() => {
    const liveNodes = Array.isArray(liveStore.nodes) ? liveStore.nodes : [];
    const liveEdges = Array.isArray(liveStore.edges) ? liveStore.edges : [];

    return affected.map((obj) => {
      const live =
        obj.type === "node"
          ? liveNodes.find((n) => n.id === obj.id)
          : liveEdges.find((e) => e.id === obj.id);
      return buildObjectReviewModel(obj, live, liveStore);
    });
  }, [affected, liveStore]);

  const toggleSelectObject = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandDiff = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFocusObject = (obj) => {
    if (obj.type === "node") {
      liveStore?.selectNode?.(obj.id);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("voo:focus-node", {
          detail: { id: obj.id, nodeId: obj.id },
        }),
      );
    }
  };

  const hasUnselected =
    affected.length > 0 && selectedIds.size < affected.length;
  const unselectedIds = affected
    .filter((o) => !selectedIds.has(o.id))
    .map((o) => o.id);

  const handleAccept = () => {
    if (hasUnselected) {
      resolveReview(toolId, true, { rejectedObjectIds: unselectedIds });
    } else {
      resolveReview(toolId, true);
    }
  };

  const handleRevert = () => {
    resolveReview(toolId, false);
  };

  return (
    <div
      data-testid="agent-review-card"
      className="rounded-xl border border-white/10 bg-[#161616] p-3 text-neutral-200"
    >
      {/* Header section */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-amber-200">
            {t("agent.review.cardTitle")}
          </p>
          <p className="mt-0.5 font-mono text-[11px] font-semibold text-neutral-100 break-all">
            {review.command || toolId}
          </p>
        </div>

        {/* B visual inspection status if provided */}
        {(review.visualStatus || review.visualDiffScore) && (
          <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-300">
            {t("agent.review.visualQuality")}:{" "}
            {String(
              review.visualStatus ||
                `${Math.round(review.visualDiffScore * 100)}%`,
            )}
          </span>
        )}
      </div>

      {/* Rationale: only rendered if provided; never fabricated */}
      {review.rationale && (
        <div className="mt-2 rounded-lg bg-white/[0.03] p-2 text-[11px] text-neutral-300">
          <span className="text-[10px] font-medium text-neutral-500 block">
            {t("agent.review.rationale")}:
          </span>
          <span className="mt-0.5 block">{review.rationale}</span>
        </div>
      )}

      {/* Affected Objects List */}
      {objectModels.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          <p className="text-[10px] font-medium text-neutral-400">
            {t("agent.review.affectedObjects")}:
          </p>

          <div className="space-y-1.5">
            {objectModels.map((model) => {
              const isChecked = selectedIds.has(model.id);
              const isExpanded = expandedIds.has(model.id);

              const actionBadge =
                model.action === "created"
                  ? {
                      text: t("agent.review.actionCreated"),
                      cls: "bg-emerald-500/10 text-emerald-400",
                    }
                  : model.action === "deleted"
                    ? {
                        text: t("agent.review.actionDeleted"),
                        cls: "bg-rose-500/10 text-rose-400",
                      }
                    : {
                        text: t("agent.review.actionModified"),
                        cls: "bg-amber-500/10 text-amber-400",
                      };

              return (
                <div
                  key={model.id}
                  data-testid="affected-object-item"
                  className="rounded-lg bg-white/[0.03] p-1.5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    {/* Checkbox with accessible >= 48px touch wrapper */}
                    <label className="flex min-h-[48px] items-center gap-2 cursor-pointer min-w-0 pr-1">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectObject(model.id)}
                        className="h-4 w-4 rounded-md border-white/20 bg-neutral-800"
                      />
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          handleFocusObject(model);
                        }}
                        className="truncate text-[11px] text-neutral-200 hover:text-[#eed0ff] cursor-pointer"
                        title={model.name}
                      >
                        {model.type === "node"
                          ? t("agent.review.typeNode")
                          : t("agent.review.typeEdge")}
                        : {model.name}
                      </span>
                    </label>

                    {/* Status badges & diff expand toggle */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {/* Conflict notice if manually modified */}
                      {model.isConflict && (
                        <span
                          title={t("agent.review.conflictNotice")}
                          className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400"
                        >
                          {t("agent.review.conflictNotice")}
                        </span>
                      )}

                      <span
                        onClick={() => handleFocusObject(model)}
                        className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium cursor-pointer ${actionBadge.cls}`}
                      >
                        {actionBadge.text}
                      </span>

                      {/* View diff toggle button with >= 48px touch area */}
                      <button
                        type="button"
                        onClick={() => toggleExpandDiff(model.id)}
                        aria-expanded={isExpanded}
                        className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.05] hover:text-white"
                        title={
                          isExpanded
                            ? t("agent.review.hideDiff")
                            : t("agent.review.viewDiff")
                        }
                      >
                        {isExpanded ? (
                          <IconChevronUp size={14} />
                        ) : (
                          <IconChevronDown size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Visual & Property Diff */}
                  {isExpanded && (
                    <div className="mt-2 space-y-2 border-t border-white/[0.06] pt-2">
                      {/* Visual Image Diff if images are present or action indicates visual asset */}
                      {model.hasImageDiff && (
                        <VisualDiffViewer
                          beforeImage={model.beforeImage}
                          afterImage={model.afterImage}
                          action={model.action}
                        />
                      )}

                      {/* Property & text diff list */}
                      <PropertyDiffList propertyDiffs={model.propertyDiffs} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer decision buttons with >= 48px touch targets */}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleAccept}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-lg bg-[#E5B2FF] px-3 text-[11px] font-semibold text-black transition-colors hover:bg-[#E5B2FF]/85 active:scale-95"
        >
          {hasUnselected
            ? t("agent.review.partialAccept")
            : t("agent.review.accept")}
        </button>

        <button
          type="button"
          onClick={handleRevert}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-lg bg-white/[0.08] px-3 text-[11px] font-medium text-neutral-300 transition-colors hover:bg-white/[0.14] hover:text-white active:scale-95"
        >
          {t("agent.review.revert")}
        </button>
      </div>
    </div>
  );
}
