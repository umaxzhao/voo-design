import { useEffect, useSyncExternalStore } from "react";
import { CLI_TRANSPORT } from "../../../shared/cli-agents.js";
import { cliTransport, getLocalCliBridge } from "./local_cli_bridge.js";
import { useLocalService } from "./use_local_service.js";
import { availableModelGroups } from "./model_catalog.js";
import {
  modelCatalogRevision,
  refreshModelCatalog,
  subscribeModelCatalog,
} from "./model_discovery.js";

/** Both pickers share one capability-filtered catalog and discovery lifecycle. */
export function useModelGroups() {
  const service = useLocalService();
  useSyncExternalStore(
    subscribeModelCatalog,
    modelCatalogRevision,
    modelCatalogRevision,
  );
  useEffect(() => {
    const refresh = () => {
      if (cliTransport() !== CLI_TRANSPORT.RUNNABLE) return;
      void refreshModelCatalog(getLocalCliBridge()).then((errors) => {
        for (const { cliId, error } of errors)
          console.warn("Model catalog:", cliId, error);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [service.available, service.native]);
  return availableModelGroups().filter(group =>
    !["claude", "codex", "antigravity"].includes(group.cliId) || service.native ||
      (service.available && service.statuses?.[group.cliId]?.installed === true),
  );
}
