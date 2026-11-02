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
  Object.assign(host.style, { position: "fixed", top: "24px", left: "16px", width: "min(700px, calc(100vw - 32px))", zIndex: 500 });
  document.body.append(host);
  const sizeOptions = [...new Map(AI_GEN_TYPES.map(type => [`${type.width}x${type.height}`, type])).values()];
  function Fixture() {
    const [activePill, setActivePill] = useState("landing");
    const [text, setText] = useState("");
    return <WelcomePromptComposer t={t} activePill={activePill}
      onSelectPill={value => { host.dataset.selected = value; setActivePill(value); }}
      promptText={text} setPromptText={setText} modelGroups={[]} selectedModel="controlled-model"
      onSelectModel={() => {}} attachments={[]} onAddAttachments={() => {}} onRemoveAttachment={() => {}}
      styleOptions={[]} onSelectStyle={() => {}} designSystemOptions={[{ id: "auto", label: t("welcome.prompt.designSystemAuto") }]}
      onSelectDesignSystem={() => {}} candidates={1} onSelectCandidates={() => {}}
      sizeOptions={sizeOptions} onSelectSize={() => {}} onSubmit={event => event.preventDefault()} />;
  }
  createRoot(host).render(<Fixture />);
  return {
    settings: t("welcome.prompt.settingsLabel"), poster: t("welcome.pills.poster"),
    size: t("welcome.prompt.sizeLabel"), otherPlaceholder: t("welcome.prompt.otherPlaceholder"),
  };
}
