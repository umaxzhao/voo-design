/* eslint-disable react/prop-types */
/**
 * @file PropertyDiffList.jsx
 * Displays property, text, and parameter differences between before and after states.
 * Fully compliant with Design.md (no emoji, flat, /10 wash semantics).
 */

import { useI18n } from "../../../use_i18n.js";

export default function PropertyDiffList({ propertyDiffs = [] }) {
  const { t } = useI18n();

  if (!propertyDiffs.length) {
    return (
      <div className="rounded-lg bg-white/[0.02] px-2.5 py-2 text-[10px] text-neutral-500">
        {t("agent.review.noChanges")}
      </div>
    );
  }

  const textDiffs = propertyDiffs.filter((d) => d.type === "text");
  const propDiffs = propertyDiffs.filter((d) => d.type !== "text");

  return (
    <div className="space-y-2 text-[11px]">
      {textDiffs.map((diff) => (
        <div
          key={diff.key}
          className="space-y-1 rounded-lg bg-white/[0.03] p-2"
        >
          <div className="text-[10px] font-medium text-neutral-400">
            {diff.labelKey ? t(diff.labelKey) : diff.key}
          </div>
          {diff.before && (
            <div className="rounded-md bg-rose-500/10 p-1.5 text-[10px] text-rose-300 break-words font-mono">
              <span className="font-semibold text-rose-400 select-none mr-1">
                -
              </span>
              {diff.before}
            </div>
          )}
          {diff.after && (
            <div className="rounded-md bg-emerald-500/10 p-1.5 text-[10px] text-emerald-300 break-words font-mono">
              <span className="font-semibold text-emerald-400 select-none mr-1">
                +
              </span>
              {diff.after}
            </div>
          )}
        </div>
      ))}

      {propDiffs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {propDiffs.map((diff) => (
            <div
              key={diff.key}
              className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-neutral-300"
            >
              <span className="text-neutral-500">
                {diff.labelKey ? t(diff.labelKey) : diff.key}:
              </span>
              <span className="line-through text-neutral-500">
                {diff.before || "none"}
              </span>
              <span className="text-neutral-500">→</span>
              <span className="text-emerald-400 font-medium">
                {diff.after || "none"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
