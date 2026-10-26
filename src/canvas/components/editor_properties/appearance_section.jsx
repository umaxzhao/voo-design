/** Appearance section: layer opacity and blend mode (Figma/Pen-style group). */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";
import FlatSelect from "../flat_select.jsx";
import { BLEND_MODES, DEFAULT_BLEND_MODE, normalizeBlendMode } from "../../editor/scene_model.js";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { IconMix } from "../../icons.jsx";

const blendModeLabelKey = (mode) =>
  `editor.blend.${mode.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;

export default function AppearanceSection({
  object,
  selectedNodes = [],
  edit,
  editAndCommit,
  commitNow = undefined,
}) {
  const { t } = useI18n();
  const opacity =
    selectedNodes.length > 1
      ? commonValue(selectedNodes, "opacity")
      : (object.opacity ?? 1);
  const mixed = opacity === MIXED;
  const value = mixed ? 1 : Math.round((opacity ?? 1) * 100);
  // Imported documents may carry `normal` (Figma's name) instead of
  // `source-over`; normalise before matching the option list so the trigger
  // never renders a blank label.
  const blendMode = normalizeBlendMode(object.blendMode ?? DEFAULT_BLEND_MODE);

  return (
    <StaticSection title={t("editor.props.appearance")} storageKey="appearance">
      <div className="grid grid-cols-2 items-center gap-2">
        <ScrubField
          suffix="%"
          min={0}
          max={100}
          value={value}
          onValueChange={(next) => edit({ opacity: next / 100 })}
          onCommit={commitNow}
          ariaLabel={t("editor.props.opacity")}
          scrubHint={t("editor.props.dragToAdjust")}
          disabled={mixed}
        />
        <FlatSelect
          value={blendMode}
          onChange={(next) => editAndCommit({ blendMode: next })}
          label={t("editor.props.blendMode")}
          placeholderIcon={<IconMix size={11} className="text-neutral-500" />}
          options={BLEND_MODES.map((mode) => ({
            value: mode,
            label: t(blendModeLabelKey(mode)),
          }))}
          triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !px-2.5 !text-[10px] !font-mono !tabular-nums !uppercase !text-neutral-100 hover:!bg-neutral-800/80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          widthClass="w-full"
        />
      </div>
    </StaticSection>
  );
}

AppearanceSection.propTypes = {
  object: PropTypes.object.isRequired,
  selectedNodes: PropTypes.array,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
};
