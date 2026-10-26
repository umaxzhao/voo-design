/**
 * Window event fired by the title bar "New" button while the welcome page is open.
 * The welcome dashboard owns the create-new logic (it needs the current file list
 * for unique naming) and listens for this event to run it.
 */
export const WELCOME_NEW_EVENT = "voo:welcome-new";

/** Title-bar project menu action handled by the active welcome dashboard. */
export const WELCOME_MENU_ACTION_EVENT = "voo:welcome-menu-action";

/** Current welcome folders shared with the mobile project picker. */
export const WELCOME_FOLDERS_EVENT = "voo:welcome-folders";
