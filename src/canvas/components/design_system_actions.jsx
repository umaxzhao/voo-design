import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../use_i18n.js";
import { MAX_DESIGN_SYSTEM_NAME_LENGTH } from "../editor/design_system_registry.js";
import { SETTINGS_INPUT_CLASS } from "./settings_section.jsx";

export const ACTION_CLASS =
  "min-h-12 rounded-lg bg-white/10 px-4 py-2 text-xs text-neutral-100 outline-none hover:bg-white/[0.14] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-40";

/** Inline name field shared by Rename; the draft resets whenever it remounts. */
function RenameRow({ initialName, onSubmit, onCancel }) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  return (
    <form
      className="flex min-w-0 flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name);
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-2 text-xs text-neutral-300">
        {t("designSystems.nameLabel")}
        <input autoFocus maxLength={MAX_DESIGN_SYSTEM_NAME_LENGTH} className={SETTINGS_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="submit" className={ACTION_CLASS}>{t("designSystems.rename")}</button>
      <button type="button" className={ACTION_CLASS} onClick={onCancel}>{t("designSystems.cancel")}</button>
    </form>
  );
}

RenameRow.propTypes = {
  initialName: PropTypes.string.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

/** Use / Duplicate / Rename / Delete for the selected system. Rename and Delete are custom-only. */
export default function DesignSystemActions({
  system,
  name,
  canUse,
  renaming,
  confirmingDelete,
  onUse,
  onDuplicate,
  onRenameToggle,
  onRename,
  onDeleteToggle,
  onDelete,
}) {
  const { t } = useI18n();
  if (renaming) {
    return <RenameRow initialName={name} onSubmit={onRename} onCancel={() => onRenameToggle(false)} />;
  }
  return (
    <div className="flex flex-wrap gap-2" data-testid="design-system-actions">
      <button type="button" disabled={!canUse} onClick={onUse} className={ACTION_CLASS}>{t("designSystems.use")}</button>
      <button type="button" onClick={onDuplicate} className={ACTION_CLASS}>{t("designSystems.duplicate")}</button>
      {!system.builtIn && (
        <button type="button" onClick={() => onRenameToggle(true)} className={ACTION_CLASS}>{t("designSystems.rename")}</button>
      )}
      {!system.builtIn && !confirmingDelete && (
        <button type="button" onClick={() => onDeleteToggle(true)} className={ACTION_CLASS}>{t("designSystems.delete")}</button>
      )}
      {!system.builtIn && confirmingDelete && (
        <>
          <button type="button" onClick={onDelete} className={ACTION_CLASS}>{t("designSystems.confirmDelete")}</button>
          <button type="button" onClick={() => onDeleteToggle(false)} className={ACTION_CLASS}>{t("designSystems.cancel")}</button>
        </>
      )}
    </div>
  );
}

DesignSystemActions.propTypes = {
  system: PropTypes.shape({ builtIn: PropTypes.bool }).isRequired,
  name: PropTypes.string.isRequired,
  canUse: PropTypes.bool.isRequired,
  renaming: PropTypes.bool.isRequired,
  confirmingDelete: PropTypes.bool.isRequired,
  onUse: PropTypes.func.isRequired,
  onDuplicate: PropTypes.func.isRequired,
  onRenameToggle: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onDeleteToggle: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
