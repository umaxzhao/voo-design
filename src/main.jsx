import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./theme-light.css";
import { applyEditorTheme, currentEditorTheme } from "./canvas/use_editor_theme.js";
import {
  loadCriticalLocale,
  loadLocale,
  resolveInitialLocale,
} from "./shared/i18n.js";
import { AppErrorBoundary } from "./shared/app_error_boundary.jsx";
import { installGlobalErrorHandlers } from "./shared/error_collector.js";

function storedLocale() {
  try {
    return localStorage.getItem("ciw.locale");
  } catch {
    return null;
  }
}

async function bootstrap() {
  // Apply the stored chrome theme before the first paint (no light/dark flash).
  applyEditorTheme(currentEditorTheme());
  installGlobalErrorHandlers();

  let locale = "en";
  try {
    locale = resolveInitialLocale({
      stored: storedLocale(),
      languages: navigator.languages,
      automated: navigator.webdriver,
    });
    await loadCriticalLocale(locale).catch(() => {});
  } catch (err) {
    console.warn("[bootstrap] Locale initialization fallback:", err);
  }
  void loadLocale(locale).catch(() => {});

  const rootElement = document.getElementById("root");
  if (rootElement) {
    try {
      ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </React.StrictMode>
      );
    } catch (err) {
      console.error("[bootstrap] Root render exception:", err);
    }
  }
  loadLocale(locale).catch(() => {});
}

bootstrap();

// Keep the MCP link outside the agent UI; a plain browser only links after opt-in.
if (typeof window !== "undefined" && typeof WebSocket !== "undefined" && !import.meta.env?.VITEST) {
  void import("./canvas/mcp/mcp_link_boot.js").then(({ bootCanvasMcpLink }) => bootCanvasMcpLink());
}
