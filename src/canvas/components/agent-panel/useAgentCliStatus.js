import { useState, useCallback, useEffect } from "react";
import { CLI_TRANSPORT } from "../../../shared/cli-agents.js";
import {
  cliTransport,
  ensureLocalCliBridge,
  getLocalCliBridge,
  resolveCliTransport,
} from "./local_cli_bridge.js";

/** The status a page reports when its link may not ask the machine anything. */
function linkUnavailable(reasonKey) {
  return { status: "unavailable", reasonKey, installed: null, binPath: null };
}

function resolveTransportFallback(transport) {
  if (transport === CLI_TRANSPORT.READS_ONLY) {
    return linkUnavailable("agent.connection.linkReadsOnly");
  }
  if (transport === CLI_TRANSPORT.NONE) {
    return linkUnavailable("agent.connection.desktopOnly");
  }
  return {
    status: "not_installed",
    installed: false,
    binPath: null,
  };
}

export function useAgentCliStatus(llmConfig, refreshLlmConfig) {
  const [cliStatus, setCliStatus] = useState(() => {
    const transport = cliTransport();
    if (transport !== CLI_TRANSPORT.RUNNABLE) {
      return resolveTransportFallback(transport);
    }
    return null;
  });
  const [cliCopied, setCliCopied] = useState(false);

  const checkCli = useCallback(async (options = {}) => {
    const { dial = false } = options;
    if (typeof window === "undefined") {
      const fallback = resolveTransportFallback(cliTransport());
      setCliStatus(fallback);
      return fallback;
    }

    try {
      const link = dial
        ? {
            bridge: await ensureLocalCliBridge({ dial: true }),
            transport: cliTransport(),
          }
        : await resolveCliTransport();
      const { bridge } = link;

      // A link that cannot run local CLI processes cannot answer this question,
      // and reading its silence as "not installed" tells the user to install a
      // binary the machine already has. Say what the link is instead.
      if (link.transport !== CLI_TRANSPORT.RUNNABLE) {
        const unavailable = resolveTransportFallback(link.transport);
        setCliStatus(unavailable);
        return unavailable;
      }

      if (bridge?.connect || bridge?.checkStatus) {
        const result = bridge.connect
          ? await bridge.connect()
          : await bridge.checkStatus("codex", { probeLogin: true });
        const res = {
          ...result,
          status: !result.installed
            ? "not_installed"
            : result.authenticated === true && result.ready !== false
              ? "ready"
              : "unauthenticated",
        };
        setCliStatus(res);
        return res;
      }
    } catch {
      const fallback = resolveTransportFallback(cliTransport());
      setCliStatus(fallback);
      return fallback;
    }

    const fallback = resolveTransportFallback(cliTransport());
    setCliStatus(fallback);
    return fallback;
  }, []);

  useEffect(() => {
    if (llmConfig?.providerId === "cli") {
      void checkCli();
    }
  }, [llmConfig?.providerId, checkCli]);

  const handleRefreshCli = useCallback(async () => {
    await checkCli({ dial: true });
    refreshLlmConfig();
  }, [checkCli, refreshLlmConfig]);

  const handleLaunchCliLogin = useCallback(async () => {
    // Logging a CLI in travels the same channel as running it, so a link that
    // cannot run one cannot open its login either.
    if (cliTransport() === CLI_TRANSPORT.READS_ONLY) return;
    const bridge = getLocalCliBridge();
    if (bridge) {
      try {
        if (bridge.launchLogin) {
          await bridge.launchLogin("codex");
        } else if (bridge.launch) {
          await bridge.launch("codex", {
            command: "codex login",
          });
        }
        setTimeout(() => {
          void checkCli();
          refreshLlmConfig();
        }, 1500);
      } catch {
        // ignore
      }
    }
  }, [checkCli, refreshLlmConfig]);

  return {
    cliStatus,
    setCliStatus,
    cliCopied,
    setCliCopied,
    checkCli,
    handleRefreshCli,
    handleLaunchCliLogin,
  };
}
