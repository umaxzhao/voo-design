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

  const pinClass = (active) =>
    `absolute transition-colors ${
      active
        ? "bg-[#a8fcd4]"
        : "bg-[#525252] hover:bg-neutral-400"
    }`;

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
          <button
            type="button"
            data-testid="editor-constraints-left"
            aria-label={t("editor.constraints.left")}
            onClick={() => change({ horizontal: "left" })}
            className={`${pinClass(h === "left" || h === "leftRight")} left-2 top-[21px] h-[18px] w-[2px] rounded-md`}
          />
          <button
            type="button"
            data-testid="editor-constraints-right"
            aria-label={t("editor.constraints.right")}
            onClick={() => change({ horizontal: "right" })}
            className={`${pinClass(h === "right" || h === "leftRight")} left-[50px] top-[21px] h-[18px] w-[2px] rounded-md`}
          />
          <button
            type="button"
            data-testid="editor-constraints-top"
            aria-label={t("editor.constraints.top")}
            onClick={() => change({ vertical: "top" })}
            className={`${pinClass(v === "top" || v === "topBottom")} left-[21px] top-2 h-[2px] w-[18px] rounded-md`}
          />
          <button
            type="button"
            data-testid="editor-constraints-bottom"
            aria-label={t("editor.constraints.bottom")}
            onClick={() => change({ vertical: "bottom" })}
            className={`${pinClass(v === "bottom" || v === "topBottom")} left-[21px] top-[50px] h-[2px] w-[18px] rounded-md`}
          />
          <button
            type="button"
            data-testid="editor-constraints-center-horizontal"
            aria-label={t("editor.constraints.centerHorizontal")}
            onClick={() => change({ horizontal: "center" })}
            className={`${pinClass(h === "center")} left-[21px] top-[29px] h-[2px] w-[19px] rounded-md`}
          />
          <button
            type="button"
            data-testid="editor-constraints-center-vertical"
            aria-label={t("editor.constraints.centerVertical")}
            onClick={() => change({ vertical: "center" })}
            className={`${pinClass(v === "center")} left-[29.5px] top-[20.5px] h-[19px] w-[2px] rounded-md`}
          />
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
