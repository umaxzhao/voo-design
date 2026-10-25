import PropTypes from "prop-types";
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  CollapsibleSection,
  SectionAddButton,
  sectionActionClass,
} from "./property_section.jsx";
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
import KindIcon from "./kind_icons.jsx";

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
  const [localPickerOpen, setLocalPickerOpen] = useState(false);
  const controlled = typeof onAddPickerChange === "function";
  const showAddPicker = controlled ? Boolean(addPickerOpen) : localPickerOpen;
  const setShowAddPicker = controlled ? onAddPickerChange : setLocalPickerOpen;

  if (!object || object.kind === "region") return null;

  const configuredAdjustments = listConfiguredAdjustments(object.adjustments);
  const configuredEffects = listConfiguredEffects(object.effects);
  const hasAny =
    configuredAdjustments.length > 0 || configuredEffects.length > 0;
  // This panel docks opposite the layers panel: it sits at `right-4` by default
  // and moves to `left-4` when swapped. A popover must open into the canvas, so
  // the side is the mirror of the layers panel's -- getting this backwards puts
  // the card past the viewport edge, where it reads as "the button does nothing".
  const popoverSide = swapSide ? "left" : "right";

  const handleAdd = (kind, isEffect) => {
    setShowAddPicker(false);
    if (isEffect) {
      const initial = starterEffect(kind);
      editAndCommit({
        effects: {
          ...(object.effects ?? {}),
          [kind]: initial,
        },
      });
      setPopover({ kind, isEffect: true });
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

  /** Renders a popover onto the panel element once React has attached it. */
  const floating = (node) =>
    node && panelRef?.current ? createPortal(node, panelRef.current) : null;

  return (
    <>
      {/* An empty stack renders no section; the panel's add menu is the entry point. */}
      {hasAny ? (
      <CollapsibleSection
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
        defaultOpen={defaultOpen}
        storageKey={`effects.${object.kind}`}
      >
        <div className="flex flex-col gap-1.5 pt-1">
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
              popover?.kind === kind && Boolean(popover?.isEffect);

            return (
              <div
                key={`eff-${kind}`}
                className={`flex h-7 items-center justify-between rounded-xl px-2.5 transition-all ${
                  isEditing
                    ? "bg-neutral-800 ring-1 ring-[#E5B2FF]/40"
                    : "bg-neutral-900/80 hover:bg-neutral-800/80"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setPopover({ kind, isEffect: true })}
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
            );
          })}
        </div>
      </CollapsibleSection>
      ) : null}

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
