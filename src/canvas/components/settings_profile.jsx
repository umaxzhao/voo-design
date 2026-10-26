import { useEffect, useState } from "react";
import { useI18n } from "../use_i18n.js";
import { useUserStore } from "../store/user_store.js";
import { avatarUrl, loadIdentity, saveIdentity } from "../collab/identity.js";
import { initialsFor } from "../collab/presence.js";
import SettingsSection, { SETTINGS_INPUT_CLASS, SettingsField } from "./settings_section.jsx";

/** Display name, avatar and (for guests) the editable nickname. */
export default function ProfileSection() {
  const { t } = useI18n();
  const user = useUserStore((s) => s.user);
  const login = useUserStore((s) => s.login);
  const register = useUserStore((s) => s.register);
  const loginWithOAuth = useUserStore((s) => s.loginWithOAuth);
  const logout = useUserStore((s) => s.logout);
  const loadOAuthProviders = useUserStore((s) => s.loadOAuthProviders);
  const oauthProvidersList = useUserStore((s) => s.oauthProvidersList);
  const oauthProvidersState = useUserStore((s) => s.oauthProvidersState);
  const authBusy = useUserStore((s) => s.authBusy);
  const oauthBusyProvider = useUserStore((s) => s.oauthBusyProvider);
  const authError = useUserStore((s) => s.authError);
  const isLoggedIn = Boolean(user?.isLoggedIn);
  const [identity, setIdentity] = useState(loadIdentity);
  const [broken, setBroken] = useState(false);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!isLoggedIn && oauthProvidersState === "idle") {
      void loadOAuthProviders();
    }
  }, [isLoggedIn, loadOAuthProviders, oauthProvidersState]);

  const updateGuestIdentity = (patch) => {
    setIdentity((curr) => {
      const next = { ...curr, ...patch };
      saveIdentity(next);
      return next;
    });
  };

  const displayName = isLoggedIn
    ? user?.name || user?.email || t("collab.anonymous")
    : identity.name || t("collab.anonymous");

  const currentAvatar = identity.avatarSeed ? avatarUrl(identity.avatarSeed) : null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    try {
      if (mode === "register") {
        await register({ email, name, password });
      } else {
        await login({ email, password });
      }
      setPassword("");
    } catch (error) {
      setSubmitError(error?.code || "requestFailed");
    }
  };

  const handleOAuth = async (provider) => {
    setSubmitError("");
    try {
      await loginWithOAuth(provider);
    } catch (error) {
      setSubmitError(error?.code || "oauthFailed");
    }
  };

  return (
    <SettingsSection
      testId="settings-profile-section"
      title={t("settings.profile")}
      hint={t("settings.profileHint")}
    >
      <div className="flex items-center gap-3">
        <div
          data-testid="profile-avatar"
          className="relative flex h-10 w-10 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-xs font-medium text-neutral-100"
        >
          {initialsFor(displayName)}
          {currentAvatar && !broken ? (
            <img
              src={currentAvatar}
              alt=""
              draggable={false}
              onError={() => setBroken(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-medium text-neutral-200">{displayName}</span>
          <span className="text-xs text-neutral-400">
            {isLoggedIn ? user?.email : t("collab.guestBadge")}
          </span>
        </div>
      </div>

      {!isLoggedIn && (
        <>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              {["google", "github"].map((provider) => {
                const isAvailable = oauthProvidersList.includes(provider);
                return (
                  <button
                    key={provider}
                    type="button"
                    disabled={
                      authBusy ||
                      oauthProvidersState === "loading" ||
                      (oauthProvidersState === "ready" && !isAvailable)
                    }
                    onClick={() => handleOAuth(provider)}
                    className="flex min-h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs text-neutral-200 outline-none hover:bg-white/[0.1] disabled:cursor-wait disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
                  >
                    <span aria-hidden="true" className="font-semibold uppercase">
                      {provider === "google" ? "G" : "GH"}
                    </span>
                    <span>
                      {oauthBusyProvider === provider
                        ? t("user.oauthLoading")
                        : t(
                            provider === "google"
                              ? "user.continueWithGoogle"
                              : "user.continueWithGitHub",
                          )}
                    </span>
                    {!isAvailable && oauthProvidersState === "ready" ? (
                      <span className="sr-only">{t("user.oauthUnavailable")}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {oauthProvidersState === "ready" &&
            oauthProvidersList.length === 0 ? (
              <p className="text-xs text-neutral-500">{t("user.oauthSetupRequired")}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span className="h-px flex-1 bg-white/10" />
            <span>{t("user.oauthOr")}</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
            {mode === "register" ? (
              <SettingsField label={t("user.nicknameLabel")}>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={SETTINGS_INPUT_CLASS}
                  autoComplete="nickname"
                />
              </SettingsField>
            ) : null}
            <SettingsField label={t("user.emailLabel")}>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("user.emailPlaceholder")}
                className={SETTINGS_INPUT_CLASS}
                autoComplete="email"
              />
            </SettingsField>
            <SettingsField label={t("user.passwordLabel")}>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("user.passwordPlaceholder")}
                className={SETTINGS_INPUT_CLASS}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
              />
            </SettingsField>
            {(submitError || authError) ? (
              <p role="alert" className="text-xs text-rose-400">
                {t(`user.error.${submitError || authError}`)}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={authBusy}
              className="min-h-9 rounded-xl bg-[#a7ffd4] px-3 text-xs font-medium text-neutral-500 hover:bg-[#a7ffd4] disabled:opacity-50"
            >
              {authBusy && !oauthBusyProvider
                ? t("user.authSubmitting")
                : t(mode === "register" ? "user.createAccount" : "user.signIn")}
            </button>
          </form>

          <div className="flex items-center justify-center gap-1 text-xs text-neutral-400">
            <span>
              {t(
                mode === "register"
                  ? "user.haveAccountPrefix"
                  : "user.noAccountPrefix",
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setSubmitError("");
                setMode(mode === "register" ? "login" : "register");
              }}
              className="text-[#a7ffd4] hover:underline"
            >
              {t(
                mode === "register" ? "user.signIn" : "user.createAccount",
              )}
            </button>
          </div>

          <SettingsField label={t("collab.nameField")}>
            <input
              type="text"
              value={identity.name || ""}
              onChange={(e) => updateGuestIdentity({ name: e.target.value })}
              placeholder={t("collab.namePlaceholder")}
              className={SETTINGS_INPUT_CLASS}
            />
          </SettingsField>
        </>
      )}

      {isLoggedIn ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-neutral-400">{t("user.cloudAccount")}</span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/[0.06]"
          >
            {t("user.signOut")}
          </button>
        </div>
      ) : null}
    </SettingsSection>
  );
}
