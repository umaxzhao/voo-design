import PropTypes from "prop-types";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import ProviderSettings from "./provider_settings.jsx";
import AgentSettings from "./agent_settings.jsx";
import SettingsGeneral from "./settings_general.jsx";
import SettingsShortcuts from "./settings_shortcuts.jsx";
import SettingsDesignSystems from "./settings_design_systems.jsx";
import { SETTINGS_TABS as TABS } from "./settings_tabs.js";
import { useLocalService } from "./agent-panel/use_local_service.js";
import { useModalFocus } from "./use_modal_focus.js";

export default function SettingsDrawer({
  open = false,
  onClose,
  initialTab = "general",
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState(
    TABS.some((tab) => tab.id === initialTab) ? initialTab : "general"
  );
  const dialogRef = useRef(null);
  const tabsId = useId();
  const service = useLocalService();
  useModalFocus({ open, dialogRef, onClose });

  // Sync initialTab when modal opens
  useEffect(() => {
    if (open && initialTab && TABS.some((tab) => tab.id === initialTab)) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  if (!open) return null;

  const activeTabDef = TABS.find((tab) => tab.id === activeTab);
  const tabLabel = (tab) => t(tab.labelKey);
  const activeLabel = tabLabel(activeTabDef);
  // The Local CLI wizard lives outside the drawer: close, then ask the app to open it.
  const openWizard = () => {
    onClose?.();
    window.dispatchEvent(new CustomEvent("voo:open-onboarding"));
  };
  const title = t("settings.drawerTitle");

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={title}
        data-testid="settings-drawer"
        className="flex h-[min(760px,90dvh)] w-full max-w-[1040px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950 text-neutral-200 shadow-panel"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
          <h1 className="text-xs uppercase tracking-[0.14em] text-neutral-400">
            {title}
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("settings.closeHint")}
            className="flex size-12 items-center justify-center rounded-lg bg-white/[0.04] text-neutral-400 outline-none hover:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          >
            <IconClose size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label={t("settings.categories")}
            className="grid shrink-0 grid-cols-2 gap-1 p-2 md:flex md:w-52 md:flex-col md:bg-neutral-900"
          >
            <div role="tablist" aria-label={t("settings.categories")} className="contents">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`${tabsId}-${tab.id}`}
                    aria-controls={`${tabsId}-panel`}
                    tabIndex={active ? 0 : -1}
                    aria-current={active ? "page" : undefined}
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(event) => {
                      const direction = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
                      if (!direction && event.key !== "Home" && event.key !== "End") return;
                      event.preventDefault();
                      const index = TABS.findIndex((candidate) => candidate.id === tab.id);
                      const next = event.key === "Home" ? TABS[0] : event.key === "End" ? TABS.at(-1) : TABS[(index + direction + TABS.length) % TABS.length];
                      setActiveTab(next.id);
                      document.getElementById(`${tabsId}-${next.id}`)?.focus();
                    }}
                    className={`flex h-10 min-w-0 items-center justify-start gap-2 rounded-lg px-3 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${active ? "bg-white/[0.08] text-neutral-100" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"}`}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span>{tabLabel(tab)}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <main
            key={activeTab}
            role="tabpanel"
            id={`${tabsId}-panel`}
            aria-labelledby={`${tabsId}-${activeTab}`}
            className="ui-scroll min-h-0 min-w-0 flex-1 overflow-y-auto p-4"
          >
            <div className="flex flex-col gap-4">
              <h2 className="text-xs font-medium text-neutral-200">{activeLabel}</h2>
              {activeTab === "providers" && (service.native || service.available) && (
                <button
                  type="button"
                  onClick={openWizard}
                  className="self-start rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-neutral-200 hover:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
                >
                  {t("titlebar.cliWizard")}
                </button>
              )}
              {activeTab === "providers" && <ProviderSettings />}
              {activeTab === "assistant" && (
                <AgentSettings
                  onOpenProviders={() => setActiveTab("providers")}
                  onOpenWizard={openWizard}
                />
              )}
              {activeTab === "general" && <SettingsGeneral />}
              {activeTab === "design-systems" && <SettingsDesignSystems />}
              {activeTab === "shortcuts" && <SettingsShortcuts asSection={false} />}
            </div>
          </main>
        </div>
      </div>
    </div>,
    document.body
  );
}

SettingsDrawer.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  initialTab: PropTypes.string,
};
