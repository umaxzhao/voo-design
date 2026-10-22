import PropTypes from "prop-types";
import { useEffect, useMemo, useState } from "react";
import {
  PROVIDERS_ORDER_ZH,
  PROVIDERS_ORDER_EN,
  withDefaultProviderFirst,
} from "../../shared/providers.js";
import {
  getStoredCustomProviders,
  deleteStoredCustomProvider,
  saveStoredCustomProvider,
} from "../../shared/custom_providers.js";
import { IconAdd } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import { useProviderConfigs } from "../use_provider_state.js";
import { useAllProviderVerifications } from "./provider_verification_state.js";
import { ProviderLogo } from "./provider_icons.jsx";
import ProviderCard from "./provider_card.jsx";
import ProviderModelList from "./provider_model_list.jsx";
import CustomProviderForm from "./custom_provider_form.jsx";
import {
  ALL_PROVIDERS,
  DEFAULT_ESSENTIAL_PROVIDERS,
  USER_ADDED_PROVIDERS_KEY,
  getStoredUserAddedProviders,
} from "./provider_definitions.js";
import { getProviderStatusInfo } from "./provider_status_helpers.js";

export default function ProviderSettings({ activeProviderId = null }) {
  const { t, locale } = useI18n();
  const isEn = typeof locale === "string" && locale.startsWith("en");
  const orderList = isEn ? PROVIDERS_ORDER_EN : PROVIDERS_ORDER_ZH;

  const provider = useProviderConfigs();
  const verifications = useAllProviderVerifications();
  const [expandedAll, setExpandedAll] = useState(false);
  const [customFormMode, setCustomFormMode] = useState(null);
  const [userAddedIds, setUserAddedIds] = useState(getStoredUserAddedProviders);
  const [customProviders, setCustomProviders] = useState(
    getStoredCustomProviders,
  );

  useEffect(() => {
    const onCustomChange = () => {
      setCustomProviders(getStoredCustomProviders());
    };
    window.addEventListener("ciw-custom-providers-changed", onCustomChange);
    return () => {
      window.removeEventListener(
        "ciw-custom-providers-changed",
        onCustomChange,
      );
    };
  }, []);

  const allProvidersList = useMemo(() => {
    const sortedBuiltIns = [...ALL_PROVIDERS].sort((a, b) => {
      const idxA = orderList.indexOf(a.id);
      const idxB = orderList.indexOf(b.id);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
    return [
      ...sortedBuiltIns,
      ...customProviders.map((cp) => ({
        id: cp.id,
        label: cp.name || cp.label,
        defaultBaseUrl: cp.defaultBaseUrl,
        isCustom: true,
      })),
    ];
  }, [customProviders, orderList]);

  const configuredIds = Object.keys(provider.configs).filter((id) =>
    Boolean(provider.configs[id]?.configured || provider.configs[id]),
  );

  const combinedIds = Array.from(
    new Set([
      ...DEFAULT_ESSENTIAL_PROVIDERS,
      ...userAddedIds,
      ...configuredIds,
      ...(activeProviderId ? [activeProviderId] : []),
    ]),
  );

  const visibleProviders = withDefaultProviderFirst(
    allProvidersList.filter((p) => combinedIds.includes(p.id)),
  );

  const defaultInitialId =
    activeProviderId ||
    (visibleProviders.length > 0 ? visibleProviders[0].id : null);
  const [activeId, setActiveId] = useState(defaultInitialId);

  useEffect(() => {
    if (activeProviderId) {
      setActiveId(activeProviderId);
      setUserAddedIds((prev) => {
        if (prev.includes(activeProviderId)) return prev;
        const next = [...prev, activeProviderId];
        try {
          localStorage.setItem(USER_ADDED_PROVIDERS_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
  }, [activeProviderId]);

  const active =
    (activeId ? allProvidersList.find((p) => p.id === activeId) : null) ||
    visibleProviders[0] ||
    null;

  const handleSelectProvider = (providerId) => {
    setCustomFormMode(null);
    setActiveId(providerId);
    setUserAddedIds((prev) => {
      if (prev.includes(providerId)) return prev;
      const next = [...prev, providerId];
      try {
        localStorage.setItem(USER_ADDED_PROVIDERS_KEY, JSON.stringify(next));
      } catch {
        // storage ignored
      }
      return next;
    });
  };

  const handleStartAddCustom = () => {
    setCustomFormMode({ mode: "create" });
  };

  const handleEditCustom = (providerId) => {
    const found = customProviders.find((p) => p.id === providerId);
    if (found) {
      setCustomFormMode({ mode: "edit", provider: found });
    }
  };

  const handleSaveCustom = (providerData) => {
    const saved = saveStoredCustomProvider(providerData);
    setCustomFormMode(null);
    if (saved?.id) {
      handleSelectProvider(saved.id);
    }
  };

  const handleCancelCustom = () => {
    setCustomFormMode(null);
  };

  const handleDeleteCustom = (providerId) => {
    deleteStoredCustomProvider(providerId);
    if (customFormMode?.provider?.id === providerId) {
      setCustomFormMode(null);
    }
    setUserAddedIds((prev) => {
      const next = prev.filter((id) => id !== providerId);
      try {
        localStorage.setItem(USER_ADDED_PROVIDERS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    if (activeId === providerId) {
      const remaining = visibleProviders.filter((p) => p.id !== providerId);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const displayedProviders = expandedAll ? allProvidersList : visibleProviders;

  return (
    <div className="flex flex-col gap-3">
      {/* Header with Add Provider (+) */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-300">
          {t("settings.tabApiModel")}
        </span>
        <button
          type="button"
          data-testid="add-provider-btn"
          aria-expanded={expandedAll}
          onClick={() => setExpandedAll((prev) => !prev)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
            expandedAll
              ? "bg-white/[0.12] text-neutral-100"
              : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
          }`}
          title={t("settings.addProvider")}
          aria-label={t("settings.addProvider")}
        >
          <IconAdd size={13} strokeWidth={1.5} className="shrink-0" />
          <span>{t("settings.addProvider")}</span>
        </button>
      </div>

      <div
        role="tablist"
        aria-label={t("settings.tabApiModel")}
        className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full"
      >
        {displayedProviders.map((tab) => {
          const isSelected =
            customFormMode?.mode === "edit"
              ? tab.id === customFormMode.provider?.id
              : !customFormMode && tab.id === active?.id;
          const isConfigured = Boolean(
            provider.configs[tab.id]?.configured || provider.configs[tab.id],
          );
          const verification = verifications.get(tab.id);
          const { statusText, dotClass, statusClass, isError } =
            getProviderStatusInfo(t, {
              configured: isConfigured,
              verification,
            });

          const label = tab.labelKey ? t(tab.labelKey) : tab.label;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-testid={`provider-tile-${tab.id}`}
              onClick={() => handleSelectProvider(tab.id)}
              className={`group relative flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 w-full min-w-0 ${
                isSelected
                  ? "bg-white/[0.12] text-neutral-100 font-medium"
                  : isConfigured
                    ? "bg-white/[0.08] text-neutral-200 hover:bg-white/[0.12]"
                    : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200"
              }`}
            >
              <ProviderLogo providerId={tab.id} size={15} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[11px] font-medium text-neutral-200">
                  {label}
                </span>
                <span
                  className={`truncate text-[9px] ${statusClass}`}
                  title={isError ? statusText : undefined}
                >
                  {statusText}
                </span>
              </div>
              {isConfigured && (
                <span
                  aria-hidden="true"
                  className={`absolute top-2 right-2 size-1.5 rounded-full ${dotClass}`}
                />
              )}
            </button>
          );
        })}

        {/* Custom Provider Entry Tile */}
        <button
          type="button"
          role="tab"
          aria-selected={customFormMode?.mode === "create"}
          data-testid="add-custom-provider-tile"
          onClick={handleStartAddCustom}
          className={`group relative flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 w-full min-w-0 ${
            customFormMode?.mode === "create"
              ? "bg-white/[0.12] text-neutral-100 font-medium"
              : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200"
          }`}
        >
          <div className="flex size-5 shrink-0 items-center justify-center text-neutral-400 group-hover:text-neutral-200">
            <IconAdd size={13} strokeWidth={1.5} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[11px] font-medium text-neutral-300">
              {t("settings.addCustomProvider")}
            </span>
          </div>
        </button>
      </div>

      {/* When Custom Form Mode Active: Show Inline Creation/Edit Form */}
      {customFormMode ? (
        <CustomProviderForm
          key={customFormMode.provider?.id || "new-custom"}
          initialProvider={customFormMode.provider}
          onSave={handleSaveCustom}
          onCancel={handleCancelCustom}
        />
      ) : active ? (
        <>
          <ProviderCard
            key={active.id}
            flush
            providerId={active.id}
            label={active.labelKey ? t(active.labelKey) : active.label}
            description={
              active.descriptionKey ? t(active.descriptionKey) : undefined
            }
            defaultBaseUrl={active.defaultBaseUrl}
            isCustom={Boolean(active.isCustom)}
            onDeleteCustom={() => handleDeleteCustom(active.id)}
            onEditCustom={() => handleEditCustom(active.id)}
          />

          <ProviderModelList
            key={`${active.id}-models`}
            providerId={active.id}
            configured={Boolean(provider.configs[active.id])}
          />
        </>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl bg-white/[0.02]">
          <h3 className="text-xs font-medium text-neutral-300 mb-3">
            {t("settings.emptyProvidersTitle")}
          </h3>
          <button
            type="button"
            onClick={handleStartAddCustom}
            className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-xs font-medium text-black transition-transform hover:scale-105 active:scale-95"
          >
            <IconAdd size={13} strokeWidth={1.5} />
            <span>{t("settings.addCustomProvider")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

ProviderSettings.propTypes = {
  activeProviderId: PropTypes.string,
};
