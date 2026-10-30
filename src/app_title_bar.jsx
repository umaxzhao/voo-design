import React, { useEffect, useRef, useState } from "react";
import CanvasTabBar from "./canvas/components/canvas_tab_bar.jsx";
import { Bolt, Download, FolderOpen, MoreHorizontal } from "lucide-react";
import { useDesignStore } from "./store/design_store.js";
import { useI18n } from "./canvas/use_i18n.js";
import CollabAvatars from "./canvas/components/collab_avatars.jsx";
import SettingsDrawer from "./canvas/components/settings_drawer.jsx";
import { WELCOME_NEW_EVENT } from "./canvas/components/welcome_dashboard/welcome_events.js";
import { moveEditorMenuFocus } from "./canvas/components/editor_menu_navigation.js";

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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    if (!moreOpen) return undefined;
    moreRef.current?.querySelector('[role="menuitem"]')?.focus();
    const handlePointerDown = (event) => {
      if (!moreRef.current?.contains(event.target)) setMoreOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setMoreOpen(false);
      moreRef.current?.querySelector('[aria-haspopup="menu"]')?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [moreOpen]);

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
        data-testid="editor-top-bar"
        className="app-title-bar flex h-[40px] shrink-0 items-center justify-between px-4 text-xs font-medium tracking-wide select-none border-b border-white/10"
        style={{
          ...(isMac ? { paddingLeft: MAC_TRAFFIC_LIGHT_INSET_PX } : {}),
          WebkitAppRegion: "drag",
          background: "linear-gradient(-90deg, rgb(0, 0, 0) 70.123%, rgb(178, 255, 214) 89.855%)",
        }}
      >
        <div className="app-title-brand-row flex h-full min-w-0 items-center gap-2 leading-none" style={{ WebkitAppRegion: "no-drag" }}>
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
            <div className="app-title-tabs flex min-w-0 flex-1 items-center pl-3">
              <CanvasTabBar />
            </div>
          )}
        </div>

        <div
          data-testid="editor-top-bar-actions"
          className="app-title-actions flex items-center gap-2 text-neutral-300 text-[11px]"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          {/* Presence and share live beside the file actions, only while a document is open. */}
          {welcomeOpen ? null : (
            <>
              <div className="app-title-desktop-collab contents">
                <CollabAvatars />
                <div className="h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
              </div>
            </>
          )}
          <button
            className="app-title-desktop-action cursor-pointer rounded-lg px-2.5 py-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200 font-medium"
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("voo:file-open"))}
            title={t("titlebar.openTitle")}
            aria-label={t("titlebar.openTitle")}
          >
            <FolderOpen className="app-title-action-icon" size={15} aria-hidden="true" />
            <span className="app-title-action-label">{t("titlebar.open")}</span>
          </button>
          {/* Documents autosave; the primary action exports a portable snapshot. */}
          <button
            className="app-title-desktop-action cursor-pointer rounded-lg bg-white px-3 py-1 font-medium text-black transition-opacity hover:opacity-90"
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(welcomeOpen ? WELCOME_NEW_EVENT : "voo:file-export-snapshot"))}
            title={welcomeOpen ? t("welcome.header.new") : t("titlebar.snapshotTitle")}
            aria-label={welcomeOpen ? t("welcome.header.new") : t("titlebar.snapshotTitle")}
          >
            <Download className="app-title-action-icon" size={15} aria-hidden="true" />
            <span className="app-title-action-label">{welcomeOpen ? t("welcome.header.new") : t("editor.export")}</span>
          </button>
          <div ref={moreRef} className="app-title-mobile-more relative hidden">
            <button
              type="button"
              aria-label={t("titlebar.more")}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-controls={moreOpen ? "titlebar-more-menu" : undefined}
              title={t("titlebar.more")}
              onClick={() => setMoreOpen((open) => !open)}
              className="flex size-10 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10"
            >
              <MoreHorizontal size={19} aria-hidden="true" />
            </button>
            {moreOpen ? (
              <div
                id="titlebar-more-menu"
                role="menu"
                onKeyDown={(event) => moveEditorMenuFocus(event, event.currentTarget)}
                aria-label={t("titlebar.more")}
                className="absolute right-0 top-full z-[100] mt-1.5 flex min-w-48 flex-col gap-1 rounded-xl border border-white/10 bg-neutral-900 p-1.5 text-left text-[12px] shadow-panel"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    window.dispatchEvent(new CustomEvent("voo:file-open"));
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-neutral-200 hover:bg-white/10"
                >
                  <FolderOpen size={16} aria-hidden="true" />
                  <span>{t("titlebar.open")}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    window.dispatchEvent(new CustomEvent(welcomeOpen ? WELCOME_NEW_EVENT : "voo:file-export-snapshot"));
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-neutral-200 hover:bg-white/10"
                >
                  <Download size={16} aria-hidden="true" />
                  <span>{welcomeOpen ? t("welcome.header.new") : t("editor.export")}</span>
                </button>
                {welcomeOpen ? null : (
                  <div role="none" className="border-t border-white/10 pt-1">
                    <CollabAvatars />
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={t("welcome.settings.open")}
            title={t(welcomeOpen ? "titlebar.settingsTitle" : "titlebar.prefsTitle")}
            onClick={() => setSettingsOpen(true)}
            // 28px hit area; -m-1 keeps the layout footprint at 20px.
            className="-m-1 flex size-7 cursor-pointer items-center justify-center text-white/55 transition-opacity hover:text-white"
            style={{ WebkitAppRegion: "no-drag" }}
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
