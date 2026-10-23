import React, { useEffect, useState, Suspense, lazy } from "react";
import ReleaseUI from "./release_ui.jsx";
import ImageEditor from "./canvas/components/image_editor.jsx";
import AppTitleBar, { VooBrandLogo } from "./app_title_bar.jsx";
const WelcomeDashboard = lazy(() => import("./canvas/components/welcome_dashboard.jsx"));
import PageSwitcher from "./canvas/components/page_switcher.jsx";
import ImageSizeNotice from "./canvas/components/image_size_notice.jsx";
import CrashRecoveryPrompt from "./canvas/components/crash_recovery_prompt.jsx";
import LoadingModal from "./canvas/components/loading_modal.jsx";
const CanvasAgentPanel = lazy(() => import("./canvas/components/canvas_agent_panel.jsx"));
import OnboardingGuide from "./canvas/components/onboarding/OnboardingGuide.jsx";
import { shouldShowOnboarding } from "./canvas/components/onboarding/onboarding_state.js";
import { useI18n } from "./canvas/use_i18n.js";
import { useDesignStore } from "./store/design_store.js";

export default function App() {
  const welcomeOpen = useDesignStore((s) => s.welcomeOpen);
  const documentLoading = useDesignStore((s) => s.documentLoading);
  // The AI panel state is managed in design_store for hybrid agent coordination
  const agentOpen = useDesignStore((s) => s.agentPanelOpen);
  const setAgentOpen = useDesignStore((s) => s.setAgentPanelOpen);
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try {
      return shouldShowOnboarding();
    } catch {
      return false;
    }
  });
  const { t } = useI18n();

  // Listen for Electron native menu actions and Agent panel trigger events
  useEffect(() => {
    const handleOpenAgent = () => setAgentOpen(true);
    const handleOpenOnboarding = () => setOnboardingOpen(true);
    window.addEventListener("voo:open-agent-panel", handleOpenAgent);
    window.addEventListener("voo:agent-prompt", handleOpenAgent);
    window.addEventListener("voo:open-onboarding", handleOpenOnboarding);

    let unsubscribeMenu = null;
    if (window.electronAPI?.onMenuAction) {
      unsubscribeMenu = window.electronAPI.onMenuAction((action) => {
        switch (action) {
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
          default:
            break;
        }
      });
    }

    return () => {
      window.removeEventListener("voo:open-agent-panel", handleOpenAgent);
      window.removeEventListener("voo:agent-prompt", handleOpenAgent);
      window.removeEventListener("voo:open-onboarding", handleOpenOnboarding);
      if (unsubscribeMenu) unsubscribeMenu();
    };
  }, []);

  return (
    <main
      className="relative flex h-full w-full select-none flex-col"
      style={{
        background: "linear-gradient(-90deg, rgb(0, 0, 0) 70.123%, rgb(178, 255, 214) 89.855%)",
      }}
    >
      <CrashRecoveryPrompt />
      <ImageSizeNotice />
      <AppTitleBar />
      <ReleaseUI />
      <div className="relative flex min-h-0 flex-1">
        {/* The rounded green frame wraps the workspace below the title bar. */}
        <div className="editor-shell relative min-h-0 min-w-0 flex-1">
          <div className="editor-shell-inner flex flex-col">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <ImageEditor visible={true} agentVisible={false} />
              {welcomeOpen && (
                <div className="absolute inset-0 z-50 overflow-hidden rounded-3xl bg-[#0c0c0c]">
                  <Suspense fallback={null}>
                    <WelcomeDashboard />
                  </Suspense>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* The assistant sits outside the green frame, beside it. It is for the
            editor only: the workbench (welcome) page does not show it. */}
        {agentOpen && !welcomeOpen && (
          <aside className="flex w-[376px] shrink-0 flex-col py-3 pr-3">
            <Suspense fallback={null}>
              <CanvasAgentPanel onClose={() => setAgentOpen(false)} />
            </Suspense>
          </aside>
        )}
        {!welcomeOpen && <PageSwitcher />}
        {!agentOpen && !welcomeOpen && (
          <button
            type="button"
            onClick={() => setAgentOpen(true)}
            aria-label={t("agent.panel.open")}
            title={t("agent.panel.open")}
            className="voo-ai-fab absolute bottom-4 right-4 z-[60] flex size-11 items-center justify-center rounded-full text-black shadow-panel"
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
          <LoadingModal label={documentLoading} />
        </div>
      ) : null}
      {/* First-launch Onboarding Configuration Guide Modal */}
      <OnboardingGuide
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
    </main>
  );
}
