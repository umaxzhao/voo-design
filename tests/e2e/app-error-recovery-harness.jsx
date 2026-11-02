import React from "react";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "../../src/shared/app_error_boundary.jsx";
import { loadLocale } from "../../src/shared/i18n.js";
import "../../src/index.css";
import "../../src/theme-light.css";

function BrokenEditor() {
  throw new Error(`Recovery fixture: ${"long-diagnostic/".repeat(80)}`);
}

/** Exercise React's real catch path without crashing or editing a user document. */
await loadLocale(new URLSearchParams(location.search).get("locale") || "zh");
createRoot(document.getElementById("root")).render(
  <AppErrorBoundary><BrokenEditor /></AppErrorBoundary>,
);
