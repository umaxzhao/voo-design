import PropTypes from "prop-types";
import { useState } from "react";

/** Where the DeepSeek Harness app itself is downloaded from. */
export const DEEPSEEK_DOWNLOAD_URL = "https://github.com/deepseek-ai/deepseek-harness";

/**
 * What the command line says when the bridge cannot report the connector
 * folder. Deliberately a placeholder, never a guessed absolute path: the real
 * per-user path is only known to the app (`status.dsh.installCommand`).
 */
export const DEEPSEEK_INSTALL_PLACEHOLDER = "dsh plugin add link:<connector folder>";

const FOCUS_CLASS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40";

/**
 * The two independent installs behind a DeepSeek Harness card.
 *
 * `status.dsh` is the structured answer from the desktop app. Older or partial
 * answers fall back to the flat `installed`/`authenticated` pair, which the
 * bridge maps to the same two facts (see PLAN 4.2).
 *
 * @returns {{known: boolean, appInstalled: boolean|null, pluginInstalled: boolean|null}}
 */
export function deepseekConnectorState(status) {
  if (status === null || typeof status !== "object") {
    return { known: false, appInstalled: null, pluginInstalled: null };
  }
  const dsh = status.dsh;
  const appInstalled =
    typeof dsh?.appInstalled === "boolean" ? dsh.appInstalled : Boolean(status.installed);
  const pluginInstalled = !appInstalled
    ? false
    : typeof dsh?.pluginInstalled === "boolean"
      ? dsh.pluginInstalled
      : status.authenticated === true;
  return { known: true, appInstalled, pluginInstalled };
}

/** The command a user can run by hand when the one-click install cannot. */
export function deepseekInstallCommand(status) {
  const dsh = status?.dsh;
  const explicit = [dsh?.installCommand, status?.installCmd].find(
    (value) => typeof value === "string" && value.trim(),
  );
  if (explicit) return explicit.trim();
  const connectorDir = typeof dsh?.connectorDir === "string" ? dsh.connectorDir.trim() : "";
  return connectorDir
    ? `dsh plugin add link:${connectorDir}`
    : DEEPSEEK_INSTALL_PLACEHOLDER;
}

/**
 * Inline install guidance for the DeepSeek Harness card.
 *
 * Three states, read from `status.dsh`: app missing (download link), app
 * present but VOO plugin missing (command + copy + one-click install), and
 * both present (how to use it in a new session). A null `status` — web build,
 * read-only link, detection unavailable — still renders the manual command and
 * "check again", never an error and never a blank panel.
 *
 * One-click install goes through the local CLI bridge (`dshInstall`), never
 * `window.vooDesktop` directly, and reports a failed install as text with the
 * command kept on screen so the user can run it themselves.
 */
export default function DeepSeekConnectorInline({ t, status = null, detection = null }) {
  const [phase, setPhase] = useState("idle");
  const [resultCommand, setResultCommand] = useState("");
  const [copied, setCopied] = useState(false);
  const { known, appInstalled, pluginInstalled } = deepseekConnectorState(status);
  const state = !known
    ? "unknown"
    : !appInstalled
      ? "needsApp"
      : !pluginInstalled
        ? "needsPlugin"
        : "ready";
  const command = deepseekInstallCommand(status);
  const visibleCommand =
    state === "needsPlugin" && phase === "failed" && resultCommand ? resultCommand : command;

  const copyCommand = () => {
    try {
      void globalThis.navigator?.clipboard?.writeText(visibleCommand);
    } catch {
      // Clipboard is optional; the command stays selectable on screen.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const install = async () => {
    if (phase === "installing") return;
    setPhase("installing");
    setResultCommand("");
    try {
      const { getLocalCliBridge, ensureLocalCliBridge } = await import(
        "../agent-panel/local_cli_bridge.js"
      );
      const bridge = getLocalCliBridge() ?? (await ensureLocalCliBridge({ dial: true }));
      const result = await bridge?.dshInstall?.();
      if (result?.ok) {
        setPhase("done");
        detection?.refresh?.();
        return;
      }
      if (typeof result?.command === "string" && result.command.trim()) {
        setResultCommand(result.command.trim());
      }
      setPhase("failed");
    } catch {
      setPhase("failed");
    }
  };

  const installed = t("firstRun.deepseek.installed");
  const notInstalled = t("firstRun.deepseek.notInstalled");
  const unavailable = t("firstRun.agentStatus.unavailable");
  const appText = appInstalled === true ? installed : appInstalled === false ? notInstalled : unavailable;
  const pluginText = pluginInstalled === true ? installed : pluginInstalled === false ? notInstalled : unavailable;
  const resultText = phase === "installing"
    ? t("firstRun.deepseek.installing")
    : phase === "done"
      ? t("firstRun.deepseek.installDone")
      : phase === "failed"
        ? t("firstRun.deepseek.installFailed")
        : "";

  return (
    <div
      data-testid="deepseek-connector-inline"
      data-state={state}
      className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-[11px] font-medium text-neutral-200">{t("firstRun.deepseek.title")}</p>
          {state === "needsPlugin" ? (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              {t("firstRun.deepseek.pluginMissing")}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          data-testid="deepseek-refresh"
          onClick={() => detection?.refresh?.()}
          className={`h-7 shrink-0 rounded-lg bg-white/[0.08] px-2.5 text-[10px] text-neutral-200 transition-colors hover:bg-white/[0.14] ${FOCUS_CLASS}`}
        >
          {t("firstRun.deepseek.refresh")}
        </button>
      </div>

      <dl className="mt-2 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-[10px] text-neutral-400">{t("firstRun.deepseek.app")}</dt>
          <dd
            data-testid="deepseek-app-status"
            data-installed={appInstalled === true ? "true" : appInstalled === false ? "false" : "unknown"}
            className={`text-[10px] font-medium ${appInstalled === true ? "text-[#a7ffd4]" : "text-neutral-300"}`}
          >
            {appText}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-[10px] text-neutral-400">{t("firstRun.deepseek.plugin")}</dt>
          <dd
            data-testid="deepseek-plugin-status"
            data-installed={pluginInstalled === true ? "true" : pluginInstalled === false ? "false" : "unknown"}
            className={`text-[10px] font-medium ${pluginInstalled === true ? "text-[#a7ffd4]" : "text-neutral-300"}`}
          >
            {pluginText}
          </dd>
        </div>
      </dl>

      {state === "needsApp" ? (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-[10px] leading-4 text-neutral-400">{t("firstRun.deepseek.appHint")}</p>
          <a
            href={DEEPSEEK_DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer noopener"
            className={`w-fit rounded-lg bg-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-neutral-100 transition-colors hover:bg-white/[0.14] ${FOCUS_CLASS}`}
          >
            {t("firstRun.deepseek.download")}
          </a>
        </div>
      ) : null}

      {state === "needsPlugin" ? (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-[10px] leading-4 text-neutral-400">{t("firstRun.deepseek.installHint")}</p>
          <p className="text-[10px] text-neutral-500">{t("firstRun.deepseek.installCommandLabel")}</p>
          <div className="flex items-center gap-2 rounded-lg bg-black/40 px-2 py-1.5">
            <code
              data-testid="deepseek-install-command"
              className="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-300"
            >
              {visibleCommand}
            </code>
            <button
              type="button"
              data-testid="deepseek-copy-command"
              onClick={copyCommand}
              className="shrink-0 text-[10px] text-neutral-400 transition-colors hover:text-white"
            >
              {copied ? t("firstRun.connection.copied") : t("firstRun.connection.copy")}
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              data-testid="deepseek-install-button"
              disabled={phase === "installing"}
              onClick={() => { void install(); }}
              className={`rounded-lg bg-white px-3 py-1.5 text-[10px] font-medium text-black transition-colors hover:bg-neutral-200 disabled:pointer-events-none disabled:opacity-40 ${FOCUS_CLASS}`}
            >
              {phase === "installing"
                ? t("firstRun.deepseek.installing")
                : t("firstRun.deepseek.installButton")}
            </button>
          </div>
        </div>
      ) : null}

      {state === "unknown" ? (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-[10px] leading-4 text-neutral-400">{t("firstRun.deepseek.installHint")}</p>
          <p className="text-[10px] text-neutral-500">{t("firstRun.deepseek.installCommandLabel")}</p>
          <div className="flex items-center gap-2 rounded-lg bg-black/40 px-2 py-1.5">
            <code
              data-testid="deepseek-install-command"
              className="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-300"
            >
              {visibleCommand}
            </code>
            <button
              type="button"
              data-testid="deepseek-copy-command"
              onClick={copyCommand}
              className="shrink-0 text-[10px] text-neutral-400 transition-colors hover:text-white"
            >
              {copied ? t("firstRun.connection.copied") : t("firstRun.connection.copy")}
            </button>
          </div>
        </div>
      ) : null}

      {state === "ready" ? (
        <div className="mt-2 flex flex-col gap-1">
          <p
            data-testid="deepseek-installed-hint"
            className="text-[10px] leading-4 text-[#a7ffd4]"
          >
            {t("firstRun.deepseek.connected")}
          </p>
          <p
            data-testid="deepseek-model-hint"
            className="text-[10px] leading-4 text-neutral-400"
          >
            {t("firstRun.deepseek.modelHint")}
          </p>
        </div>
      ) : null}

      {resultText ? (
        <p
          data-testid="deepseek-install-result"
          role="status"
          className={`mt-1.5 text-[10px] leading-4 ${phase === "failed" ? "text-amber-300" : "text-[#a7ffd4]"}`}
        >
          {resultText}
        </p>
      ) : null}
    </div>
  );
}

DeepSeekConnectorInline.propTypes = {
  t: PropTypes.func.isRequired,
  status: PropTypes.object,
  detection: PropTypes.shape({ refresh: PropTypes.func }),
};
