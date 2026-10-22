import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import {
  loadCriticalLocale,
  loadLocale,
  resolveInitialLocale,
} from "./shared/i18n.js";

function storedLocale() {
  try {
    return localStorage.getItem("ciw.locale");
  } catch {
    return null;
  }
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("[VOO] Uncaught rendering exception:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          width: "100%",
          backgroundColor: "#121212",
          color: "#f0f0f0",
          fontFamily: "sans-serif",
          padding: "24px",
          textAlign: "center",
        }}>
          <h2 style={{ fontSize: "20px", marginBottom: "12px", color: "#ff6b6b" }}>
            应用程序遇到意外错误
          </h2>
          <p style={{ fontSize: "14px", color: "#aaa", maxWidth: "480px", marginBottom: "20px" }}>
            {this.state.error?.message || "Unknown error occurred"}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              backgroundColor: "#2563eb",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            重新加载应用
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

async function bootstrap() {
  let locale = "en";
  try {
    locale = resolveInitialLocale({
      stored: storedLocale(),
      languages: navigator.languages,
      automated: navigator.webdriver,
    });
    // The dictionary must be in memory before the first render, otherwise t()
    // falls back to raw keys. Critical slice first, full table in the background.
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
