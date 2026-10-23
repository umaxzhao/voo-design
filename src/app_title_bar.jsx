import React, { useEffect, useState } from "react";
import CanvasTabBar from "./canvas/components/canvas_tab_bar.jsx";
import { Bolt } from "lucide-react";
import { useDesignStore } from "./store/design_store.js";
import { useI18n } from "./canvas/use_i18n.js";
import SettingsDrawer from "./canvas/components/settings_drawer.jsx";

/** Brand name shown in the title bar. A product name, not translatable copy. */
export const APP_DISPLAY_NAME = "VOO Design";

/** Space kept clear of the native macOS traffic lights (close/minimise/zoom). */
const MAC_TRAFFIC_LIGHT_INSET_PX = 96;

/** Canonical VOO brand hexagon logo with inscribed triangle & circle */
export function VooBrandLogo({ className = "size-5 text-black" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21 6.25V16.75L11.5 22L2 16.75V6.25L11.5 1L21 6.25ZM11.5 22L21 6.25H2L11.5 22ZM11.5 6.66016C14.2777 6.66016 16.5294 8.82703 16.5294 11.5C16.5294 14.173 14.2777 16.3398 11.5 16.3398C8.72233 16.3398 6.47059 14.173 6.47059 11.5C6.47059 8.82703 8.72233 6.66016 11.5 6.66016Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function AppTitleBar() {
  const isMac = window.electronAPI?.platform === "darwin";
  const welcomeOpen = useDesignStore((state) => state.welcomeOpen);
  const setWelcomeOpen = useDesignStore((state) => state.setWelcomeOpen);
  const { t } = useI18n();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");

  useEffect(() => {
    const handleOpenSettings = (e) => {
      if (e.detail?.tab) setSettingsTab(e.detail.tab);
      setSettingsOpen(true);
    };

    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
    };

    window.addEventListener("voo:open-settings", handleOpenSettings);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("voo:open-settings", handleOpenSettings);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      <header
        className="app-title-bar flex h-[40px] shrink-0 items-center justify-between px-4 text-xs font-medium tracking-wide select-none border-b border-white/10"
        style={{
          ...(isMac ? { paddingLeft: MAC_TRAFFIC_LIGHT_INSET_PX } : {}),
          WebkitAppRegion: "drag",
          background: "linear-gradient(-90deg, rgb(0, 0, 0) 70.123%, rgb(178, 255, 214) 89.855%)",
        }}
      >
        <div className="flex h-full items-center gap-2 leading-none" style={{ WebkitAppRegion: "no-drag" }}>
          <button
            type="button"
            onClick={() => setWelcomeOpen(!welcomeOpen)}
            className="flex h-7 items-center gap-1.5 font-medium text-black tracking-normal hover:opacity-80 transition-opacity cursor-pointer rounded-lg px-1.5"
            title={welcomeOpen ? t("titlebar.backToCanvas") : t("titlebar.home")}
          >
            <VooBrandLogo className="size-5 text-black" />
            <span className="text-[12px] font-medium text-black tracking-tight">{APP_DISPLAY_NAME}</span>
          </button>

          {(
            <div className="flex min-w-0 flex-1 items-center pl-3">
              <CanvasTabBar />
            </div>
          )}
        </div>

        <div
          className="flex items-center gap-2 text-neutral-300 text-[11px]"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("voo:file-open"))}
            className="cursor-pointer rounded-lg px-2.5 py-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200 font-medium"
            title={t("titlebar.openTitle")}
          >
            {t("titlebar.open")}
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("voo:file-save"))}
            className="cursor-pointer rounded-lg bg-white px-3 py-1 font-medium text-black transition-opacity hover:opacity-90"
            title={t("titlebar.saveTitle")}
          >
            {t("titlebar.save")}
          </button>
          <button
            type="button"
            aria-label={t("welcome.settings.open")}
            title={t(welcomeOpen ? "titlebar.settingsTitle" : "titlebar.prefsTitle")}
            onClick={() => setSettingsOpen(true)}
            className="flex size-5 cursor-pointer items-center justify-center text-white/55 transition-opacity hover:text-white"
          >
            <Bolt size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Settings Modal Drawer */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
      />
    </>
  );
}
