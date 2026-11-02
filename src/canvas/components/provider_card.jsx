import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { IconEdit, IconRefresh, IconTrash } from "../icons.jsx";
import { CANVAS_MODE } from "../environment.js";
import {
  clearProviderConfig,
  getProviderConfig,
  saveProviderConfig,
} from "../provider_client.js";
import { getEnvironment } from "../rpc.js";
import { useI18n } from "../use_i18n.js";
import InfoHint from "./info_hint.jsx";
import { ProviderLogo } from "./provider_icons.jsx";
import Toggle from "./toggle.jsx";
import { PROVIDER_ID } from "../../shared/providers.js";
import { useUserStore } from "../store/user_store.js";
import {
  getProviderVerification,
  invalidateProviderVerification,
  VERIFICATION_STATUS,
  verifyProviderConnection,
} from "./provider_verification_state.js";

const INITIAL_CONFIG = {
  configured: false,
  persistence: "session",
  maskedKey: "",
  baseUrl: "",
};

const inputClass =
  "w-full rounded-xl bg-[#191919] px-3 py-2.5 text-xs text-neutral-200 outline-none transition-colors placeholder:text-neutral-400 hover:bg-[#1d1d1d] focus:bg-[#202020] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/35";

/**
 * Asks for access to a gateway host the manifest could not know in advance.
 */
async function ensureHostAccess(baseUrl) {
  const permissions = globalThis.chrome?.permissions;
  if (!permissions) return;
  let origin;
  try {
    origin = `${new URL(baseUrl).origin}/*`;
  } catch {
    const error = new Error("providerInvalidBaseUrl");
    error.code = "providerInvalidBaseUrl";
    throw error;
  }
  if (await permissions.contains({ origins: [origin] })) return;
  if (await permissions.request({ origins: [origin] })) return;
  const error = new Error("providerHostDenied");
  error.code = "providerHostDenied";
  throw error;
}

/**
 * Credential form for one provider.
 */
export default function ProviderCard({
  providerId,
  label,
  description,
  defaultBaseUrl = undefined,
  isCustom = false,
  onDeleteCustom = undefined,
  onEditCustom = undefined,
  flush = false,
}) {
  const { t } = useI18n();
  const isDesktop = getEnvironment().mode === CANVAS_MODE.DESKTOP;
  const [config, setConfig] = useState(INITIAL_CONFIG);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl ?? "");
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState("loading");
  const [errorCode, setErrorCode] = useState(null);

  useEffect(() => {
    let active = true;
    getProviderConfig({ providerId })
      .then((result) => {
        if (!active) return;
        setConfig(result ?? INITIAL_CONFIG);
        setRemember(result.configured ? result.persistence === "local" : true);
        if (result.baseUrl) setBaseUrl(result.baseUrl);
        if (result.configured) {
          if (
            getProviderVerification(providerId).status ===
            VERIFICATION_STATUS.VERIFIED
          ) {
            setStatus("connected");
          } else {
            setStatus("testing");
            void verifyProviderConnection(providerId)
              .then((verification) => {
                if (active && verification.connected) setStatus("connected");
              })
              .catch((error) => {
                if (!active) return;
                setErrorCode(error.code ?? "providerRequestFailed");
                setStatus("error");
              });
          }
        } else {
          setStatus("idle");
        }
      })
      .catch((error) => {
        if (!active) return;
        setErrorCode(error.code ?? "providerStorageUnavailable");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [providerId]);

  const announce = () => {
    window.dispatchEvent(new Event("ciw-provider-config-changed"));
  };

  const save = async () => {
    setStatus("saving");
    setErrorCode(null);
    try {
      const trimmedBase = baseUrl.trim();
      if (defaultBaseUrl && trimmedBase && trimmedBase !== defaultBaseUrl) {
        await ensureHostAccess(trimmedBase);
      }
      const result = await saveProviderConfig({
        providerId,
        apiKey,
        remember,
        ...(defaultBaseUrl || isCustom || baseUrl ? { baseUrl } : {}),
      });
      invalidateProviderVerification(providerId);
      setConfig(result ?? INITIAL_CONFIG);
      setApiKey("");
      setStatus("saved");
      announce();
      if (result.configured) {
        await test();
      }
    } catch (error) {
      setErrorCode(error.code ?? "providerRequestFailed");
      setStatus("error");
    }
  };

  const test = async () => {
    setStatus("testing");
    setErrorCode(null);
    try {
      const verification = await verifyProviderConnection(providerId, {
        force: true,
      });
      if (verification.connected) setStatus("connected");
    } catch (error) {
      const code = error.code ?? "providerRequestFailed";
      setErrorCode(code);
      setStatus("error");
    }
  };

  const clear = async () => {
    setStatus("saving");
    setErrorCode(null);
    try {
      setConfig((await clearProviderConfig({ providerId })) ?? INITIAL_CONFIG);
      invalidateProviderVerification(providerId);
      setApiKey("");
      setBaseUrl(defaultBaseUrl ?? "");
      setRemember(false);
      setStatus("idle");
      announce();
    } catch (error) {
      setErrorCode(error.code ?? "providerStorageUnavailable");
      setStatus("error");
    }
  };

  const statusLabel = errorCode
    ? t(`error.${errorCode}`)
    : t(`provider.status.${status}`);
  const canSave = (apiKey.trim() || config.configured) && status !== "saving";
  const showBaseUrl =
    isCustom ||
    (defaultBaseUrl && getEnvironment().mode !== CANVAS_MODE.STANDALONE);
  const creditsAvailable = useUserStore((state) => state.creditsAvailable);
  const supportsCredits =
    Boolean(creditsAvailable) &&
    [PROVIDER_ID.AI_302, PROVIDER_ID.DEEPSEEK].includes(providerId);

  return (
    <section
      className={flush ? "flex flex-col" : "rounded-2xl bg-[#121212] p-4"}
    >
      <div className="flex items-center gap-2.5">
        <ProviderLogo providerId={providerId} size={20} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-neutral-100">
              {description ? (
                <InfoHint label={label} text={description} />
              ) : (
                label
              )}
            </h3>
            <span
              className={`text-[11px] leading-4 ${
                errorCode ? "text-rose-400" : "text-neutral-400"
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {config.configured ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#191919] px-3 py-2.5">
          <span className="shrink-0 text-[10px] text-neutral-500">
            {t("provider.apiKey")}
          </span>
          <code className="ml-auto min-w-0 flex-1 truncate text-right text-[10px] text-neutral-300">
            {config.maskedKey}
          </code>
        </div>
      ) : null}

      {supportsCredits ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
          <span className="text-[10px] text-neutral-500">
            {t("provider.route")}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#a7ffd4]">
              {config.authMode === "own-key"
                ? t("provider.routeOwnKey")
                : config.authMode === "credits"
                  ? t("provider.routeCredits")
                  : t("provider.routeSignIn")}
            </span>
            {config.authMode === "own-key" ? (
              <button
                type="button"
                onClick={clear}
                className="rounded-lg bg-white/[0.06] px-2 py-1 text-[9px] text-neutral-300 hover:bg-white/[0.12]"
              >
                {t("provider.useCredits")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">
          {config.configured ? t("provider.replaceKey") : t("provider.apiKey")}
        </span>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={t("provider.apiKeyHint")}
          aria-label={t("provider.apiKey")}
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
        />
      </label>

      {showBaseUrl ? (
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-neutral-400">
            {t("provider.baseUrl")}
          </span>
          <input
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={defaultBaseUrl || "https://api.openai.com/v1"}
            aria-label={t("provider.baseUrl")}
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          <span className="text-xs leading-5 text-neutral-400">
            {t("provider.baseUrlHint")}
          </span>
        </label>
      ) : null}

      <div className="mt-3">
        <Toggle
          checked={remember}
          onChange={setRemember}
          label={t(
            isDesktop ? "provider.rememberDesktop" : "provider.remember",
          )}
        />
        <p className="mt-1 text-xs leading-5 text-neutral-400">
          {t(
            remember
              ? isDesktop
                ? "provider.localWarningDesktop"
                : "provider.localWarning"
              : isDesktop
                ? "provider.sessionHintDesktop"
                : "provider.sessionHint",
          )}
        </p>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="flex-1 rounded-xl bg-white px-3 py-2.5 text-[10px] font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-[#242424] disabled:text-neutral-500"
        >
          {t("provider.saveKey")}
        </button>
        <button
          type="button"
          onClick={test}
          disabled={!config.configured || status === "testing"}
          aria-label={t("provider.test")}
          title={t("provider.test")}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1a1a1a] text-neutral-500 transition-colors hover:bg-[#242424] hover:text-white disabled:opacity-30"
        >
          <IconRefresh size={14} />
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!config.configured}
          aria-label={t("provider.remove")}
          title={t("provider.remove")}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1a1a1a] text-neutral-500 transition-colors hover:bg-[#242424] hover:text-rose-300 disabled:opacity-30"
        >
          <IconTrash className="text-neutral-400" size={14} />
        </button>
      </div>

      {isCustom && (onEditCustom || onDeleteCustom) && (
        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
          {onEditCustom ? (
            <button
              type="button"
              data-testid="edit-custom-provider-btn"
              onClick={onEditCustom}
              className="flex items-center gap-1 text-[10px] text-neutral-400 transition-colors hover:text-neutral-200"
            >
              <IconEdit size={11} strokeWidth={1.5} />
              <span>{t("settings.editCustomProvider")}</span>
            </button>
          ) : (
            <span />
          )}
          {onDeleteCustom && (
            <button
              type="button"
              data-testid="delete-custom-provider-btn"
              onClick={onDeleteCustom}
              className="flex items-center gap-1 text-[10px] text-rose-400/80 transition-colors hover:text-rose-300"
            >
              <IconTrash className="text-neutral-400" size={11} strokeWidth={1.5} />
              <span>{t("settings.deleteCustomProvider")}</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

ProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  description: PropTypes.string,
  defaultBaseUrl: PropTypes.string,
  isCustom: PropTypes.bool,
  onDeleteCustom: PropTypes.func,
  onEditCustom: PropTypes.func,
  flush: PropTypes.bool,
};
