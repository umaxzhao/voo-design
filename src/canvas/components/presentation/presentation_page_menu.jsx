import PropTypes from "prop-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TopBarMenuPopover from "../top-bar-menu-popover.jsx";
import { IconMore } from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";

const buttonClass =
  "flex min-h-8 w-full items-center rounded-lg px-2 text-left text-[11px] text-neutral-300 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

/** Compact menu for one page title; actions stay within the existing editor chrome. */
export default function PresentationPageMenu({
  pageId,
  index,
  count,
  title,
  notes,
  onAction,
}) {
  const { t } = useI18n();
  const anchorRef = useRef(null);
  const editDialogRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(null);
  const [draft, setDraft] = useState("");
  const closeMenu = useCallback(() => setOpen(false), []);
  const closeEdit = useCallback(() => setEditMode(null), []);
  const startEdit = (mode) => {
    setDraft(mode === "rename" ? title : (notes ?? ""));
    setOpen(false);
    setEditMode(mode);
  };
  const submitEdit = (event) => {
    event.preventDefault();
    onAction(
      editMode === "rename"
        ? { type: "rename", pageId, title: draft.trim() || title }
        : { type: "notes", pageId, notes: draft },
    );
    closeEdit();
  };
  const run = (operation) => {
    onAction({ ...operation, pageId });
    closeMenu();
  };

  useEffect(() => {
    if (!editMode) return undefined;
    const previousFocus = document.activeElement;
    const trigger = anchorRef.current;
    editDialogRef.current
      ?.querySelector("input, textarea")
      ?.focus({ preventScroll: true });
    const handleKeyDown = (event) => {
      const dialog = editDialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeEdit();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...dialog.querySelectorAll("input, textarea, button:not(:disabled)"),
      ];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const focusTarget = previousFocus?.isConnected ? previousFocus : trigger;
      focusTarget?.focus?.({ preventScroll: true });
    };
  }, [closeEdit, editMode]);

  return (
    <>
      <button
        ref={anchorRef}
        data-presentation-overlay={open || Boolean(editMode) || undefined}
        type="button"
        aria-label={t("presentation.pageMenu.open")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("presentation.pageMenu.open")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
        onClick={() => {
          setEditMode(null);
          setOpen((value) => !value);
        }}
      >
        <IconMore size={16} />
      </button>
      {open ? (
        <TopBarMenuPopover
          anchorRef={anchorRef}
          onClose={closeMenu}
          label={t("presentation.pageMenu.label")}
        >
          <div
            data-presentation-overlay
            className="flex w-56 flex-col gap-0.5 p-1"
          >
            <button
              type="button"
              role="menuitem"
              className={buttonClass}
              onClick={() => run({ type: "add", index: index + 1 })}
            >
              {t("presentation.pageMenu.addAfter")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={buttonClass}
              onClick={() => run({ type: "duplicate", index: index + 1 })}
            >
              {t("presentation.pageMenu.duplicate")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={buttonClass}
              disabled={index === 0}
              onClick={() => run({ type: "move", index: index - 1 })}
            >
              {t("presentation.pageMenu.moveUp")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={buttonClass}
              disabled={index === count - 1}
              onClick={() => run({ type: "move", index: index + 1 })}
            >
              {t("presentation.pageMenu.moveDown")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={buttonClass}
              onClick={() => startEdit("rename")}
            >
              {t("presentation.pageMenu.rename")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={buttonClass}
              onClick={() => startEdit("notes")}
            >
              {t("presentation.pageMenu.notes")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${buttonClass} text-rose-400 hover:bg-rose-500/10 hover:text-rose-300`}
              disabled={count <= 1}
              onClick={() => run({ type: "delete" })}
            >
              {t("presentation.pageMenu.delete")}
            </button>
          </div>
        </TopBarMenuPopover>
      ) : null}
      {editMode
        ? createPortal(
            <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4">
              <form
                ref={editDialogRef}
                data-presentation-overlay
                role="dialog"
                aria-modal="true"
                aria-labelledby={`presentation-${editMode}-heading-${pageId}`}
                tabIndex={-1}
                className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-[#141414] p-4 shadow-panel outline-none"
                onSubmit={submitEdit}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <h2
                  id={`presentation-${editMode}-heading-${pageId}`}
                  className="text-[12px] font-medium text-neutral-100"
                >
                  {t(
                    editMode === "rename"
                      ? "presentation.pageMenu.rename"
                      : "presentation.pageMenu.notes",
                  )}
                </h2>
                {editMode === "rename" ? (
                  <input
                    autoFocus
                    aria-label={t("presentation.pageMenu.rename")}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-w-0 rounded-xl bg-[#181818] px-3 py-2 text-[12px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
                  />
                ) : (
                  <textarea
                    autoFocus
                    aria-label={t("presentation.pageMenu.notes")}
                    rows={5}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-w-0 resize-y rounded-xl bg-[#181818] px-3 py-2 text-[12px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
                  />
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className={buttonClass + " w-auto"}
                    onClick={closeEdit}
                  >
                    {t("presentation.pageMenu.cancel")}
                  </button>
                  <button
                    type="submit"
                    className="min-h-8 rounded-lg bg-white px-3 text-[11px] text-black transition-colors hover:bg-neutral-200"
                  >
                    {t("presentation.pageMenu.save")}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

PresentationPageMenu.propTypes = {
  pageId: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
  count: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  notes: PropTypes.string,
  onAction: PropTypes.func.isRequired,
};
