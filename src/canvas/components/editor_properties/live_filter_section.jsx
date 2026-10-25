/**
 * Live Filter section: hidden until the layer has a filter (or the add menu
 * reveals it). One "+" opens a compact picker for every filter kind and for
 * frequency separation, instead of a row of stacked add buttons.
 */

import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { CollapsibleSection, SectionAddButton } from "./property_section.jsx";
import LiveFilterStack, { DEFAULT_VALUE } from "./live_filter_stack.jsx";
import FrequencySeparationRow from "./frequency_separation_row.jsx";
import { LIVE_FILTER_KINDS, createLiveFilterEntry } from "../../editor/live_filter_stack.js";

const PICKER_ITEM_CLASS =
  "block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-neutral-200 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

/** Append a new filter of `kind` to the stack and commit it as one history entry. */
export function addLiveFilter({ object, liveFilters, kind, editAndCommit }) {
  const params = kind === "motionBlur" ? { value: DEFAULT_VALUE, angle: 0 } : { value: DEFAULT_VALUE };
  editAndCommit({
    adjustments: {
      ...(object.adjustments ?? {}),
      liveFilters: [...liveFilters, createLiveFilterEntry(kind, params)],
    },
  });
}

/** The one add picker: every filter kind, plus frequency separation for images. */
export function LiveFilterPicker({ onPick, onFrequency = null }) {
  const { t } = useI18n();
  return (
    <div data-testid="editor-live-filter-picker" className="rounded-xl border border-white/10 bg-neutral-900 p-1">
      {LIVE_FILTER_KINDS.map((kind) => (
        <button key={kind} type="button" data-testid={`live-filter-add-${kind}`} className={PICKER_ITEM_CLASS} onClick={() => onPick(kind)}>
          {t(`editor.liveFilter.kind.${kind}`)}
        </button>
      ))}
      {onFrequency ? (
        <button type="button" data-testid="live-filter-add-frequency" className={`${PICKER_ITEM_CLASS} border-t border-white/10`} onClick={onFrequency}>
          {t("editor.frequencySeparation.action")}
        </button>
      ) : null}
    </div>
  );
}

LiveFilterPicker.propTypes = {
  onPick: PropTypes.func.isRequired,
  onFrequency: PropTypes.func,
};

export default function LiveFilterSection({
  object,
  liveFilters = object?.adjustments?.liveFilters ?? [],
  engine = null,
  /** Show the section even with an empty stack (set by the panel's add menu). */
  revealed = false,
  defaultPickerOpen = revealed,
  defaultFrequencyOpen = false,
  edit,
  editAndCommit,
  commitNow = null,
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(defaultPickerOpen);
  const [frequencyOpen, setFrequencyOpen] = useState(defaultFrequencyOpen);
  const canSeparate = object.kind === "image" && Boolean(engine);

  // An unused, unrevealed section does not exist in the panel at all.
  if (liveFilters.length === 0 && !revealed && !pickerOpen && !frequencyOpen) return null;

  return (
    <CollapsibleSection
      title={t("editor.liveFilters.title")}
      storageKey="liveFilters"
      testId="editor-live-filter-section"
      extra={<SectionAddButton label={t("editor.liveFilters.add")} onClick={() => setPickerOpen((open) => !open)} />}
    >
      {pickerOpen ? (
        <LiveFilterPicker
          onPick={(kind) => {
            addLiveFilter({ object, liveFilters, kind, editAndCommit });
            setPickerOpen(false);
          }}
          onFrequency={canSeparate ? () => { setFrequencyOpen(true); setPickerOpen(false); } : null}
        />
      ) : null}
      {frequencyOpen && canSeparate ? <FrequencySeparationRow object={object} engine={engine} /> : null}
      {liveFilters.length > 0 ? (
        <LiveFilterStack object={object} liveFilters={liveFilters} edit={edit} editAndCommit={editAndCommit} commitNow={commitNow} />
      ) : null}
    </CollapsibleSection>
  );
}

LiveFilterSection.propTypes = {
  object: PropTypes.object.isRequired,
  liveFilters: PropTypes.arrayOf(PropTypes.object),
  engine: PropTypes.object,
  revealed: PropTypes.bool,
  defaultPickerOpen: PropTypes.bool,
  defaultFrequencyOpen: PropTypes.bool,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
};
