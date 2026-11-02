import { useEffect, useRef } from "react";
import { useModalFocus } from "../use_modal_focus.js";

export function handleExportDialogKeyDown(
  event,
  { dialog, document, onClose },
) {
  if (!dialog) return;
  // The command palette can be opened above an export dialog with Ctrl/Cmd+K.
  // Its keys belong to that foreground dialog, never the export underneath.
  const focusedDialog = event.target?.closest?.('[role="dialog"]');
  if (focusedDialog && focusedDialog !== dialog && !dialog.contains(focusedDialog)) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    onClose();
    return;
  }
  if (event.key !== "Tab") return;
  const controls = [
    ...dialog.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex="0"]',
    ),
  ].filter((element) => element.offsetParent !== null);
  const first = controls[0];
  const last = controls.at(-1);
  if (!dialog.contains(document.activeElement)) {
    event.preventDefault();
    first?.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
  // The editor's Tab shortcut must never turn dialog navigation into a save.
  event.stopImmediatePropagation();
}

export function useExportDialogKeyboard(dialogRef, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useModalFocus({
    open: true,
    dialogRef,
    onClose,
    initialFocus: 'button[aria-pressed="true"], button:not(:disabled)',
  });
  useEffect(() => {
    const onKeyDown = (event) =>
      handleExportDialogKeyDown(event, {
        dialog: dialogRef.current,
        document,
        onClose: () => onCloseRef.current(),
      });
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [dialogRef]);
}
