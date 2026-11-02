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

// The title bar mounts before the lazy dashboard. Retain one early New intent
// until its owner subscribes, without duplicating the workspace creation path.
const pendingNew = new WeakSet();

export function requestWelcomeNew(target = window) {
  pendingNew.add(target);
  target.dispatchEvent(new CustomEvent(WELCOME_NEW_EVENT));
}

export function subscribeWelcomeNew(create, target = window) {
  const receive = () => {
    pendingNew.delete(target);
    return create();
  };
  target.addEventListener(WELCOME_NEW_EVENT, receive);
  if (pendingNew.has(target)) receive();
  return () => target.removeEventListener(WELCOME_NEW_EVENT, receive);
}
