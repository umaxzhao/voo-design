import { useEffect } from "react";

/** Dismiss outside pointer gestures without removing a menu before its click runs. */
export function useWelcomeMenuDismiss({ menuRef, setActiveMenuId, setSortMenuOpen }) {
  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (e.target instanceof Element && e.target.closest("[data-welcome-file-menu]")) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuId(null);
        setSortMenuOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setActiveMenuId(null);
      setSortMenuOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuRef, setActiveMenuId, setSortMenuOpen]);
}
