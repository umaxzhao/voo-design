/** Inline VOO Cloud sign-in shown when the first API card is selected. */

import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useUserStore } from "../../store/user_store.js";
import { useI18n } from "../../use_i18n.js";

export default function VooCloudLoginInline({ onSignedIn = null }) {
  const { t } = useI18n();
  const user = useUserStore((state) => state.user);
  const login = useUserStore((state) => state.login);
  const register = useUserStore((state) => state.register);
  const loadOAuthProviders = useUserStore((state) => state.loadOAuthProviders);
  const oauthProvidersState = useUserStore((state) => state.oauthProvidersState);
  const oauthProvidersList = useUserStore((state) => state.oauthProvidersList);
  const loginWithOAuth = useUserStore((state) => state.loginWithOAuth);
  const authBusy = useUserStore((state) => state.authBusy);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef(null);
  const isLoggedIn = Boolean(user?.isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn && oauthProvidersState === "idle") {
      void loadOAuthProviders();
    }
  }, [isLoggedIn, loadOAuthProviders, oauthProvidersState]);

  useEffect(() => {
    formRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isLoggedIn) onSignedIn?.();
  }, [isLoggedIn, onSignedIn]);

  if (isLoggedIn) {
    return (
      <div
        data-testid="onboarding-voo-cloud-signed-in"
        className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#a7ffd4]">
            {t("user.cloudAccount")}
          </p>
          <p className="truncate text-[11px] text-neutral-200">
            {user?.name || user?.email}
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-mono text-neutral-400">
          {t("firstRun.vooCloud.ready")}
        </span>
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (mode === "register") await register({ email, name, password });
      else await login({ email, password });
      setPassword("");
    } catch (nextError) {
      setError(nextError?.code || "requestFailed");
    }
  };

  return (
    <form
      ref={formRef}
      data-testid="onboarding-voo-cloud-login"
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-neutral-200">
          {t("firstRun.vooCloud.title")}
        </p>
        <span className="text-[10px] text-neutral-400">
          {t("firstRun.vooCloud.hint")}
        </span>
      </div>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t("user.emailPlaceholder")}
        aria-label={t("user.emailLabel")}
        autoComplete="email"
        required
        className="h-8 w-full rounded-xl bg-neutral-800 px-2.5 text-[11px] text-neutral-100 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      />
      {mode === "register" ? (
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("user.nicknameLabel")}
          aria-label={t("user.nicknameLabel")}
          autoComplete="name"
          className="h-8 w-full rounded-xl bg-neutral-800 px-2.5 text-[11px] text-neutral-100 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        />
      ) : null}
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={t("user.passwordPlaceholder")}
        aria-label={t("user.passwordLabel")}
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        required
        className="h-8 w-full rounded-xl bg-neutral-800 px-2.5 text-[11px] text-neutral-100 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      />
      {error ? <p className="text-[10px] text-rose-400">{t(`user.${error}`)}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={authBusy}
          className="h-8 flex-1 rounded-xl bg-white text-[11px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {mode === "register" ? t("user.createAccount") : t("user.signIn")}
        </button>
        <button
          type="button"
          onClick={() => setMode((value) => (value === "login" ? "register" : "login"))}
          className="h-8 rounded-xl px-2.5 text-[10px] text-neutral-400 transition-colors hover:text-neutral-200"
        >
          {mode === "register" ? t("user.signIn") : t("user.createAccount")}
        </button>
      </div>
      {oauthProvidersList?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {oauthProvidersList.map((provider) => (
            <button
              key={provider.id ?? provider.name}
              type="button"
              disabled={authBusy}
              onClick={() => void loginWithOAuth(provider.id ?? provider.name)}
              className="h-7 rounded-lg bg-white/[0.06] px-2.5 text-[10px] text-neutral-200 transition-colors hover:bg-white/[0.12] disabled:opacity-40"
            >
              {provider.label ?? provider.name}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}

VooCloudLoginInline.propTypes = {
  onSignedIn: PropTypes.func,
};
