import React from "react";
import PropTypes from "prop-types";
import { Search, X } from "lucide-react";
import { WelcomePromptComposer } from "./welcome_prompt_composer.jsx";
import { WelcomeQuickActions } from "./welcome_quick_actions.jsx";
import { WelcomeFileCollection } from "./welcome_file_collection.jsx";
import { styleOptions, designSystemOptions, sizeOptions } from "./generation-options.js";

export function WelcomeRecentsTab({
  t,
  activePill,
  handleSelectPill,
  promptText,
  setPromptText,
  modelGroups,
  modelId,
  handleSelectModel,
  styleId,
  setStyleId,
  designSystemId,
  handleSelectDesignSystem,
  size,
  setSize,
  candidates,
  setCandidates,
  attachments,
  attachmentError,
  attachmentInputRef,
  fileInputRef,
  screenshotInputRef,
  references,
  submitting,
  configNotice,
  openAgentSettings,
  handlePromptSubmit,
  mobileSearchOpen,
  mobileSearchRef,
  searchQuery,
  setSearchQuery,
  setMobileSearchOpen,
  sharedCollectionProps,
}) {
  return (
    <div className="welcome-home-content flex-1 p-4 lg:p-8 max-w-6xl w-full mx-auto space-y-8">
      <h1 className="text-center text-[15px] font-medium text-neutral-100" data-testid="welcome-prompt-heading">
        {t("welcome.prompt.heading")}
      </h1>
      <WelcomePromptComposer
        t={t}
        activePill={activePill}
        onSelectPill={handleSelectPill}
        promptText={promptText}
        setPromptText={setPromptText}
        modelGroups={modelGroups}
        selectedModel={modelId}
        onSelectModel={handleSelectModel}
        styleId={styleId}
        styleOptions={styleOptions()}
        onSelectStyle={setStyleId}
        designSystemId={designSystemId}
        designSystemOptions={designSystemOptions(t)}
        onSelectDesignSystem={handleSelectDesignSystem}
        size={size}
        sizeOptions={sizeOptions()}
        onSelectSize={setSize}
        candidates={candidates}
        onSelectCandidates={setCandidates}
        attachments={attachments}
        onAddAttachments={() => attachmentInputRef.current?.click()}
        onRemoveAttachment={(target) => references.removeAttachment(target)}
        submitting={submitting || references.isReading}
        configNeeded={Boolean(configNotice)}
        onOpenSettings={openAgentSettings}
        onSubmit={handlePromptSubmit}
      />

      {(configNotice || attachmentError) && (
        <div className="mx-auto -mt-4 flex max-w-3xl flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
          <span className="min-w-0 flex-1">{configNotice || attachmentError}</span>
          {configNotice && (
            <button
              type="button"
              onClick={openAgentSettings}
              className="shrink-0 rounded-lg bg-amber-500/15 px-2.5 py-1 text-amber-200 transition-colors hover:bg-amber-500/25"
            >
              {t("welcome.prompt.openSettings")}
            </button>
          )}
        </div>
      )}

      {mobileSearchOpen && (
        <div className="welcome-mobile-search relative">
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
          />
          <input
            ref={mobileSearchRef}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("welcome.search.placeholder")}
            aria-label={t("welcome.search.placeholder")}
            className="h-11 w-full rounded-xl border border-white/10 bg-neutral-900 pl-10 pr-11 text-xs text-neutral-100 placeholder:text-neutral-400 outline-none focus:border-white/20"
          />
          <button
            type="button"
            aria-label={t("welcome.dialog.cancel")}
            onClick={() => {
              setMobileSearchOpen(false);
              setSearchQuery("");
            }}
            className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <WelcomeQuickActions
        t={t}
        onOpenFigma={() => fileInputRef.current?.click()}
        onOpenScreenshot={() => screenshotInputRef.current?.click()}
      />

      <div className="welcome-home-projects space-y-4 pt-2">
        <WelcomeFileCollection {...sharedCollectionProps} tabType="recents" />
      </div>
    </div>
  );
}

WelcomeRecentsTab.propTypes = {
  t: PropTypes.func.isRequired,
  activePill: PropTypes.string.isRequired,
  handleSelectPill: PropTypes.func.isRequired,
  promptText: PropTypes.string.isRequired,
  setPromptText: PropTypes.func.isRequired,
  modelGroups: PropTypes.array,
  modelId: PropTypes.string.isRequired,
  handleSelectModel: PropTypes.func.isRequired,
  styleId: PropTypes.string.isRequired,
  setStyleId: PropTypes.func.isRequired,
  designSystemId: PropTypes.string.isRequired,
  handleSelectDesignSystem: PropTypes.func.isRequired,
  size: PropTypes.object,
  setSize: PropTypes.func.isRequired,
  candidates: PropTypes.number.isRequired,
  setCandidates: PropTypes.func.isRequired,
  attachments: PropTypes.array.isRequired,
  attachmentError: PropTypes.string,
  attachmentInputRef: PropTypes.object.isRequired,
  fileInputRef: PropTypes.object.isRequired,
  screenshotInputRef: PropTypes.object.isRequired,
  references: PropTypes.object.isRequired,
  submitting: PropTypes.bool.isRequired,
  configNotice: PropTypes.string,
  openAgentSettings: PropTypes.func.isRequired,
  handlePromptSubmit: PropTypes.func.isRequired,
  mobileSearchOpen: PropTypes.bool.isRequired,
  mobileSearchRef: PropTypes.object.isRequired,
  searchQuery: PropTypes.string.isRequired,
  setSearchQuery: PropTypes.func.isRequired,
  setMobileSearchOpen: PropTypes.func.isRequired,
  sharedCollectionProps: PropTypes.object.isRequired,
};
