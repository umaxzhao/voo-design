import PropTypes from "prop-types";

import { fieldClass } from "./property_section.jsx";

/**
 * The panel's single Export entry. It sits in the fixed action row between the
 * header and the scrolling body, so it is always visible and never moves with
 * the section list. `title` names the group for assistive tech.
 */
export default function PropertiesExportAction({ title, label, onExport }) {
  return (
    <div
      role="group"
      aria-label={title}
      className="shrink-0 border-b border-white/10 pb-2.5"
      data-testid="properties-export-action"
    >
      <button type="button" className={fieldClass} onClick={onExport}>{label}</button>
    </div>
  );
}

PropertiesExportAction.propTypes = {
  title: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  onExport: PropTypes.func.isRequired,
};
