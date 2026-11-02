/** The Live Filter entry stack: toggle / reorder / remove rows and their parameter sliders. */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import ToolSliderField from "./tool_slider_field.jsx";
import FlatSelect from "../flat_select.jsx";
import {
  adjustmentLabelKey,
  SIMPLE_ADJUSTMENTS,
} from "../../editor/adjustment_kinds.js";
import {
  STACK_BLEND_MODES,
  normalizeFilterMask,
} from "../../editor/live_filter_stack.js";

export const DEFAULT_VALUE = 50;
const PARAM_VALUE_LABELS = {
  motionBlur: "editor.liveFilters.value",
};

export default function LiveFilterStack({
  object,
  liveFilters = object?.adjustments?.liveFilters ?? [],
  edit,
  editAndCommit,
  commitNow = null,
  engine = null,
}) {
  const { t } = useI18n();
  const blendLabelKey = (mode) =>
    mode === "normal"
      ? "editor.blend.sourceOver"
      : `editor.blend.${mode.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;
  const setEntryBlend = (entryId, blendMode) => {
    setStack(
      liveFilters.map((entry) =>
        entry.id === entryId ? { ...entry, blendMode } : entry,
      ),
    );
  };

  const selection = engine?.getPixelSelection?.();
  const selectionContours = selection?.contours ?? [];
  const maskFromSelection = () => {
    if (!selectionContours.length || !object?.width || !object?.height) {
      return null;
    }
    const ox = object.x ?? 0;
    const oy = object.y ?? 0;
    const contours = selectionContours.map((ring) =>
      ring.map(([x, y]) => [
        Number(((x - ox) / object.width).toFixed(4)),
        Number(((y - oy) / object.height).toFixed(4)),
      ]),
    );
    return normalizeFilterMask({ contours });
  };
  const setEntryMask = (entry, mask) => {
    editAndCommit({
      adjustments: {
        ...(object.adjustments ?? {}),
        liveFilters: liveFilters.map((item) =>
          item.id === entry.id ? { ...item, mask } : item,
        ),
      },
    });
  };

  const setStack = (stack) => {
    editAndCommit({
      adjustments: {
        ...(object.adjustments ?? {}),
        liveFilters: stack,
      },
    });
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

  const handleCommit = () => {
    if (typeof commitNow === "function") {
      commitNow();
    } else {
      editAndCommit({
        adjustments: {
          ...(object.adjustments ?? {}),
          liveFilters,
        },
      });
    }
  };

  const toggleEntry = (entryId) => {
    setStack(
      liveFilters.map((entry) =>
        entry.id === entryId ? { ...entry, enabled: !entry.enabled } : entry,
      ),
    );
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
  <div className="flex flex-col gap-2">
    {liveFilters.map((entry, index) => {
      const hasRadius = entry.params?.radius !== undefined;
      const meta = SIMPLE_ADJUSTMENTS.find((item) => item.kind === entry.kind);
      const mainParamKey = hasRadius ? "radius" : "value";
      const mainParamLabel = hasRadius
        ? "editor.liveFilters.radius"
        : (PARAM_VALUE_LABELS[entry.kind] ?? "editor.liveFilters.value");
      const mainParamValue = Math.round(
        Number(entry.params?.[mainParamKey] ?? entry.params?.value ?? entry.params?.radius ?? DEFAULT_VALUE),
      );

      return (
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
              onClick={() => toggleEntry(entry.id)}
              className={`h-4 w-2 rounded-full transition-colors ${
                entry.enabled ? "bg-[#a7ffd4]" : "bg-neutral-600"
              }`}
              aria-label={`${entry.kind}: ${entry.enabled ? t("editor.liveFilters.enabled") : t("editor.liveFilters.disabled")}`}
              data-testid={`live-filter-toggle-${entry.kind}`}
            />
            <span className="min-w-0 flex-1 truncate text-[10px] font-mono uppercase tracking-wide text-neutral-200">
              {t(adjustmentLabelKey(entry.kind))}
            </span>
            <button
              type="button"
              onClick={() => moveEntry(index, -1)}
              aria-label={t("editor.liveFilters.moveUp")}
              data-testid={`live-filter-move-up-${entry.kind}`}
              className="px-1 text-[10px] text-neutral-400 hover:text-white"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveEntry(index, 1)}
              aria-label={t("editor.liveFilters.moveDown")}
              data-testid={`live-filter-move-down-${entry.kind}`}
              className="px-1 text-[10px] text-neutral-400 hover:text-white"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() =>
                setEntryMask(
                  entry,
                  entry.mask ? null : maskFromSelection(),
                )
              }
              disabled={!entry.mask && selectionContours.length === 0}
              aria-pressed={Boolean(entry.mask)}
              aria-label={
                entry.mask
                  ? t("editor.liveFilters.maskRemove")
                  : t("editor.liveFilters.maskFromSelection")
              }
              title={
                entry.mask
                  ? t("editor.liveFilters.maskRemove")
                  : t("editor.liveFilters.maskFromSelection")
              }
              data-testid={`live-filter-mask-${entry.kind}`}
              className={`px-1 text-[10px] font-mono disabled:cursor-default disabled:opacity-30 ${
                entry.mask
                  ? "text-[#a7ffd4] hover:text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              M
            </button>
            <button
              type="button"
              onClick={() => removeEntry(entry.id)}
              aria-label={t("editor.liveFilters.remove")}
              data-testid={`live-filter-remove-${entry.kind}`}
              className="px-1 text-[11px] text-neutral-400 hover:text-white"
            >
              ×
            </button>
          </div>

          {entry.params?.radius !== undefined && entry.params?.value !== undefined ? (
            <>
              <ToolSliderField
                label={t("editor.liveFilters.value")}
                labelClassName="w-[48px]"
                fieldClassName="w-[72px]"
                min={0}
                max={100}
                value={Math.round(Number(entry.params.value))}
                onValueChange={(val) =>
                  patchEntry(entry.id, { params: { ...(entry.params ?? {}), value: val } })
                }
                onCommit={handleCommit}
                ariaLabel={t("editor.liveFilters.value")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
              <ToolSliderField
                label={t("editor.liveFilters.radius")}
                labelClassName="w-[48px]"
                fieldClassName="w-[72px]"
                min={0}
                max={100}
                value={Math.round(Number(entry.params.radius))}
                onValueChange={(val) =>
                  patchEntry(entry.id, { params: { ...(entry.params ?? {}), radius: val } })
                }
                onCommit={handleCommit}
                ariaLabel={t("editor.liveFilters.radius")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
            </>
          ) : (
            <ToolSliderField
              label={t(mainParamLabel)}
              labelClassName="w-[48px]"
              fieldClassName="w-[72px]"
              min={hasRadius ? 0 : (meta?.min ?? 0)}
              max={hasRadius ? 100 : (meta?.max ?? 100)}
              value={mainParamValue}
              onValueChange={(val) =>
                patchEntry(entry.id, { params: { ...(entry.params ?? {}), [mainParamKey]: val } })
              }
              onCommit={handleCommit}
              ariaLabel={t(mainParamLabel)}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          )}

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
              onCommit={handleCommit}
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
            onCommit={handleCommit}
            ariaLabel={t("editor.liveFilters.opacity")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
          <div data-testid={`live-filter-blend-${entry.kind}`}>
            <FlatSelect
              value={entry.blendMode ?? "normal"}
              onChange={(next) => setEntryBlend(entry.id, next)}
              label={t("editor.props.blendMode")}
              triggerClassName="!h-6 !w-full !rounded-lg !bg-neutral-900 !px-2 !text-[10px] !font-mono !uppercase !text-neutral-200 hover:!bg-neutral-800"
              options={STACK_BLEND_MODES.map((mode) => ({
                value: mode,
                label: t(blendLabelKey(mode)),
              }))}
            />
          </div>
        </div>
      );
    })}
  </div>
  );
}

LiveFilterStack.propTypes = {
  object: PropTypes.object.isRequired,
  liveFilters: PropTypes.arrayOf(PropTypes.object),
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
};
