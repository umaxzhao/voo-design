import PropTypes from "prop-types";
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  SectionAddButton,
  sectionActionClass,
  sectionRowClass,
} from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";
import { useI18n } from "../../use_i18n.js";
import {
  listConfiguredAdjustments,
  listConfiguredEffects,
  starterAdjustment,
  starterEffect,
  adjustmentLabelKey,
  effectLabelKey,
  FILTER_KINDS,
} from "../../editor/adjustment_catalog.js";
import { IconEye, IconEyeOff, IconMinus } from "../../icons.jsx";
import AddKindPicker from "./add_kind_picker.jsx";
import AdjustmentPopover from "./adjustment_popover.jsx";
import EffectControls from "./effect_controls.jsx";
import LiveFilterStack from "./live_filter_stack.jsx";
import { StaticSection } from "./property_section.jsx";
import KindIcon from "./kind_icons.jsx";
import {
  createLiveFilterEntry,
  normalizeLiveFilterStack,
} from "../../editor/live_filter_stack.js";

/**
 * The one stack of everything applied to a layer: tone adjustments (green),
 * pixel filters (blue), and layer-style effects (purple). "+" opens the picker;
 * a row opens that item's editor.
 *
 * Both popovers float beside the properties panel and are portalled into it,
 * because the panel body scrolls and would otherwise clip them away.
 */
export default function LayerEffectsSection({
  object = null,
  edit: _edit,
  editAndCommit,
  commitNow: _commitNow,
  onMutate = () => {},
  onCommit = () => {},
  defaultOpen = true,
  swapSide = false,
  panelRef = null,
  getBitmap = null,
  /** Controlled picker state: the panel's add menu opens the picker for an empty stack. */
  addPickerOpen = undefined,
  onAddPickerChange = undefined,
}) {
  const { t } = useI18n();
  // Popover state for editing an existing or newly added item
  const [popover, setPopover] = useState(null); // { kind, isEffect }
  const [inlineEffect, setInlineEffect] = useState(null);
  const [localPickerOpen, setLocalPickerOpen] = useState(false);
  const controlled = typeof onAddPickerChange === "function";
  const showAddPicker = controlled ? Boolean(addPickerOpen) : localPickerOpen;
  const setShowAddPicker = controlled ? onAddPickerChange : setLocalPickerOpen;

  if (!object || object.kind === "region") return null;

  const configuredAdjustments = listConfiguredAdjustments(object.adjustments);
  const configuredEffects = listConfiguredEffects(object.effects);
  // Ordered filter stack (previously the separate "Live Filters" section).
  // It now lives inside Effects so adding a filter has one entry point.
  const liveFilters = normalizeLiveFilterStack(object.adjustments?.liveFilters);
  const hasFilterStack = liveFilters.length > 0;
  const isStackFilterHost =
    object.kind === "image" || object.kind === "raster";
  const hasAny =
    configuredAdjustments.length > 0 ||
    configuredEffects.length > 0 ||
    hasFilterStack;
  const hasBlurNoise =
    (object.layerBlur ?? 0) > 0 ||
    (object.backgroundBlur ?? 0) > 0 ||
    Boolean(object.noise);
  // This panel docks opposite the layers panel: it sits at `right-4` by default
  // and moves to `left-4` when swapped. A popover must open into the canvas, so
  // the side is the mirror of the layers panel's -- getting this backwards puts
  // the card past the viewport edge, where it reads as "the button does nothing".
  const popoverSide = swapSide ? "left" : "right";

  const handleAdd = (kind, isEffect) => {
    setShowAddPicker(false);
    // Every filter on a raster layer joins the ordered stack, so all 23 kinds
    // share the same per-filter order / opacity / visibility behaviour.
    const joinsFilterStack =
      !isEffect && isStackFilterHost && FILTER_KINDS.includes(kind);
    if (joinsFilterStack) {
      const starter = Number(starterAdjustment(kind).value ?? 50);
      const params =
        kind === "motionBlur"
          ? { value: starter, angle: 0 }
          : { value: starter };
      editAndCommit({
        adjustments: {
          ...(object.adjustments ?? {}),
          liveFilters: [...liveFilters, createLiveFilterEntry(kind, params)],
        },
      });
      setPopover(null);
      return;
    }
    if (isEffect) {
      const initial = starterEffect(kind);
      editAndCommit({
        effects: {
          ...(object.effects ?? {}),
          [kind]: initial,
        },
      });
      setInlineEffect(kind);
      setPopover(null);
    } else {
      const initial = starterAdjustment(kind);
      editAndCommit({
        adjustments: {
          ...(object.adjustments ?? {}),
          [kind]: initial,
        },
      });
      setPopover({ kind, isEffect: false });
    }
  };

  const removeKind = (kind, isEffect) => {
    if (isEffect) {
      const next = { ...(object.effects ?? {}) };
      delete next[kind];
      editAndCommit({ effects: next });
    } else {
      const next = { ...(object.adjustments ?? {}) };
      delete next[kind];
      editAndCommit({ adjustments: next });
    }
    if (popover?.kind === kind && popover?.isEffect === isEffect) {
      setPopover(null);
    }
    if (isEffect && inlineEffect === kind) setInlineEffect(null);
  };

  const toggleEnable = (kind, isEffect, currentEnabled) => {
    if (isEffect) {
      const current = object.effects?.[kind] ?? starterEffect(kind);
      editAndCommit({
        effects: {
          ...(object.effects ?? {}),
          [kind]: { ...current, enabled: !currentEnabled },
        },
      });
    } else {
      const current = object.adjustments?.[kind] ?? starterAdjustment(kind);
      editAndCommit({
        adjustments: {
          ...(object.adjustments ?? {}),
          [kind]: { ...current, enabled: !currentEnabled },
        },
      });
    }
  };

  /**
   * A preset is a shortcut for "add these adjustments", so it merges into the
   * stack rather than replacing it -- replacing would silently discard whatever
   * the user had already added, which is not what picking a look should mean.
   */
  const applyPreset = (preset) => {
    setShowAddPicker(false);
    editAndCommit({
      adjustments: {
        ...(object.adjustments ?? {}),
        ...structuredClone(preset.adjustments),
      },
    });
  };

  /** Adds a layer-level blur/grain entry from the picker's "Blur & noise". */
  const addLayerEffect = (kind) => {
    setShowAddPicker(false);
    if (kind === "layerBlur") {
      editAndCommit({ layerBlur: Math.max(8, object.layerBlur ?? 0) });
    } else if (kind === "backgroundBlur") {
      editAndCommit({ backgroundBlur: Math.max(12, object.backgroundBlur ?? 0) });
    } else if (kind === "noise") {
      editAndCommit({
        noise: object.noise ?? { opacity: 0.18, density: 0.35, size: 2 },
      });
    }
  };

  /** Renders a popover onto the panel element once React has attached it. */
  const floating = (node) =>
    node && panelRef?.current ? createPortal(node, panelRef.current) : null;

  return (
    <>
      {/* Always present (Figma/Pen): an empty stack is just the header + button. */}
      <StaticSection
        title={t("editor.props.effects")}
        extra={
          <SectionAddButton
            label={t("editor.props.addEffect")}
            onClick={(event) => {
              event.stopPropagation();
              setShowAddPicker(true);
            }}
          />
        }
      >
        {!hasAny && !hasBlurNoise ? null : (
          <>
        <div className="flex flex-col gap-2">
          {/* Tone adjustments (green) and pixel filters (blue) both live in
              `adjustments`; the dot keeps them apart the way the picker does. */}
          {configuredAdjustments.map((kind) => {
            const isEnabled = object.adjustments?.[kind]?.enabled !== false;
            const isEditing = popover?.kind === kind && !popover?.isEffect;
            const isFilter = FILTER_KINDS.includes(kind);
            const accent = isFilter ? "#38bdf8" : "#7fd4a8";

            return (
              <div
                key={`adj-${kind}`}
                style={isEditing ? { ringColor: `${accent}80` } : undefined}
                className={`flex h-7 items-center justify-between rounded-xl px-2.5 transition-all ${
                  isEditing
                    ? "bg-neutral-800 ring-1 ring-white/20"
                    : "bg-neutral-900/80 hover:bg-neutral-800/80"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setPopover({ kind, isEffect: false })}
                  aria-label={t(adjustmentLabelKey(kind))}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-lg focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
                >
                  <span
                    className={`shrink-0 ${isEnabled ? "text-neutral-300" : "text-neutral-500"}`}
                  >
                    <KindIcon kind={kind} />
                  </span>
                  <span
                    className={`truncate text-[11px] font-mono uppercase ${
                      isEnabled ? "text-neutral-200" : "text-neutral-500"
                    }`}
                  >
                    {t(adjustmentLabelKey(kind))}
                  </span>
                </button>

                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => toggleEnable(kind, false, isEnabled)}
                    title={t(isEnabled ? "editor.hide" : "editor.show")}
                    aria-label={t(isEnabled ? "editor.hide" : "editor.show")}
                    className="p-1 text-neutral-400 hover:text-white transition-colors"
                  >
                    {isEnabled ? (
                      <IconEye size={12} />
                    ) : (
                      <IconEyeOff size={12} className="text-neutral-500" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeKind(kind, false)}
                    title={t("editor.props.removeAdjustment")}
                    aria-label={t("editor.props.removeAdjustment")}
                    className={sectionActionClass}
                  >
                    <IconMinus size={12} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Effects List (Indicated with purple dot) */}
          {configuredEffects.map((kind) => {
            const isEnabled = Boolean(object.effects?.[kind]?.enabled);
            const isEditing =
              inlineEffect === kind ||
              (popover?.kind === kind && Boolean(popover?.isEffect));

            return (
              <div key={`eff-${kind}`} className="flex flex-col gap-1">
              <div
                className={`flex h-7 items-center justify-between rounded-xl px-2.5 transition-all ${
                  isEditing
                    ? "bg-neutral-800 ring-1 ring-[#E5B2FF]/40"
                    : "bg-neutral-900/80 hover:bg-neutral-800/80"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setInlineEffect(inlineEffect === kind ? null : kind);
                    setPopover(null);
                  }}
                  aria-label={t(effectLabelKey(kind))}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-lg focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
                >
                  <span
                    className={`shrink-0 ${isEnabled ? "text-neutral-300" : "text-neutral-500"}`}
                  >
                    <KindIcon kind={kind} />
                  </span>
                  <span
                    className={`truncate text-[11px] font-mono uppercase ${
                      isEnabled ? "text-neutral-200" : "text-neutral-500"
                    }`}
                  >
                    {t(effectLabelKey(kind))}
                  </span>
                </button>

                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => toggleEnable(kind, true, isEnabled)}
                    title={t(isEnabled ? "editor.hide" : "editor.show")}
                    aria-label={t(isEnabled ? "editor.hide" : "editor.show")}
                    className="p-1 text-neutral-400 hover:text-white transition-colors"
                  >
                    {isEnabled ? (
                      <IconEye size={12} />
                    ) : (
                      <IconEyeOff size={12} className="text-neutral-500" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeKind(kind, true)}
                    title={t("editor.props.removeEffect")}
                    aria-label={t("editor.props.removeEffect")}
                    className={sectionActionClass}
                  >
                    <IconMinus size={12} />
                  </button>
                </div>
              </div>
              {inlineEffect === kind ? (
                <div className="rounded-xl bg-neutral-900/70 p-2">
                  <EffectControls
                    kind={kind}
                    effects={object.effects ?? {}}
                    rawEffects={object.effects ?? null}
                    edit={(patch) => _edit?.(patch)}
                    editAndCommit={editAndCommit}
                    commitNow={_commitNow}
                    t={t}
                  />
                </div>
              ) : null}
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          <div className={sectionRowClass}>
            <span className="flex-1 text-left text-[10px] text-neutral-300">
              {t("editor.props.layerBlur")}
            </span>
            <ScrubField
              suffix="px"
              min={0}
              max={100}
              value={object.layerBlur ?? 0}
              onValueChange={(value) => _edit?.({ layerBlur: value })}
              onCommit={_commitNow}
              ariaLabel={t("editor.props.layerBlur")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          </div>
          <div className={sectionRowClass}>
            <span className="flex-1 text-left text-[10px] text-neutral-300">
              {t("editor.props.backgroundBlur")}
            </span>
            <ScrubField
              suffix="px"
              min={0}
              max={100}
              value={object.backgroundBlur ?? 0}
              onValueChange={(value) => _edit?.({ backgroundBlur: value })}
              onCommit={_commitNow}
              ariaLabel={t("editor.props.backgroundBlur")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          </div>
          {object.noise ? (
            <div className="flex flex-col gap-1 rounded-xl bg-neutral-900/60 p-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-tight text-neutral-400">
                  {t("editor.props.noise")}
                </span>
                <button
                  type="button"
                  aria-label={t("editor.props.removeNoise")}
                  title={t("editor.props.removeNoise")}
                  onClick={() => editAndCommit({ noise: null })}
                  className={sectionActionClass}
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  ["opacity", t("editor.props.noiseOpacity"), 0, 1, 100, "%", (value) => value / 100],
                  ["density", t("editor.props.noiseDensity"), 0, 1, 100, "%", (value) => value / 100],
                  ["size", t("editor.props.noiseSize"), 1, 12, 12, "px", (value) => value],
                ].map(([key, label, min, max, displayMax, suffix, toStored]) => (
                  <ScrubField
                    key={key}
                    suffix={suffix}
                    min={min * (key === "opacity" || key === "density" ? 100 : 1)}
                    max={max * (key === "opacity" || key === "density" ? 100 : 1)}
                    value={Math.round((object.noise?.[key] ?? 0) * (key === "opacity" || key === "density" ? 100 : 1))}
                    onValueChange={(value) =>
                      _edit?.({
                        noise: { ...(object.noise ?? {}), [key]: toStored(value) },
                      })
                    }
                    onCommit={_commitNow}
                    ariaLabel={label}
                    scrubHint={t("editor.props.dragToAdjust")}
                  />
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                editAndCommit({
                  noise: { opacity: 0.15, density: 0.5, size: 2 },
                })
              }
              className="flex h-6 w-full items-center justify-center rounded-lg text-[10px] font-mono text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              + {t("editor.props.noise")}
            </button>
          )}
        </div>
        {hasFilterStack ? (
          <div
            className="flex flex-col gap-2 pt-1"
            data-testid="effects-filter-stack"
          >
            <div className="px-0.5 text-[9px] font-mono uppercase tracking-[0.14em] text-neutral-500">
              {t("editor.effects.filterStackTitle")}
            </div>
            <LiveFilterStack
              object={object}
              liveFilters={liveFilters}
              edit={_edit}
              editAndCommit={editAndCommit}
              commitNow={_commitNow}
            />
          </div>
        ) : null}
          </>
        )}
      </StaticSection>

      {/* Both cards mount on the panel element itself, clear of its scrolling
          body -- `overflow-y: auto` there computes overflow-x to auto as well,
          which clips anything positioned beside the panel. */}
      {floating(
        showAddPicker ? (
          <AddKindPicker
            isImage={object.kind === "image"}
            bitmap={getBitmap?.(object) ?? null}
            imageKey={object.imageId ?? object.src ?? null}
            adjustments={object.adjustments ?? null}
            onPick={handleAdd}
            onApplyPreset={applyPreset}
            onPickLayerEffect={addLayerEffect}
            onClose={() => setShowAddPicker(false)}
            side={popoverSide}
          />
        ) : null,
      )}

      {floating(
        popover ? (
          <AdjustmentPopover
            node={object}
            kind={popover.kind}
            isEffect={popover.isEffect}
            bitmap={getBitmap?.(object) ?? null}
            onMutate={(id, patch) =>
              patch ? onMutate?.(patch) : onMutate?.(id)
            }
            onCommit={onCommit}
            onClose={() => setPopover(null)}
            side={popoverSide}
          />
        ) : null,
      )}
    </>
  );
}

LayerEffectsSection.propTypes = {
  object: PropTypes.object,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func.isRequired,
  onMutate: PropTypes.func,
  onCommit: PropTypes.func,
  defaultOpen: PropTypes.bool,
  swapSide: PropTypes.bool,
  /** The properties panel element; popovers portal onto it. */
  panelRef: PropTypes.object,
  /** Decoded bitmap lookup, for rendering preset swatches. */
  getBitmap: PropTypes.func,
  addPickerOpen: PropTypes.bool,
  onAddPickerChange: PropTypes.func,
};
