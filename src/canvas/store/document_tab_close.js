/**
 * Close the active project tab from an application-level command (native menu).
 *
 * The renderer owns this operation so the dirty-document confirmation runs in
 * the same place as the tab strip's close button. Closing the last tab returns
 * to the welcome screen; it never closes the application window.
 *
 * @param {{ getState: () => object }} store design store (or a test double)
 * @param {() => boolean} [confirmClose] returns true when a dirty tab may close
 * @returns {boolean} whether the active tab was closed
 */
export function closeActiveDocumentTab(store, confirmClose = () => true) {
  const state = store?.getState?.();
  if (!state?.activeDocumentId || state.welcomeOpen) return false;
  return state.closeDocument(state.activeDocumentId, confirmClose);
}
