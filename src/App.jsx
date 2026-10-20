import React, { useEffect } from "react";
import ImageEditor from "./canvas/components/image_editor.jsx";
import AppTitleBar from "./app_title_bar.jsx";
import WelcomeDashboard from "./canvas/components/welcome_dashboard.jsx";
import { useDesignStore } from "./store/design_store.js";

export default function App() {
  const welcomeOpen = useDesignStore((s) => s.welcomeOpen);

  // Listen for Electron native menu actions
  useEffect(() => {
    if (window.electronAPI?.onMenuAction) {
      const unsubscribe = window.electronAPI.onMenuAction((action) => {
        const store = useDesignStore.getState();
        switch (action) {
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
      return unsubscribe;
    }
  }, []);

  return (
    <main className="editor-shell relative flex h-full w-full select-none flex-col overflow-hidden bg-black">
      <AppTitleBar />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ImageEditor visible={true} agentVisible={false} />
        {welcomeOpen && (
          <div className="absolute inset-0 z-50 bg-[#0c0c0c]">
            <WelcomeDashboard />
          </div>
        )}
      </div>
    </main>
  );
}
