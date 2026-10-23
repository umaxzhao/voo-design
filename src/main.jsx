import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
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

// Keep the MCP link outside the agent UI and load the tool executor on demand.
if (typeof window !== "undefined" && typeof WebSocket !== "undefined" && !import.meta.env?.VITEST) {
  let enabled = true;
  try { enabled = localStorage.getItem("voo.mcpLink") !== "off"; } catch {}
  if (enabled) {
    void import("./canvas/mcp/canvas_mcp_link.js").then(({ startCanvasMcpLink }) => {
      const stop = startCanvasMcpLink({
        executeTool: async (name, args) => {
          const { executeCanvasTool } = await import("./canvas/agent/canvas_tools.js");
          return executeCanvasTool(name, args);
        },
      });
      window.addEventListener("pagehide", stop, { once: true });
      if (import.meta.hot) import.meta.hot.dispose(stop);
    });
  }
}
