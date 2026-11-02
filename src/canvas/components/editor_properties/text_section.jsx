/** Existing text layers share basic controls and keep extras behind one entry. */
import PropTypes from "prop-types";
import { RectangleHorizontal } from "lucide-react";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { CollapsibleSection } from "./property_section.jsx";
import { useI18n } from "../../use_i18n.js";
import TypographyBasics from "./text-typography-basics.jsx";
import TextAdvancedOptions from "./text-advanced-options.jsx";
import { TextField, TextMetricField, TextToggleButton } from "./text-typography-controls.jsx";

export default function TextSection({ object, edit, editAndCommit, commitNow, selectedNodes = [] }) {
  const { t } = useI18n();
  const fixedWidth = object.boxWidth > 0;
  const mixedBaselineShift = selectedNodes.length > 1 && commonValue(selectedNodes, "baselineShift") === MIXED;
  const metricProps = { onCommit: commitNow, scrubHint: t("editor.props.dragToAdjust") };
  return (
    <CollapsibleSection title={t("editor.props.textStyle")} defaultOpen storageKey={`textStyle.${object.kind}`}>
      <div className="flex flex-col gap-3" data-testid="text-typography-section">
        <TypographyBasics
          object={object}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          selectedNodes={selectedNodes}
        />
        <TextField label={t("editor.props.widthMode")}>
          <div className="flex gap-1">
            <TextToggleButton
              active={!fixedWidth}
              onClick={() => editAndCommit({ boxWidth: 0 })}
              label={t("editor.props.autoWidth")}
            >{t("editor.props.autoWidth")}</TextToggleButton>
            <TextToggleButton
              active={fixedWidth}
              onClick={() => editAndCommit({ boxWidth: Math.max(8, Math.round(object.boxWidth || object.width || 100)) })}
              label={t("editor.props.fixedWidth")}
            >{t("editor.props.fixedWidth")}</TextToggleButton>
          </div>
        </TextField>
        {fixedWidth ? <TextMetricField
          {...metricProps}
          label={t("editor.props.boxWidth")}
          icon={RectangleHorizontal}
          unit="px"
          min={8}
          max={8192}
          value={Math.round(object.boxWidth)}
          onChange={(value) => edit({ boxWidth: value })}
        /> : null}
        <TextAdvancedOptions
          object={object}
          edit={edit}
          editAndCommit={editAndCommit}
          commitNow={commitNow}
          mixedBaselineShift={mixedBaselineShift}
        />
      </div>
    </CollapsibleSection>
  );
}
TextSection.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  selectedNodes: PropTypes.array,
};
