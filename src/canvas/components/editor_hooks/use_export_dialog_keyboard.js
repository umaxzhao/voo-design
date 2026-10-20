import { useEffect, useRef } from "react";

export function handleExportDialogKeyDown(
  event,
  { dialog, document, onClose },
) {
  if (!dialog) return;
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
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current
      ?.querySelector('button[aria-pressed="true"], button:not(:disabled)')
      ?.focus();
    const onKeyDown = (event) =>
      handleExportDialogKeyDown(event, {
        dialog: dialogRef.current,
        document,
        onClose: () => onCloseRef.current(),
      });
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [dialogRef]);
}
