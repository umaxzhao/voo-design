/** Less frequent text properties stay in one disclosure, with explicit labels. */
import PropTypes from "prop-types";
import { Baseline, Pilcrow, Spline } from "lucide-react";
import FlatSelect from "../flat_select.jsx";
import { useI18n } from "../../use_i18n.js";
import { TextField, TextMetricField, TextOptionsDisclosure, TextToggleButton } from "./text-typography-controls.jsx";

export default function TextAdvancedOptions({ object, edit, editAndCommit, commitNow, mixedBaselineShift }) {
  const { t } = useI18n();
  const metricProps = { onCommit: commitNow, scrubHint: t("editor.props.dragToAdjust") };
  return (
    <TextOptionsDisclosure
      storageKey={`textStyle.more.${object.kind}`}
      title={t("editor.props.moreTextOptions")}
      defaultOpen={Boolean(object.textPath)}
    >
      <TextField label={t("editor.props.textDirection")}>
        <div className="flex gap-1">
          {["horizontal", "vertical"].map((value) => (
            <TextToggleButton
              key={value}
              active={(object.direction ?? "horizontal") === value}
              onClick={() => editAndCommit({ direction: value })}
              label={t(`editor.props.direction.${value}`)}
            >
              {t(`editor.props.direction.${value}`)}
            </TextToggleButton>
          ))}
        </div>
      </TextField>
      <TextField label={t("editor.props.textCase")}>
        <FlatSelect
          value={object.textCase ?? "original"}
          onChange={(value) => editAndCommit({ textCase: value })}
          label={t("editor.props.textCase")}
          options={["original", "upper", "lower", "title"].map((value) => ({ value, label: t(`editor.props.textCase.${value}`) }))}
          triggerClassName="!h-8 !w-full !rounded-xl !bg-neutral-800 !px-2 !text-[11px] !font-mono !text-neutral-100 max-md:!h-12 hover:!bg-neutral-800/80"
          widthClass="w-40"
        />
      </TextField>
      <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
        <TextMetricField
          {...metricProps}
          label={t("editor.props.paragraphSpacing")}
          icon={Pilcrow}
          unit="px"
          min={0}
          max={200}
          value={object.paragraphSpacing ?? 0}
          onChange={(value) => edit({ paragraphSpacing: Math.round(value) })}
        />
        <TextMetricField
          {...metricProps}
          label={t("editor.props.baselineShift")}
          icon={Baseline}
          unit="px"
          min={-100}
          max={100}
          mixed={mixedBaselineShift}
          value={object.baselineShift ?? 0}
          onChange={(value) => edit({ baselineShift: Math.round(value) })}
        />
      </div>
      {object.textPath ? (
        <div className="space-y-2">
          <TextMetricField
            {...metricProps}
            label={t("editor.props.pathTextOffset")}
            icon={Spline}
            unit="px"
            min={-500}
            max={2000}
            value={object.textPath.startOffset ?? 0}
            onChange={(value) => edit({ textPath: { ...object.textPath, startOffset: Math.round(value) } })}
          />
          <TextField label={t("editor.props.pathText")}>
            <div className="flex gap-1">
              <TextToggleButton
                active={(object.textPath.side ?? "top") === "top"}
                label={t("editor.props.pathTextSideTop")}
                onClick={() => editAndCommit({ textPath: { ...object.textPath, side: "top" } })}
              >{t("editor.props.pathTextOutside")}</TextToggleButton>
              <TextToggleButton
                active={object.textPath.side === "bottom"}
                label={t("editor.props.pathTextSideBottom")}
                onClick={() => editAndCommit({ textPath: { ...object.textPath, side: "bottom" } })}
              >{t("editor.props.pathTextInside")}</TextToggleButton>
              <TextToggleButton
                active={Boolean(object.textPath.reverse)}
                label={t("editor.props.pathTextReverse")}
                onClick={() => editAndCommit({ textPath: { ...object.textPath, reverse: !object.textPath.reverse } })}
              >{t("editor.props.pathTextReverseShort")}</TextToggleButton>
            </div>
          </TextField>
        </div>
      ) : null}
    </TextOptionsDisclosure>
  );
}
TextAdvancedOptions.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  mixedBaselineShift: PropTypes.bool.isRequired,
};
