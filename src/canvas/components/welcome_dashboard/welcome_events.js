/**
 * Window event fired by the title bar "New" button while the welcome page is open.
 * The welcome dashboard owns the create-new logic (it needs the current file list
 * for unique naming) and listens for this event to run it.
 */
export const WELCOME_NEW_EVENT = "voo:welcome-new";
