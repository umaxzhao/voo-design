/* eslint-disable react/prop-types */
import { useI18n } from "../../use_i18n.js";
import { loadIdentity } from "../../collab/identity.js";
import { useUserStore } from "../../store/user_store.js";
import InfoHint from "../info_hint.jsx";

export default function AgentWelcomeState({
  isConfigured,
  isCli,
  cliStatus,
  cliCopied,
  setCliCopied,
  handleLaunchCliLogin,
  handleRefreshCli,
  onOpenSettings,
  onSwitchToApi,
  onSignIn,
  renderedItemsCount,
  activeMode,
  handleSend,
  onSelectPrompt,
}) {
  const { t } = useI18n();
  const user = useUserStore((state) => state.user);
  const displayName =
    isConfigured && renderedItemsCount === 0
      ? (user?.isLoggedIn ? user.name : loadIdentity().name)?.trim()
      : "";
  const welcomeText =
    activeMode?.id === "workflow" && displayName
      ? t("agent.mode.workflowWelcomePersonal", { name: displayName })
      : activeMode?.welcomeKey
        ? t(activeMode.welcomeKey)
        : "";

  return (
    <>
      {/* A CLI whose status this page's link may not ask for is not a CLI
          that is missing: the install command below would be an instruction
          to install something the machine already has. */}
      {!isConfigured && isCli && cliStatus?.status === "unavailable" && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-neutral-900 p-5 my-auto text-center max-w-sm mx-auto">
          <p className="text-[12px] font-semibold text-neutral-200">
            {t(cliStatus.reasonKey || "agent.connection.desktopOnly")}
          </p>
          {(onSwitchToApi || onOpenSettings) && (
            <button
              type="button"
              onClick={
                onSwitchToApi || (() => onOpenSettings?.({ tab: "models" }))
              }
              className="mt-1 flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition-transform hover:scale-105 active:scale-95"
            >
              <span>{t("agent.switchToApi")}</span>
            </button>
          )}
        </div>
      )}

      {!isConfigured && isCli && cliStatus?.status !== "unavailable" && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-neutral-900 p-5 my-auto text-center max-w-sm mx-auto">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/[0.06] text-[#10A37F]">
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m18 16 4-4-4-4" />
              <path d="m6 8-4 4 4 4" />
              <path d="m14.5 4-5 16" />
            </svg>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-neutral-200">
              {cliStatus?.status === "unauthenticated"
                ? t("provider.cli.unauthenticated")
                : t("provider.cli.notInstalled")}
            </span>
            <InfoHint
              label=""
              text={
                cliStatus?.status === "unauthenticated"
                  ? t("provider.cli.unauthenticatedHint")
                  : t("provider.cli.notInstalledHint")
              }
            />
          </div>

          <div className="flex w-full items-center justify-between gap-2 rounded-xl bg-neutral-950 px-3 py-2 border border-white/[0.06] font-mono text-[11px] text-neutral-300">
            <span className="truncate select-all text-neutral-200">
              {cliStatus?.status === "unauthenticated"
                ? cliStatus?.loginCmd || "codex login"
                : cliStatus?.installCmd || "npm install -g @openai/codex"}
            </span>
            <button
              type="button"
              onClick={() => {
                const cmd =
                  cliStatus?.status === "unauthenticated"
                    ? cliStatus?.loginCmd || "codex login"
                    : cliStatus?.installCmd || "npm install -g @openai/codex";
                navigator.clipboard.writeText(cmd);
                setCliCopied(true);
                setTimeout(() => setCliCopied(false), 1500);
              }}
              className="shrink-0 rounded-lg bg-white/[0.08] px-2 py-1 text-[10px] text-neutral-200 hover:bg-white/[0.14] transition-colors"
            >
              {cliCopied ? (
                <span className="text-[#a7ffd4]">{t("common.copied")}</span>
              ) : cliStatus?.status === "unauthenticated" ? (
                t("provider.cli.copyLogin")
              ) : (
                t("provider.cli.copyInstall")
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            {cliStatus?.status === "unauthenticated" &&
              typeof window !== "undefined" &&
              Boolean(window.vooDesktop?.localCli) && (
                <button
                  type="button"
                  onClick={handleLaunchCliLogin}
                  className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition-transform hover:scale-105 active:scale-95"
                >
                  <span>{t("provider.cli.launchLogin")}</span>
                </button>
              )}

            <button
              type="button"
              onClick={handleRefreshCli}
              className="flex items-center gap-1.5 rounded-xl bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/[0.14] transition-colors"
            >
              <span>{t("provider.cli.refresh")}</span>
            </button>
          </div>
        </div>
      )}

      {!isConfigured && !isCli && (
        <div className="flex flex-col items-center justify-center gap-3 p-6 my-auto text-center">
          <img
            src={`${import.meta.env.BASE_URL}voo-mark-pink.svg`}
            alt="VOO"
            className="h-8 w-8 brightness-0 invert opacity-90"
            draggable={false}
          />
          <p className="text-[12px] font-semibold text-neutral-200">
            {t("agent.apiKeyMissing")}
          </p>
          <p className="text-xs leading-relaxed text-neutral-400 max-w-xs">
            {t("agent.apiKeyHintDetail")}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => onOpenSettings({ tab: "models" })}
                className="flex items-center rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition-transform hover:scale-105 active:scale-95"
              >
                <span>{t("agent.llm.openSettings")}</span>
              </button>
            )}
            {!user?.isLoggedIn && onSignIn && (
              <button
                type="button"
                onClick={onSignIn}
                className="flex items-center rounded-xl bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-white/[0.14]"
              >
                <span>{t("agent.welcome.signInCloud")}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {isConfigured && renderedItemsCount === 0 && (
        <div className="flex flex-1 flex-col justify-center gap-5 py-2">
          {/* Welcome text */}
          <div className="flex flex-col gap-2.5">
            <img
              src={`${import.meta.env.BASE_URL}voo-mark-pink.svg`}
              alt="VOO"
              className="h-8 w-8 brightness-0 invert opacity-90"
              draggable={false}
            />
            <h1 className="whitespace-pre-line break-words text-[15px] font-bold leading-snug tracking-tight text-white">
              {welcomeText}
            </h1>
          </div>

          {/* Quick action suggestions */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {activeMode.cards.map((item) => {
              const ItemIcon = item.Icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    const promptText = t(item.promptKey);
                    if (onSelectPrompt) {
                      onSelectPrompt(promptText);
                    } else {
                      handleSend(promptText);
                    }
                  }}
                  className="group flex items-center justify-between rounded-xl bg-neutral-900 px-3.5 py-3 text-left transition-all hover:bg-neutral-800 active:scale-[0.98]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ItemIcon
                      size={14}
                      className="text-neutral-400 group-hover:text-white transition-colors"
                    />
                    <span className="min-w-0 break-words text-xs font-medium text-neutral-200 group-hover:text-white">
                      {t(item.key)}
                    </span>
                  </div>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[11px] text-neutral-500 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-300"
                  >
                    →
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
