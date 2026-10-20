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

async function bootstrap() {
  const locale = resolveInitialLocale({
    stored: storedLocale(),
    languages: navigator.languages,
    automated: navigator.webdriver,
  });
  // The dictionary must be in memory before the first render, otherwise t()
  // falls back to raw keys. Critical slice first, full table in the background.
  await loadCriticalLocale(locale);
  void loadLocale(locale);

  const rootElement = document.getElementById("root");
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
  loadLocale(locale).catch(() => {});
}

bootstrap();
