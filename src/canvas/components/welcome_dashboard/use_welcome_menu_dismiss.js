import { useEffect } from "react";

/** Close the file context menu and the sort dropdown on any outside mousedown. */
export function useWelcomeMenuDismiss({ menuRef, setActiveMenuId, setSortMenuOpen }) {
  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuId(null);
        setSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);
}
