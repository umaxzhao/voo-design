import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import {
  HORIZONTAL_CONSTRAINTS,
  VERTICAL_CONSTRAINTS,
  normalizeConstraints,
} from "../../editor/scene_constraints.js";
import { CollapsibleSection } from "./property_section.jsx";

const FIELD_CLASS =
  "h-7 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-xl bg-neutral-800 pl-2.5 pr-6 text-[11px] font-mono tabular-nums text-neutral-100 uppercase outline-none transition-colors hover:bg-neutral-800/80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

const ROW_CLASS =
  "flex min-w-0 items-center gap-2 text-[10px] text-neutral-400";

export default function ConstraintsSection({ object, editAndCommit }) {
  const { t } = useI18n();
  const constraints = normalizeConstraints(object.constraints);
  const change = (patch) =>
    editAndCommit({ constraints: { ...constraints, ...patch } });

  const pinClass = (active) =>
    `absolute rounded-full transition-colors ${
      active
        ? "bg-[#a7ffd4]"
        : "bg-neutral-600 hover:bg-neutral-400"
    }`;

  const selectRow = (key, label, value, options, onChange) => (
    <label key={key} className={ROW_CLASS}>
      <span className="w-[62px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap uppercase">{label}</span>
      <span className="relative flex min-w-0 flex-1">
      <select
        data-testid={`editor-constraints-${key}`}
        aria-label={label}
        className={FIELD_CLASS}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`editor.constraints.${option}`)}
          </option>
        ))}
      </select>
        <svg aria-hidden="true" viewBox="0 0 10 10" className="pointer-events-none absolute right-2 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-neutral-400">
          <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </span>
    </label>
  );

  const h = constraints.horizontal;
  const v = constraints.vertical;

  return (
    <CollapsibleSection
      title={t("editor.constraints.title")}
      storageKey="constraints"
    >
      <div className="flex items-center gap-3">
        <div
          data-testid="editor-constraints-diagram"
          className="relative h-16 w-16 shrink-0 rounded-lg border border-white/10 bg-[#1a1a1a]"
        >          <div className="absolute inset-2 rounded-lg border border-white/20" />
          <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[#a7ffd4]/60 bg-[#a7ffd4]/10" />
          <button
            type="button"
            data-testid="editor-constraints-left"
            aria-label={t("editor.constraints.left")}
            onClick={() => change({ horizontal: "left" })}
            className={`${pinClass(h === "left" || h === "leftRight")} left-1 top-1/2 h-5 w-1 -translate-y-1/2`}
          />
          <button
            type="button"
            data-testid="editor-constraints-right"
            aria-label={t("editor.constraints.right")}
            onClick={() => change({ horizontal: "right" })}
            className={`${pinClass(h === "right" || h === "leftRight")} right-1 top-1/2 h-5 w-1 -translate-y-1/2`}
          />
          <button
            type="button"
            data-testid="editor-constraints-top"
            aria-label={t("editor.constraints.top")}
            onClick={() => change({ vertical: "top" })}
            className={`${pinClass(v === "top" || v === "topBottom")} left-1/2 top-1 h-1 w-5 -translate-x-1/2`}
          />
          <button
            type="button"
            data-testid="editor-constraints-bottom"
            aria-label={t("editor.constraints.bottom")}
            onClick={() => change({ vertical: "bottom" })}
            className={`${pinClass(v === "bottom" || v === "topBottom")} left-1/2 bottom-1 h-1 w-5 -translate-x-1/2`}
          />
          <button
            type="button"
            data-testid="editor-constraints-center"
            aria-label={t("editor.constraints.center")}
            onClick={() => change({ horizontal: "center" })}
            className={`${pinClass(h === "center")} left-1/2 top-1/2 h-1 w-5 -translate-x-1/2 -translate-y-1/2`}
          />
          <button
            type="button"
            data-testid="editor-constraints-center"
            aria-label={t("editor.constraints.center")}
            onClick={() => change({ vertical: "center" })}
            className={`${pinClass(v === "center")} left-1/2 top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2`}
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
    </CollapsibleSection>
  );
}

ConstraintsSection.propTypes = {
  object: PropTypes.object.isRequired,
  editAndCommit: PropTypes.func.isRequired,
};
