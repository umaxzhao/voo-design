/** Live Filter stack section: add / toggle / edit / reorder non-destructive filters. */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { CollapsibleSection } from "./property_section.jsx";
import ToolSliderField from "./tool_slider_field.jsx";
import { LIVE_FILTER_KINDS, createLiveFilterEntry } from "../../editor/live_filter_stack.js";

const DEFAULT_VALUE = 50;
const PARAM_VALUE_LABELS = {
  motionBlur: "editor.liveFilters.value",
};

export default function LiveFilterSection({
  object,
  liveFilters = [],
  edit,
  editAndCommit,
}) {
  const { t } = useI18n();

  const setStack = (stack) => {
    editAndCommit({
      adjustments: {
        ...(object.adjustments ?? {}),
        liveFilters: stack,
      },
    });
  };

  const liveAddStack = (kind) => {
    setStack([
      ...liveFilters,
      createLiveFilterEntry(kind, { value: DEFAULT_VALUE }),
    ]);
  };

  const patchEntry = (entryId, patch) => {
    edit({
      adjustments: {
        ...(object.adjustments ?? {}),
        liveFilters: liveFilters.map((entry) =>
          entry.id === entryId ? { ...entry, ...patch } : entry,
        ),
      },
    });
  };

  const moveEntry = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= liveFilters.length) return;
    const next = [...liveFilters];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    setStack(next);
  };

  const removeEntry = (entryId) => {
    setStack(liveFilters.filter((entry) => entry.id !== entryId));
  };

  return (
    <CollapsibleSection
      title={t("editor.liveFilters.title")}
      storageKey="liveFilters"
      testId="editor-live-filter-section"
    >
      {liveFilters.length === 0 ? (
        <p className="px-1 text-[9px] font-mono text-neutral-500">
          {t("editor.liveFilters.empty")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {liveFilters.map((entry, index) => (
          <div
            key={entry.id}
            className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2"
            data-testid={`live-filter-entry-${entry.kind}`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                role="switch"
                aria-checked={entry.enabled}
                onClick={() => patchEntry(entry.id, { enabled: !entry.enabled })}
                className={`h-4 w-2 rounded-full transition-colors ${
                  entry.enabled ? "bg-[#a7ffd4]" : "bg-neutral-600"
                }`}
                aria-label={`${entry.kind}: ${entry.enabled ? t("editor.liveFilters.enabled") : t("editor.liveFilters.disabled")}`}
              />
              <span className="min-w-0 flex-1 truncate text-[10px] font-mono uppercase tracking-wide text-neutral-200">
                {t(`editor.liveFilter.kind.${entry.kind}`)}
              </span>
              <button
                type="button"
                onClick={() => moveEntry(index, -1)}
                aria-label={t("editor.liveFilters.moveUp")}
                className="px-1 text-[10px] text-neutral-400 hover:text-white"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveEntry(index, 1)}
                aria-label={t("editor.liveFilters.moveDown")}
                className="px-1 text-[10px] text-neutral-400 hover:text-white"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                aria-label={t("editor.liveFilters.remove")}
                className="px-1 text-[11px] text-neutral-400 hover:text-rose-400"
              >
                ×
              </button>
            </div>
            <ToolSliderField
              label={t(PARAM_VALUE_LABELS[entry.kind] ?? "editor.liveFilters.value")}
              labelClassName="w-[48px]"
              fieldClassName="w-[72px]"
              min={0}
              max={100}
              value={Math.round(Number(entry.params?.value ?? DEFAULT_VALUE))}
              onValueChange={(val) =>
                patchEntry(entry.id, { params: { ...(entry.params ?? {}), value: val } })
              }
              ariaLabel={t("editor.liveFilters.value")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
            {entry.kind === "motionBlur" ? (
              <ToolSliderField
                label={t("editor.liveFilters.angle")}
                labelClassName="w-[48px]"
                fieldClassName="w-[72px]"
                min={0}
                max={359}
                value={Math.round(Number(entry.params?.angle ?? 0))}
                onValueChange={(val) =>
                  patchEntry(entry.id, { params: { ...(entry.params ?? {}), angle: val } })
                }
                ariaLabel={t("editor.liveFilters.angle")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
            ) : null}
            <ToolSliderField
              label={t("editor.liveFilters.opacity")}
              labelClassName="w-[48px]"
              fieldClassName="w-[72px]"
              suffix="%"
              min={0}
              max={100}
              value={Math.round((Number(entry.opacity ?? 1)) * 100)}
              onValueChange={(val) => patchEntry(entry.id, { opacity: val / 100 })}
              ariaLabel={t("editor.liveFilters.opacity")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-t border-white/[0.06] pt-2">
        {LIVE_FILTER_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => liveAddStack(kind)}
            className="rounded-lg bg-white/[0.06] px-2 py-0.5 text-[9px] font-mono uppercase text-neutral-300 transition-colors hover:bg-white/[0.12] hover:text-white"
          >
            + {t(`editor.liveFilter.kind.${kind}`)}
          </button>
        ))}
      </div>
    </CollapsibleSection>
  );
}

LiveFilterSection.propTypes = {
  object: PropTypes.object.isRequired,
  liveFilters: PropTypes.arrayOf(PropTypes.object),
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
};
