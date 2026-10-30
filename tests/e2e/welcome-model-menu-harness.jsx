import React from "react";
import { createRoot } from "react-dom/client";
import WelcomeModelSelect from "../../src/canvas/components/welcome_dashboard/welcome_model_select.jsx";

/** Resolve React through Vite like the app, regardless of its cache directory. */
export function mountModelMenuRegression() {
  const host = document.createElement("div");
  host.id = "model-menu-regression";
  Object.assign(host.style, {
    position: "fixed",
    top: "40px",
    right: "8px",
    width: "260px",
    height: "44px",
    overflow: "hidden",
    isolation: "isolate",
    zIndex: "350",
  });
  document.body.append(host);
  createRoot(host).render(
    React.createElement(WelcomeModelSelect, {
      label: "Regression models",
      selectedModel: "claude:model-0",
      modelGroups: [
        {
          cliId: "claude",
          name: "Claude",
          models: Array.from({ length: 40 }, (_, index) => ({
            id: `claude:model-${index}`,
            label: `Model ${index}`,
          })),
        },
      ],
      onSelectModel: (value) => {
        host.dataset.selected = value;
      },
    }),
  );
}
