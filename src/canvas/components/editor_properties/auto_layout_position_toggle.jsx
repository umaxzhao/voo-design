import PropTypes from "prop-types";
import { Scan } from "lucide-react";
import { useI18n } from "../../use_i18n.js";
import { sectionActionClass } from "./property_section.jsx";

/** Ignore the parent's auto layout without changing the child's own layout. */
export default function AutoLayoutPositionToggle({ object, editAndCommit }) {
  const { t } = useI18n();
  const absolute = object.layoutPosition === "absolute";
  return (
    <button
      type="button"
      data-testid="editor-auto-layout-child-position"
      aria-label={t("editor.autoLayout.absolute")}
      aria-pressed={absolute}
      title={t(
        absolute ? "editor.autoLayout.flow" : "editor.autoLayout.absolute",
      )}
      onClick={() =>
        editAndCommit({ layoutPosition: absolute ? "flow" : "absolute" })
      }
      className={`${sectionActionClass} ${absolute ? "bg-[#a7ffd4]/10 !text-[#a7ffd4]" : ""}`}
    >
      <Scan size={14} aria-hidden="true" />
    </button>
  );
}

AutoLayoutPositionToggle.propTypes = {
  object: PropTypes.object.isRequired,
  editAndCommit: PropTypes.func.isRequired,
};
