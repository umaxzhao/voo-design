import React, { useState } from "react";
import "../../src/index.css";
import { createRoot } from "react-dom/client";
import { loadLocale, t } from "../../src/shared/i18n.js";
import { WelcomePromptComposer } from "../../src/canvas/components/welcome_dashboard/welcome_prompt_composer.jsx";
import { AI_GEN_TYPES } from "../../src/canvas/components/welcome_dashboard/welcome_constants.js";
import "../../src/canvas/components/welcome_dashboard/welcome_mobile_layout.css";

/** Real composer interaction without provider calls or a user's document. */
export async function mountGenerationSettings() {
  await loadLocale("en");
  const host = document.createElement("div");
  host.id = "generation-settings-regression";
  Object.assign(host.style, {
    position: "fixed",
    top: "24px",
    left: "16px",
    width: "min(700px, calc(100vw - 32px))",
    zIndex: 50,
  });
  document.body.append(host);
  const sizeOptions = [
    ...new Map(
      AI_GEN_TYPES.map((type) => [`${type.width}x${type.height}`, type]),
    ).values(),
  ];
  function Fixture() {
    const [activePill, setActivePill] = useState("landing");
    const [text, setText] = useState("");
    const [size, setSize] = useState(null);
    const [candidates, setCandidates] = useState(1);
    const [styleId, setStyleId] = useState("auto");
    const [systemId, setSystemId] = useState("auto");
    return (
      <WelcomePromptComposer
        t={t}
        activePill={activePill}
        onSelectPill={(value) => {
          host.dataset.selected = value;
          setActivePill(value);
        }}
        promptText={text}
        setPromptText={setText}
        modelGroups={[]}
        selectedModel="controlled-model"
        onSelectModel={() => {}}
        attachments={[]}
        onAddAttachments={() => {}}
        onRemoveAttachment={() => {}}
        styleId={styleId}
        styleOptions={[{ id: "clean", name: "Controlled style" }]}
        onSelectStyle={(value) => {
          host.dataset.style = value;
          setStyleId(value);
        }}
        designSystemId={systemId}
        designSystemOptions={[
          { id: "auto", label: t("welcome.prompt.designSystemAuto") },
          { id: "controlled", label: "Controlled system" },
        ]}
        onSelectDesignSystem={(value) => {
          host.dataset.system = value;
          setSystemId(value);
        }}
        candidates={candidates}
        onSelectCandidates={(value) => {
          host.dataset.candidates = String(value);
          setCandidates(value);
        }}
        size={size}
        sizeOptions={sizeOptions}
        onSelectSize={(value) => {
          host.dataset.size = value ? `${value.width}x${value.height}` : "auto";
          setSize(value);
        }}
        onSubmit={(event) => event.preventDefault()}
      />
    );
  }
  createRoot(host).render(<Fixture />);
  return {
    settings: t("welcome.prompt.settingsLabel"),
    poster: t("welcome.pills.poster"),
    size: t("welcome.prompt.sizeLabel"),
    autoSize: t("welcome.prompt.sizeAuto"),
    candidates: t("welcome.prompt.candidates"),
    twoCandidates: t("welcome.prompt.candidateN", { n: 2 }),
    style: t("welcome.prompt.styleLabel"),
    system: t("welcome.prompt.designSystem"),
    systemAuto: t("welcome.prompt.designSystemAuto"),
    otherPlaceholder: t("welcome.prompt.otherPlaceholder"),
  };
}
