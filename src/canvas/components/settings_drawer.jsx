import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Keyboard as IconKeyboard } from "lucide-react";
import { IconClose, IconSliders, IconSparkles } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import ProviderSettings from "./provider_settings.jsx";
import AgentSettings from "./agent_settings.jsx";
import SettingsGeneral from "./settings_general.jsx";
import SettingsShortcuts from "./settings_shortcuts.jsx";

const TABS = [
  {
    id: "general",
    labelZh: "常规偏好",
    labelEn: "General",
    icon: IconSliders,
  },
  {
    id: "assistant",
    labelZh: "AI 助手",
    labelEn: "AI Assistant",
    icon: IconSparkles,
  },
  {
    id: "providers",
    labelZh: "AI 供应商",
    labelEn: "AI Providers",
    icon: IconSparkles,
  },
  {
    id: "shortcuts",
    labelZh: "快捷键速查",
    labelEn: "Shortcuts",
    icon: IconKeyboard,
  },
];

export default function SettingsDrawer({
  open = false,
  onClose,
  initialTab = "general",
}) {
  const { t, locale } = useI18n();
  const isZh = locale === "zh";
  const [activeTab, setActiveTab] = useState(
    TABS.some((tab) => tab.id === initialTab) ? initialTab : "general"
  );
  const dialogRef = useRef(null);

  // Sync initialTab when modal opens
  useEffect(() => {
    if (open && initialTab && TABS.some((tab) => tab.id === initialTab)) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // Handle ESC key and focus trapping
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const activeTabDef = TABS.find((tab) => tab.id === activeTab);
  const activeLabel = isZh ? activeTabDef.labelZh : activeTabDef.labelEn;
  const title = isZh ? "设置与偏好" : "Settings & Preferences";

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
            aria-label={isZh ? "关闭" : "Close"}
            title={isZh ? "关闭 (Esc)" : "Close (Esc)"}
            className="flex size-12 items-center justify-center rounded-lg bg-white/[0.04] text-neutral-400 outline-none hover:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          >
            <IconClose size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label={isZh ? "设置分类" : "Settings Categories"}
            className="grid shrink-0 grid-cols-2 gap-1 p-3 md:flex md:w-52 md:flex-col md:gap-2 md:bg-neutral-900"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-current={active ? "page" : undefined}
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-2 rounded-xl px-2 py-3 text-[10px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 md:flex-row md:justify-start md:px-3 md:text-[11px] ${active ? "bg-white/[0.08] text-neutral-100" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"}`}
                >
                  <Icon size={15} className="shrink-0" />
                  <span>{isZh ? tab.labelZh : tab.labelEn}</span>
                </button>
              );
            })}
          </nav>

          <main
            key={activeTab}
            className="ui-scroll min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"
          >
            <div className="flex flex-col gap-5">
              <h2 className="text-xs text-neutral-200">{activeLabel}</h2>
              {(activeTab === "assistant" || activeTab === "providers") && (
                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    window.dispatchEvent(new CustomEvent("voo:open-onboarding"));
                  }}
                  className="self-start rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-neutral-200 hover:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
                >
                  {t("titlebar.cliWizard")}
                </button>
              )}
              {activeTab === "providers" && <ProviderSettings />}
              {activeTab === "assistant" && <AgentSettings />}
              {activeTab === "general" && <SettingsGeneral />}
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
