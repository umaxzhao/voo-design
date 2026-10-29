import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { CollapsibleSection } from "./property_section.jsx";
import CustomSelect from "../custom_select.jsx";

const FIELD_CLASS =
  "w-full min-w-0 rounded-lg bg-[#222222] px-2 py-1.5 text-[11px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]/40";

export default function AutoLayoutChildSection({ object, editAndCommit }) {
  const { t } = useI18n();
  const absolute = object.layoutPosition === "absolute";

  return (
    <CollapsibleSection
      title={t("editor.autoLayout.childTitle")}
      storageKey="autoLayout.child"
    >
      <div className="flex flex-col gap-2">
        <label className="flex items-center justify-between gap-2 text-[10px] text-neutral-400">
          <span>{t("editor.autoLayout.position")}</span>
          <CustomSelect
            data-testid="editor-auto-layout-child-position"
            aria-label={t("editor.autoLayout.position")}
            rootClassName="min-w-0 flex-1"
            className={FIELD_CLASS}
            value={absolute ? "absolute" : "flow"}
            onChange={(event) =>
              editAndCommit({ layoutPosition: event.target.value })
            }
          >
            <option value="flow">{t("editor.autoLayout.flow")}</option>
            <option value="absolute">{t("editor.autoLayout.absolute")}</option>
          </CustomSelect>
        </label>
      </div>
    </CollapsibleSection>
  );
}

AutoLayoutChildSection.propTypes = {
  object: PropTypes.object.isRequired,
  editAndCommit: PropTypes.func.isRequired,
};
