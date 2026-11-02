import PropTypes from "prop-types";
import { useContext } from "react";
import { DocumentColoursContext } from "./document_colours_context.js";
import { useI18n } from "../use_i18n.js";

const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Applies a document colour variable's value; empty state when there are none. */
export function DocumentColourRow({ onSelectColor }) {
  const { t } = useI18n();
  const variables = useContext(DocumentColoursContext);
  const colours = (variables ?? []).filter((item) => HEX.test(item?.value ?? ""));
  // System tokens carry an id like "system:text" and are named by locale key.
  const labelOf = (item) =>
    item.id?.startsWith("system:") && item.name === item.id.split(":").at(-1)
      ? t(`editor.variables.token.${item.name}`)
      : item.name;

  return (
    <div className="flex flex-col gap-1.5" data-testid="picker-document-colours">
      <span className="text-[10px] font-mono text-neutral-500">
        {t("editor.colorPicker.documentColours")}
      </span>
      {colours.length === 0 ? (
        <span className="text-[10px] font-mono text-neutral-500">
          {t("editor.colorPicker.noDocumentColours")}
        </span>
      ) : (
        <div className="grid grid-cols-9 gap-1.5">
          {colours.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectColor(item.value)}
              title={`${labelOf(item)} ${item.value}`}
              aria-label={t("editor.colorPicker.colorSwatch", { color: `${labelOf(item)} ${item.value}` })}
              style={{ backgroundColor: item.value }}
              className="h-5 w-5 rounded-full border border-white/10 transition-transform hover:scale-110 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 active:scale-95"
            />
          ))}
        </div>
      )}
    </div>
  );
}

DocumentColourRow.propTypes = {
  onSelectColor: PropTypes.func.isRequired,
};
