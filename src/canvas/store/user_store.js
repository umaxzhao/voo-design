import { create } from "zustand";
import { getLocale } from "../../shared/i18n.js";
import {
  authToken,
  saveAuthToken,
  fetchCurrentUser,
  loginAccount,
  logoutAccount,
  registerAccount,
  updateAccountProfile,
  fetchCreditsBalance,
  fetchCreditsLedger,
  redeemCredits,
  fetchCreditsPricing,
  oauthProviders,
  startOAuth,
} from "../auth_client.js";
import {
  readBrowserCreditsAvailable,
  saveBrowserCreditsAvailable,
} from "../../shared/providers/provider_credentials.js";
import {
  guestUser,
  loadSavedUser,
  saveUser,
  clearSavedUser,
  serverUserToLocal,
} from "./user_account_storage.js";

const LIKES_STORAGE_KEY = "voo.user.likes";
const BOOKMARKS_STORAGE_KEY = "voo.user.bookmarks";

function loadSavedSet(key) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // Ignore
  }
  return new Set();
}

function saveSet(key, set) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify([...set]));
  } catch {
    // Ignore
  }
}

export const useUserStore = create((set, get, api) => {
  if (api) api.getInitialState = get;
  let latestCreditsRefresh = 0;
  return {
    user: loadSavedUser(),
    likes: loadSavedSet(LIKES_STORAGE_KEY),
    bookmarks: loadSavedSet(BOOKMARKS_STORAGE_KEY),
    isAuthModalOpen: false,
    authModalMode: "login", // "login" | "register" | "profile"
    authBusy: false,
    authError: "",
    oauthProvidersList: [],
    /**
     * Whether the server's provider list has answered: "idle" before the first
     * ask, "loading" while a fetch is in flight, "ready" once it came back —
     * an empty or failed list is still "ready" (the unavailable case), so the
     * sign-in form never sits between states.
     */
    oauthProvidersState: "idle",
    oauthBusyProvider: null,
    creditsAvailable: readBrowserCreditsAvailable() === true,
    creditsBalance: null,
    creditsLedger: [],
    creditsBusy: false,
    creditsError: "",
    creditsPricing: null,

    acceptCreditsBalance: (balance) => {
      if (
        typeof balance !== "number" ||
        !Number.isFinite(balance) ||
        balance < 0
      ) {
        return false;
      }
      set({ creditsBalance: balance });
      return true;
    },

    probeCreditsAvailability: async ({ force = false } = {}) => {
      const cached = readBrowserCreditsAvailable();
      if (!force && cached !== null) {
        set({ creditsAvailable: cached });
        return cached;
      }
      try {
        const pricing = await fetchCreditsPricing();
        const available = Boolean(pricing && Array.isArray(pricing.items));
        saveBrowserCreditsAvailable(available);
        set({ creditsAvailable: available });
        if (available) {
          set({ creditsPricing: pricing });
        }
        return available;
      } catch {
        saveBrowserCreditsAvailable(false);
        set({ creditsAvailable: false });
        return false;
      }
    },

    refreshCredits: async () => {
      const sessionToken = authToken();
      if (!sessionToken) return null;
      const refreshId = ++latestCreditsRefresh;
      set({ creditsBusy: true, creditsError: "" });
      const [balanceResult, ledgerResult] = await Promise.allSettled([
        fetchCreditsBalance(),
        fetchCreditsLedger({ limit: 10 }),
      ]);
      if (authToken() !== sessionToken || refreshId !== latestCreditsRefresh) {
        return null;
      }
      const balance =
        balanceResult.status === "fulfilled"
          ? balanceResult.value?.balance
          : null;
      const hasBalance =
        typeof balance === "number" && Number.isFinite(balance) && balance >= 0;
      const ledger =
        ledgerResult.status === "fulfilled" ? ledgerResult.value?.items : null;
      const hasLedger = Array.isArray(ledger);
      set({
        creditsBalance: hasBalance ? balance : get().creditsBalance,
        creditsLedger: hasLedger ? ledger : get().creditsLedger,
        creditsBusy: false,
        creditsError: !hasBalance
          ? "creditsBalanceLoadFailed"
          : hasLedger
            ? ""
            : "creditsLedgerLoadFailed",
      });
      return hasBalance ? balance : null;
    },

    redeemCreditCode: async (code) => {
      set({ creditsBusy: true, creditsError: "" });
      try {
        const result = await redeemCredits(code);
        get().acceptCreditsBalance(result?.balance);
        set({ creditsBusy: false });
        await get().refreshCredits();
        return result;
      } catch (error) {
        // The redeem API only has localized keys for these two; anything else
        // (network, rate limit, signed-out) is a generic failure to the user.
        const code = error?.code === "codeNotFound" || error?.code === "codeUsed"
          ? error.code
          : "redeemFailed";
        set({ creditsBusy: false, creditsError: code });
        throw error;
      }
    },

    loadCreditsPricing: async () => {
      const pricing = await fetchCreditsPricing();
      set({ creditsPricing: pricing });
      return pricing;
    },

    openAuthModal: (mode = "login") =>
      set({ isAuthModalOpen: true, authModalMode: mode, authError: "" }),
    closeAuthModal: () => set({ isAuthModalOpen: false, authError: "" }),

    bootstrapSession: async () => {
      const sessionToken = authToken();
      if (!sessionToken) return;
      try {
        const serverUser = await fetchCurrentUser();
        if (authToken() !== sessionToken) return;
        if (!serverUser) return;
        const local = serverUserToLocal(serverUser);
        saveUser(local);
        set({ user: local });
        const available = await get().probeCreditsAvailability();
        if (authToken() !== sessionToken) return;
        if (available) {
          await get().refreshCredits();
        }
      } catch {
        // Token may be expired or the network is offline; keep the cached profile.
      }
    },
    adoptDesktopSession: async ({ token, user }) => {
      if (typeof token !== "string" || typeof user !== "string") {
        throw new TypeError("Invalid desktop auth session");
      }
      const previousToken = authToken();
      if (!token) {
        saveAuthToken("");
        clearSavedUser();
        set({
          user: guestUser(),
          creditsBalance: null,
          creditsLedger: [],
          creditsBusy: false,
          creditsError: "",
        });
        return;
      }
      if (token !== previousToken) {
        saveAuthToken(token);
        set({
          creditsBalance: null,
          creditsLedger: [],
          creditsBusy: false,
          creditsError: "",
        });
      }
      let cachedUser;
      try {
        cachedUser = JSON.parse(user);
      } catch {
        cachedUser = null;
      }
      if (cachedUser?.isLoggedIn && typeof cachedUser.id === "string") {
        saveUser(cachedUser);
        set({ user: cachedUser });
      }
      if (token !== previousToken || !cachedUser?.isLoggedIn) {
        await get().bootstrapSession();
      }
    },
    login: async ({ email, password }) => {
      set({ authBusy: true, authError: "" });
      try {
        const serverUser = await loginAccount({ email, password });
        const local = serverUserToLocal(serverUser);
        saveUser(local);
        set({ user: local, isAuthModalOpen: false, authBusy: false });
        const available = await get().probeCreditsAvailability({ force: true });
        if (available) {
          void get().refreshCredits();
        }
        return local;
      } catch (error) {
        set({ authBusy: false, authError: error?.code || "requestFailed" });
        throw error;
      }
    },

    register: async ({ email, name, password, avatarSeed, avatarColor }) => {
      set({ authBusy: true, authError: "" });
      try {
        const serverUser = await registerAccount({
          email,
          name,
          password,
          avatarSeed,
          avatarColor,
          locale: getLocale(),
        });
        const local = serverUserToLocal(serverUser);
        saveUser(local);
        set({ user: local, isAuthModalOpen: false, authBusy: false });
        const available = await get().probeCreditsAvailability({ force: true });
        if (available) {
          void get().refreshCredits();
        }
        return local;
      } catch (error) {
        set({
          authBusy: false,
          authError: error?.code || "registrationFailed",
        });
        throw error;
      }
    },

    loadOAuthProviders: async () => {
      set({ oauthProvidersState: "loading" });
      try {
        const providers = await oauthProviders();
        set({ oauthProvidersList: providers, oauthProvidersState: "ready" });
        return providers;
      } catch {
        // oauthProviders() already resolves [] for every failure (404, network);
        // landing on "ready" with an empty list is the unavailable case.
        set({ oauthProvidersList: [], oauthProvidersState: "ready" });
        return [];
      }
    },

    loginWithOAuth: async (provider) => {
      set({ authBusy: true, oauthBusyProvider: provider, authError: "" });
      try {
        const serverUser = await startOAuth(provider);
        const local = serverUserToLocal(serverUser);
        saveUser(local);
        set({
          user: local,
          isAuthModalOpen: false,
          authBusy: false,
          oauthBusyProvider: null,
        });
        const available = await get().probeCreditsAvailability({ force: true });
        if (available) {
          void get().refreshCredits();
        }
        return local;
      } catch (error) {
        set({
          authBusy: false,
          oauthBusyProvider: null,
          authError: error?.code || "oauthFailed",
        });
        throw error;
      }
    },

    updateProfile: async ({ name, bio, avatarUrl: customAvatar }) => {
      const current = get().user;
      set({ authBusy: true, authError: "" });
      try {
        const serverUser = await updateAccountProfile({
          name,
          bio,
          avatarUrl: customAvatar || current.avatarUrl,
        });
        const local = serverUserToLocal(serverUser);
        saveUser(local);
        set({ user: local, authBusy: false, isAuthModalOpen: false });
        return local;
      } catch (error) {
        set({
          authBusy: false,
          authError: error?.code || "requestFailed",
        });
        throw error;
      }
    },

    logout: async () => {
      try {
        await logoutAccount();
      } catch {
        // Ignore network errors; local logout still happens.
      }
      saveBrowserCreditsAvailable(null);
      const resetUser = guestUser();
      clearSavedUser();
      set({
        user: resetUser,
        isAuthModalOpen: false,
        authError: "",
        creditsAvailable: false,
        creditsBalance: null,
        creditsLedger: [],
        creditsError: "",
        creditsPricing: null,
      });
    },

    toggleLike: (templateId) => {
      if (!get().user.isLoggedIn) {
        get().openAuthModal("login");
        return false;
      }
      const likes = new Set(get().likes);
      if (likes.has(templateId)) {
        likes.delete(templateId);
      } else {
        likes.add(templateId);
      }
      saveSet(LIKES_STORAGE_KEY, likes);
      set({ likes });
      return true;
    },

    toggleBookmark: (templateId) => {
      const bookmarks = new Set(get().bookmarks);
      if (bookmarks.has(templateId)) {
        bookmarks.delete(templateId);
      } else {
        bookmarks.add(templateId);
      }
      saveSet(BOOKMARKS_STORAGE_KEY, bookmarks);
      set({ bookmarks });
    },
  };
});

if (typeof window !== "undefined") {
  window.addEventListener("voo-credits-balance", (event) => {
    useUserStore.getState().acceptCreditsBalance(event.detail?.balance);
  });
}
