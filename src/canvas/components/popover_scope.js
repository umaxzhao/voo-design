import { createContext } from "react";

/** Nested portals stay part of their owning popover's outside-click boundary. */
export const PopoverScopeContext = createContext(null);
export function isOwnedPopoverTarget(target, owner) {
  return Boolean(owner && target?.closest?.("[data-popover-scope]")?.getAttribute("data-popover-scope") === owner);
}
