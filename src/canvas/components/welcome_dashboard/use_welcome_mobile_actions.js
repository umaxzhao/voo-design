import { useEffect } from "react";
import { openWelcomeBrowser } from "../welcome_home_actions.js";
import { WELCOME_MENU_ACTION_EVENT } from "./welcome_events.js";

export function useWelcomeMobileActions({
  setActiveTab,
  setActiveFolder,
  setMobileSearchOpen,
  fileInputRef,
  screenshotInputRef,
  setSortBy,
  setViewMode,
}) {
  useEffect(() => {
    const handleMobileMenuAction = (event) => {
      const { action, value } = event.detail ?? {};
      if (action === "tab") {
        setActiveTab(value);
        setActiveFolder(null);
        setMobileSearchOpen(false);
      } else if (action === "folder") {
        setActiveTab("recents");
        setActiveFolder(value);
        setMobileSearchOpen(false);
      } else if (action === "search") {
        setActiveTab("recents");
        setActiveFolder(null);
        setMobileSearchOpen(true);
      } else if (action === "open-file" || action === "import-figma") {
        fileInputRef.current?.click();
      } else if (action === "import-browser") {
        openWelcomeBrowser();
      } else if (action === "recreate-screenshot") {
        screenshotInputRef.current?.click();
      } else if (action === "sort") {
        setSortBy(value);
      } else if (action === "view") {
        setViewMode(value);
      }
    };
    window.addEventListener(WELCOME_MENU_ACTION_EVENT, handleMobileMenuAction);
    return () =>
      window.removeEventListener(
        WELCOME_MENU_ACTION_EVENT,
        handleMobileMenuAction,
      );
  }, [
    setActiveTab,
    setActiveFolder,
    setMobileSearchOpen,
    fileInputRef,
    screenshotInputRef,
    setSortBy,
    setViewMode,
  ]);
}
