import PropTypes from "prop-types";
import { useLayoutEffect, useRef } from "react";
import { useI18n } from "../../use_i18n.js";
import { HEX_COLOUR, HexField } from "./colour_swatch.jsx";
import { CollapsibleSection } from "./property_section.jsx";
import { IconChevronDown, IconMinus, IconTrash } from "../../icons.jsx";

export default function ColorVariablesSection({
  object,
  documentId,
  variables,
  onCreate,
  onBind,
  onUpdate,
  onDelete,
}) {
  const { t } = useI18n();
  const active = variables.find((item) => item.id === object.fillVariableId);
  const canCreate = HEX_COLOUR.test(object.fill ?? "");
  const displayName = (item) =>
    item.id.startsWith("system:") && item.name === item.id.split(":").at(-1)
      ? t(`editor.variables.token.${item.name}`)
      : item.name;
  const nameInputRef = useRef(null);
  const activeId = active?.id;
  const activeName = active ? displayName(active) : "";

  // Undo and page switches can change the committed name without changing the
  // variable ID. Synchronize that value while preserving the input and focus;
  // unrelated renders must leave the user's uncommitted draft untouched.
  useLayoutEffect(() => {
    if (nameInputRef.current) nameInputRef.current.value = activeName;
  }, [documentId, activeId, activeName]);

  return (
    <CollapsibleSection
      title={t("editor.variables.title")}
      storageKey="editor.colorVariables"
      extra={
        canCreate ? (
          <button
            type="button"
            onClick={onCreate}
            title={t("editor.variables.create")}
            className="flex h-5 w-5 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors text-xs font-mono"
          >
            ＋
          </button>
        ) : null
      }
    >
      <div className="flex flex-col gap-2">
        {/* Variable binding dropdown with color swatch and chevron */}
        <div className="relative flex items-center">
          <div className="pointer-events-none absolute left-2.5 flex items-center">
            <span
              className="h-3 w-3 rounded-full border border-white/20 shrink-0"
              style={{
                backgroundColor:
                  active?.value ?? (object.fill || "transparent"),
              }}
            />
          </div>
          <select
            data-testid="editor-color-variable-select"
            aria-label={t("editor.variables.binding")}
            className="w-full appearance-none rounded-xl bg-[#222222] pl-8 pr-7 py-1.5 text-[11px] font-mono text-neutral-200 outline-none hover:bg-[#282828] focus:bg-[#282828] focus:ring-1 focus:ring-white/20 transition-colors cursor-pointer"
            value={active?.id ?? ""}
            onChange={(event) => onBind(event.target.value || null)}
          >
            <option value="" className="bg-[#1e1e1e] text-neutral-300">
              {t("editor.variables.unlinked")}
            </option>
            {variables.map((item) => (
              <option
                key={item.id}
                value={item.id}
                className="bg-[#1e1e1e] text-neutral-100"
              >
                {displayName(item)}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-2.5 text-neutral-400">
            <IconChevronDown size={12} />
          </div>
        </div>

        {/* When a variable is bound, show the active variable card with editable name and value */}
        {active ? (
          <div className="flex items-center gap-1.5 rounded-xl bg-[#1c1c1c] border border-white/5 p-1.5">
            <input
              key={active.id}
              ref={nameInputRef}
              aria-label={t("editor.variables.name")}
              defaultValue={activeName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name && name !== displayName(active)) {
                  onUpdate(active.id, { name });
                }
              }}
              className="min-w-0 flex-1 rounded-lg bg-[#222222] px-2 py-1 text-[11px] font-mono text-neutral-200 outline-none focus:bg-[#282828] focus:ring-1 focus:ring-white/20"
            />
            <HexField
              value={active.value}
              ariaLabel={t("editor.variables.value")}
              onCommit={(value) => onUpdate(active.id, { value })}
            />
            <button
              type="button"
              onClick={() => onBind(null)}
              title={t("editor.variables.unlinked")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <IconMinus size={12} />
            </button>
            {onDelete ? (
              <button
                type="button"
                data-testid="editor-color-variable-delete"
                onClick={() => onDelete(active.id)}
                title={t("editor.variables.delete")}
                aria-label={t("editor.variables.delete")}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
              >
                <IconTrash size={12} strokeWidth={1.5} />
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Action to save current fill as variable */}
        <button
          type="button"
          data-testid="editor-color-variable-create"
          disabled={!canCreate}
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.08] py-1.5 text-[11px] font-mono text-neutral-400 hover:border-white/20 hover:text-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="text-xs">＋</span>
          <span>{t("editor.variables.create")}</span>
        </button>
      </div>
    </CollapsibleSection>
  );
}

ColorVariablesSection.propTypes = {
  object: PropTypes.object.isRequired,
  documentId: PropTypes.string,
  variables: PropTypes.array.isRequired,
  onCreate: PropTypes.func.isRequired,
  onBind: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onDelete: PropTypes.func,
};
