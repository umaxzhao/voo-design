import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import {
  HORIZONTAL_CONSTRAINTS,
  VERTICAL_CONSTRAINTS,
  normalizeConstraints,
} from "../../editor/scene_constraints.js";
import { CollapsibleSection } from "./property_section.jsx";

const FIELD_CLASS =
  "w-full min-w-0 rounded-lg bg-[#222222] px-2 py-1.5 text-[11px] font-mono tabular-nums text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]/40";

const ROW_CLASS =
  "flex items-center justify-between gap-2 text-[10px] text-neutral-400";

/**
 * Resize-constraint controls for one node: how its box follows its parent
 * (page or group folder) when that parent is resized. Stored on the node as
 * `node.constraints`; see scene_constraints.js for the semantics table.
 *
 * Every node that has a box gets the section — top-level nodes are children of
 * the page, so "parent" is always well defined. Frames, the canvas background,
 * adjustments, regions and audio are handled by other sections.
 */
export default function ConstraintsSection({ object, editAndCommit }) {
  const { t } = useI18n();
  const constraints = normalizeConstraints(object.constraints);
  const change = (patch) =>
    editAndCommit({ constraints: { ...constraints, ...patch } });

  const selectRow = (key, label, value, options, onChange) => (
    <label key={key} className={ROW_CLASS}>
      <span>{label}</span>
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
    </label>
  );

  return (
    <CollapsibleSection
      title={t("editor.constraints.title")}
      storageKey="constraints"
    >
      <div className="flex flex-col gap-2">
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
        <p className="text-[10px] leading-snug text-neutral-500">
          {t("editor.constraints.hint")}
        </p>
      </div>
    </CollapsibleSection>
  );
}

ConstraintsSection.propTypes = {
  object: PropTypes.object.isRequired,
  editAndCommit: PropTypes.func.isRequired,
};
