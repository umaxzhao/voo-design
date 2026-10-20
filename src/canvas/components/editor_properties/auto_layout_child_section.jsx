import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { CollapsibleSection } from "./property_section.jsx";

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
          <select
            data-testid="editor-auto-layout-child-position"
            aria-label={t("editor.autoLayout.position")}
            className={FIELD_CLASS}
            value={absolute ? "absolute" : "flow"}
            onChange={(event) =>
              editAndCommit({ layoutPosition: event.target.value })
            }
          >
            <option value="flow">{t("editor.autoLayout.flow")}</option>
            <option value="absolute">{t("editor.autoLayout.absolute")}</option>
          </select>
        </label>
        {!absolute &&
          ["layoutWidth", "layoutHeight"].map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-2 text-[10px] text-neutral-400"
            >
              <span>{t(`editor.autoLayout.${key}`)}</span>
              <select
                data-testid={`editor-auto-layout-child-${key}`}
                aria-label={t(`editor.autoLayout.${key}`)}
                className={FIELD_CLASS}
                value={object[key] === "fill" ? "fill" : "fixed"}
                onChange={(event) =>
                  editAndCommit({ [key]: event.target.value })
                }
              >
                <option value="fixed">{t("editor.autoLayout.fixed")}</option>
                <option value="fill">{t("editor.autoLayout.fill")}</option>
              </select>
            </label>
          ))}
      </div>
    </CollapsibleSection>
  );
}

AutoLayoutChildSection.propTypes = {
  object: PropTypes.object.isRequired,
  editAndCommit: PropTypes.func.isRequired,
};
