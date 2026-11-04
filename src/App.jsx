import React, { useEffect, useState, Suspense, lazy } from "react";
import ReleaseUI from "./release_ui.jsx";
const ImageEditor = lazy(() => import("./canvas/components/image_editor.jsx"));
import AppTitleBar, { VooBrandLogo } from "./app_title_bar.jsx";
const WelcomeDashboard = lazy(() => import("./canvas/components/welcome_dashboard.jsx"));
import PageSwitcher from "./canvas/components/page_switcher.jsx";
import ImageSizeNotice from "./canvas/components/image_size_notice.jsx";
import CrashRecoveryPrompt from "./canvas/components/crash_recovery_prompt.jsx";
import LoadingModal from "./canvas/components/loading_modal.jsx";
const CanvasAgentPanel = lazy(() => import("./canvas/components/canvas_agent_panel.jsx"));
const BrowserDrawer = lazy(() => import("./canvas/components/browser_drawer/browser_drawer.jsx"));
import OnboardingGuide from "./canvas/components/onboarding/OnboardingGuide.jsx";
import FirstRunOnboarding from "./canvas/components/first_run_onboarding.jsx";
import { shouldShowFirstRun } from "./canvas/components/first_run_state.js";
import { isEmbedPage, isHarnessPage } from "./shared/embed_mode.js";
import { useI18n } from "./canvas/use_i18n.js";
import { useDesignStore } from "./store/design_store.js";
import { closeActiveDocumentTab } from "./canvas/store/document_tab_close.js";
import {
  VOO_FILE_FORMAT,
  VOO_FILE_VERSION,
} from "../electron/voo_format.js";
import { exportFormatForMenuAction } from "./shared/editor_menu_actions.js";

const isEmbed = isEmbedPage();
// The harness panel keeps the product chrome (title bar + mint frame) and only
// wants the side effects of an embedded session.
const isHarnessPanel = isHarnessPage();

export default function App() {
  const activeDocumentId = useDesignStore(s => s.activeDocumentId);
  const welcomeOpen = useDesignStore((s) => s.welcomeOpen);
  const documentLoading = useDesignStore((s) => s.documentLoading);
  // The AI panel state is managed in design_store for hybrid agent coordination
  const agentOpen = useDesignStore((s) => s.agentPanelOpen);
  const setAgentOpen = useDesignStore((s) => s.setAgentPanelOpen);
  const browserDrawerOpen = useDesignStore((s) => s.browserDrawerOpen);
  const setBrowserDrawerOpen = useDesignStore((s) => s.setBrowserDrawerOpen);
  // Workspace/agent configuration remains available through voo:open-onboarding.
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [firstRunReopened, setFirstRunReopened] = useState(false);
  const [firstRunOpen, setFirstRunOpen] = useState(() => !isEmbed && shouldShowFirstRun());
  const { t } = useI18n();
  // Defer the heavy editor on the first welcome screen. Once opened, keep it
  // mounted behind the welcome overlay so history and pending edits survive.
  const [editorActivated, setEditorActivated] = useState(false);
  const needsEditor = Boolean(activeDocumentId) || !welcomeOpen;
  useEffect(() => {
    if (needsEditor) setEditorActivated(true);
  }, [needsEditor]);

  // When embedded in an IDE webview/iframe or the harness side panel, auto-open
  // an untitled project if none exists.
  useEffect(() => {
    if (isEmbed || isHarnessPanel) {
      const store = useDesignStore.getState();
      if (store.welcomeOpen && !store.activeDocumentId) {
        store.newVooProject({ label: "Untitled" });
      }
    }
  }, []);

  // When opened with a collaboration room in URL (e.g. ?r=xxxx or /r/xxxx),
  // open the workspace canvas and auto-join the peer-to-peer session
  useEffect(() => {
    const checkAndJoinRoom = async () => {
      const { roomIdFromLocation } = await import("./canvas/collab/room.js");
      const roomId = roomIdFromLocation();
      if (!roomId) return;

      const store = useDesignStore.getState();
      if (!store.activeDocumentId) {
        store.newVooProject({ label: "Shared Design" });
      }

      const { autoJoinFromLocation } = await import("./canvas/collab/use_collab.js");
      await autoJoinFromLocation();
    };
    void checkAndJoinRoom();
  }, []);

  // Listen for Electron native menu actions and Agent panel trigger events
  useEffect(() => {
    const handleOpenAgent = () => setAgentOpen(true);
    const handleToggleAgent = () => setAgentOpen(!useDesignStore.getState().agentPanelOpen);
    const handleOpenFirstRun = () => {
      if (firstRunOpen) return;
      setFirstRunReopened(true); setFirstRunOpen(true);
    };
    window.addEventListener("voo:open-first-run", handleOpenFirstRun);
    const handleOpenOnboarding = () => setOnboardingOpen(true);
    const handleOpenBrowser = () => setBrowserDrawerOpen(true);
    window.addEventListener("voo:open-agent-panel", handleOpenAgent);
    window.addEventListener("voo:toggle-agent-panel", handleToggleAgent);
    window.addEventListener("voo:agent-prompt", handleOpenAgent);
    window.addEventListener("voo:open-browser", handleOpenBrowser);
    window.addEventListener("voo:open-onboarding", handleOpenOnboarding);

    let unsubscribeMenu = null;
    if (window.electronAPI?.onMenuAction) {
      unsubscribeMenu = window.electronAPI.onMenuAction((action) => {
        switch (action) {
          case "help:first-run":
            handleOpenFirstRun();
            break;
          case "help:onboarding":
            window.dispatchEvent(new CustomEvent("voo:open-onboarding"));
            break;
          case "file:new":
            window.dispatchEvent(new CustomEvent("voo:file-new"));
            break;
          case "file:open":
            window.dispatchEvent(new CustomEvent("voo:file-open"));
            break;
          case "file:save":
            window.dispatchEvent(new CustomEvent("voo:file-save"));
            break;
          case "file:saveAs":
            window.dispatchEvent(new CustomEvent("voo:file-save-as"));
            break;
          case "file:closeTab":
            closeActiveDocumentTab(
              useDesignStore,
              () => window.confirm(t("editor.exit.confirmBody")),
            );
            break;
          case "edit:undo":
            window.__vooEditor?.undo?.();
            break;
          case "edit:redo":
            window.__vooEditor?.redo?.();
            break;
          case "view:fit":
            window.__vooEditor?.getViewport?.()?.zoomToFit?.();
            break;
          case "view:actualSize":
            window.__vooEditor?.getViewport?.()?.zoomToHundred?.();
            break;
          default: {
            // File > Export PNG/SVG/PSD opens the same export dialog as the
            // title-bar action, preselecting the requested format.
            const format = exportFormatForMenuAction(action);
            if (format) {
              window.dispatchEvent(
                new CustomEvent("voo:editor-export", { detail: { format } }),
              );
            }
            break;
          }
        }
      });
    }

    return () => {
      window.removeEventListener("voo:open-first-run", handleOpenFirstRun);
      window.removeEventListener("voo:open-agent-panel", handleOpenAgent);
      window.removeEventListener("voo:toggle-agent-panel", handleToggleAgent);
      window.removeEventListener("voo:agent-prompt", handleOpenAgent);
      window.removeEventListener("voo:open-onboarding", handleOpenOnboarding);
      window.removeEventListener("voo:open-browser", handleOpenBrowser);
      if (unsubscribeMenu) unsubscribeMenu();
    };
  }, [firstRunOpen]);

  return (
    <main
      data-embed={isEmbed ? "true" : undefined}
      className="app-root-frame relative flex h-full w-full select-none flex-col"
      // The window behind the workspace frame repeats the mint edge on BOTH
      // sides (4px page padding + the 2px frame border), so the frame reads the
      // same width left and right. The title bar keeps its own brand gradient.
      style={{
        background: isEmbed
          ? "#000"
          : "linear-gradient(90deg, #b2ffd6 0 4px, #000 4px calc(100% - 4px), #b2ffd6 calc(100% - 4px) 100%)",
      }}
    >
      {!isEmbed && <CrashRecoveryPrompt />}
      {!isEmbed && <ImageSizeNotice />}
      {!isEmbed && <AppTitleBar />}
      {!isEmbed && <ReleaseUI />}
      <div
        className="relative flex min-h-0 flex-1"
        data-testid="editor-workspace-layout"
        data-agent-open={agentOpen && !welcomeOpen && !browserDrawerOpen ? "true" : "false"}
        data-browser-open={browserDrawerOpen ? "true" : "false"}
      >
        {/* The rounded green frame wraps the workspace below the title bar. */}
        <div className="editor-shell relative min-h-0 min-w-0 flex-1" data-testid="editor-shell">
          <div className="editor-shell-inner flex flex-col">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {editorActivated || needsEditor ? (
                <Suspense fallback={
                  <div role="status" className="absolute inset-0 flex items-center justify-center">
                    <LoadingModal label={t("editor.loading")} showLabel={false} />
                  </div>
                }>
                  <ImageEditor
                    key={activeDocumentId}
                    visible={!welcomeOpen}
                    agentVisible={agentOpen && !welcomeOpen}
                  />
                </Suspense>
              ) : null}
              {welcomeOpen && (
                <div className="editor-welcome-overlay absolute inset-0 z-50 overflow-hidden rounded-3xl bg-[#0c0c0c]">
                  <Suspense fallback={null}>
                    <WelcomeDashboard />
                  </Suspense>
                </div>
              )}
            </div>
          </div>
        </div>
        <Suspense fallback={browserDrawerOpen ? <aside className="voo-browser-drawer" aria-hidden="true" /> : null}>
          <BrowserDrawer open={browserDrawerOpen} onClose={() => setBrowserDrawerOpen(false)} />
        </Suspense>
        {/* The assistant sits outside the green frame, beside it. It is for the
            editor only: the workbench (welcome) page does not show it. */}
        {agentOpen && !welcomeOpen && !browserDrawerOpen && (
          <aside className="flex w-[376px] shrink-0 flex-col py-3 pr-3">
            <Suspense fallback={null}>
              <CanvasAgentPanel onClose={() => setAgentOpen(false)} />
            </Suspense>
          </aside>
        )}
        {!welcomeOpen && !browserDrawerOpen && <PageSwitcher />}
        {!agentOpen && !welcomeOpen && !browserDrawerOpen && (
          <button
            type="button"
            onClick={() => setAgentOpen(true)}
            aria-label={t("agent.panel.open")}
            title={t("agent.panel.open")}
            className="voo-ai-fab absolute bottom-4 right-4 z-[60] flex size-11 items-center justify-center rounded-full bg-[#E5B2FF] text-black shadow-panel"
          >
            <span className="voo-ai-fab-icon flex items-center justify-center">
              <VooBrandLogo className="size-6 text-black" />
            </span>
          </button>
        )}
      </div>
      {/* Covers everything while a document opens, so partial frames never show. */}
      {documentLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <LoadingModal label={documentLoading} showLabel={false} />
        </div>
      ) : null}
      <FirstRunOnboarding
        open={firstRunOpen}
        reopened={firstRunReopened}
        onClose={() => setFirstRunOpen(false)}
        onStart={(template) => {
          const store = useDesignStore.getState();
          if (!template) store.newVooProject();
          else store.loadVooProject({
            vooData: { format: VOO_FILE_FORMAT, version: VOO_FILE_VERSION, kind: "design", document: template.createDoc(), assets: {} },
            fileName: `${template.title}.voo`,
          });
        }}
      />
      {/* Workspace configuration is opened explicitly from settings/events. */}
      <OnboardingGuide
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
    </main>
  );
}
