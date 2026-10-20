import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";

/**
 * A frame's name in its header. Double-click the header (handled by the page, since a drag capture retargets it) to rename it in place: Enter or
 * leaving the field keeps the name, Escape cancels, and an empty name goes
 * back to the default one.
 */
export default function EditorPageTitle({
  title,
  onRename = null,
  editing = false,
  onEditingChange = () => {},
}) {
  const { t } = useI18n();
  const setEditing = onEditingChange;
  if (editing && onRename) {
    return (
      <input
        autoFocus
        data-testid="editor-page-title-input"
        aria-label={t("editor.pages.rename")}
        defaultValue={title}
        maxLength={80}
        className="h-4 w-32 min-w-0 rounded-md bg-white/10 px-1 font-mono text-[10px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
        onFocus={(event) => event.currentTarget.select()}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") setEditing(false);
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={(event) => {
          setEditing(false);
          const name = event.currentTarget.value.trim();
          if (name !== title) onRename(name);
        }}
      />
    );
  }
  return (
    <span
      data-testid="editor-page-title-text"
      title={onRename ? t("editor.pages.renameHint") : undefined}
      // Colour comes from the header bar (dark on a focused tinted bar).
      className="truncate"
    >
      {title}
    </span>
  );
}

EditorPageTitle.propTypes = {
  title: PropTypes.string.isRequired,
  onRename: PropTypes.func,
  editing: PropTypes.bool,
  onEditingChange: PropTypes.func,
};
