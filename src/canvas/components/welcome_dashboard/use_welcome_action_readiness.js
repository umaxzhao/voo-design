import { useEffect } from "react";
import { useDesignStore } from "../../../store/design_store.js";

/** Enable header actions only after the welcome action effects have mounted. */
export function useWelcomeActionReadiness() {
  useEffect(() => {
    useDesignStore.setState({ welcomeActionsReady: true });
    return () => useDesignStore.setState({ welcomeActionsReady: false });
  }, []);
}
