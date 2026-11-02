import React, { useState } from "react";
import "../../src/index.css";
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
  function Fixture() {
    const [selectedModel, setSelectedModel] = useState("claude:model-0");
    return React.createElement(WelcomeModelSelect, {
      label: "Regression models",
      selectedModel,
      modelGroups: [
        {
          cliId: "claude",
          name: "Claude Code",
          models: Array.from({ length: 40 }, (_, index) => ({
            id: `claude:model-${index}`,
            label: `Model ${index}`,
          })),
        },
        {
          cliId: "codex",
          name: "Codex",
          models: [{ id: "codex:test", label: "Codex test" }],
        },
        {
          cliId: "api:custom",
          name: "Custom API",
          models: [{ id: "api:custom:test", label: "Custom model" }],
        },
        { cliId: "empty", name: "Empty provider", models: [] },
      ],
      onSelectModel: (value) => {
        host.dataset.selected = value;
        setSelectedModel(value);
      },
    });
  }
  createRoot(host).render(<Fixture />);
}
