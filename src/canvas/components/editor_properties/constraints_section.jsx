import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import {
  HORIZONTAL_CONSTRAINTS,
  VERTICAL_CONSTRAINTS,
  normalizeConstraints,
} from "../../editor/scene_constraints.js";
import { StaticSection } from "./property_section.jsx";
import CustomSelect from "../custom_select.jsx";

const FIELD_CLASS =
  "h-7 min-w-0 flex-1 cursor-pointer appearance-none rounded-xl bg-neutral-800 pl-2.5 pr-6 text-[11px] font-mono tabular-nums text-neutral-100 uppercase outline-none transition-colors hover:bg-neutral-800/80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

const ROW_CLASS =
  "flex min-w-0 items-center gap-2 text-[10px] text-neutral-400";

export default function ConstraintsSection({ object, editAndCommit }) {
  const { t } = useI18n();
  const constraints = normalizeConstraints(object.constraints);
  const change = (patch) =>
    editAndCommit({ constraints: { ...constraints, ...patch } });

  // Visible strokes stay slim; each pin owns a separate transparent hit area.
  const pin = (name, axis, value, active, targetClass, strokeClass, label = name) => (
    <button
      type="button"
      key={name}
      data-testid={`editor-constraints-${name}`}
      aria-label={t(`editor.constraints.${label}`)}
      aria-pressed={active}
      onClick={() => change({ [axis]: value })}
      className={`absolute flex items-center justify-center rounded-md focus-visible:outline focus-visible:outline-1 focus-visible:outline-mint ${targetClass}`}
    >
      <span aria-hidden="true" className={`pointer-events-none rounded-md transition-colors ${strokeClass} ${active ? "bg-[#a7ffd4]" : "bg-[#525252]"}`} />
    </button>
  );

  const selectRow = (key, label, value, options, onChange) => (
    <label key={key} className={ROW_CLASS}>
      <span className="w-[62px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap uppercase">{label}</span>
      <span className="relative flex min-w-0 flex-1">
        <CustomSelect
          data-testid={`editor-constraints-${key}`}
          aria-label={label}
          rootClassName="flex-1"
          triggerClassName={FIELD_CLASS}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {t(`editor.constraints.${option}`)}
            </option>
          ))}
        </CustomSelect>
      </span>
    </label>
  );

  const h = constraints.horizontal;
  const v = constraints.vertical;

  return (
    <StaticSection
      title={t("editor.constraints.title")}
        >
      <div className="flex items-center gap-3">
        <div
          data-testid="editor-constraints-diagram"
          className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-[#1a1a1a]"
        >
          <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-md bg-[#262626]" />
          {pin("left", "horizontal", "left", h === "left" || h === "leftRight", "left-0 top-[18px] h-6 w-[18px]", "h-[18px] w-[2px]")}
          {pin("right", "horizontal", "right", h === "right" || h === "leftRight", "right-0 top-[18px] h-6 w-[18px]", "h-[18px] w-[2px]")}
          {pin("top", "vertical", "top", v === "top" || v === "topBottom", "left-[18px] top-0 h-[18px] w-6", "h-[2px] w-[18px]")}
          {pin("bottom", "vertical", "bottom", v === "bottom" || v === "topBottom", "bottom-0 left-[18px] h-[18px] w-6", "h-[2px] w-[18px]")}
          {/* Split the centre into adjacent targets; crossing strokes cannot own the same point. */}
          {pin("center-vertical", "vertical", "center", v === "center", "left-[18px] top-[18px] h-6 w-3", "h-[18px] w-[2px]", "centerVertical")}
          {pin("center-horizontal", "horizontal", "center", h === "center", "left-[30px] top-[18px] h-6 w-3", "h-[2px] w-[10px]", "centerHorizontal")}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {selectRow(
            "horizontal",
            t("editor.constraints.horizontal"),
            constraints.horizontal,
            HORIZONTAL_CONSTRAINTS,
            (horizontal) => change({ horizontal }),
          )}
          {selectRow(
            "vertical",
            t("editor.constraints.vertical"),
            constraints.vertical,
            VERTICAL_CONSTRAINTS,
            (vertical) => change({ vertical }),
          )}
        </div>
      </div>
    </StaticSection>
  );
}

ConstraintsSection.propTypes = {
  object: PropTypes.object.isRequired,
  editAndCommit: PropTypes.func.isRequired,
};
