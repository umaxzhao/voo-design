/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import {
  IconAdd,
  IconArrowUp,
  IconChevronDown,
  IconClose,
  IconMore,
  IconSparkles,
  IconStop,
} from "../../icons.jsx";
import MaterialPickerModal from "./MaterialPickerModal.jsx";
import { useWorkflowStore } from "../../store/workflow_store.js";
import { useI18n } from "../../use_i18n.js";
import {
  assignMediaTags,
  getMediaCategory,
  getNodeDisplayName,
  getNodeIcon,
  getNodeThumbnail,
} from "./agentNodeHelpers.jsx";
import ModeSkillMenu from "./ModeSkillMenu.jsx";
import ApprovalMenu from "./ApprovalMenu.jsx";
import AgentQuestionCard from "./cards/AgentQuestionCard.jsx";
import AgentApprovalCard from "./cards/AgentApprovalCard.jsx";
import AgentLinkedObjects from "./AgentLinkedObjects.jsx";
import DesignSystemSelect from "./DesignSystemSelect.jsx";

export default function AgentComposer({
  cards,
  menus,
  skills,
  attach,
  isRunning,
  availableModes,
  activeMode,
  currentModeSkills,
  handleSelectMode,
  handleSelectSkill,
  isCodex,
  reasoningSaveError,
  setReasoningSaveError,
  llmConfig,
  selectedNodes,
  storeImages,
  storeThumbnails,
  handleUnlinkNode,
  textareaRef,
  inputText,
  setInputText,
  selectedSkillIds = [],
  onRemoveSkill = () => {},
  handleKeyDown,
  handlePaste: handlePasteProp,
  isConfigured,
  budgetUsed,
  tokenBudget,
  agentSpeed,
  setAgentSpeed,
  refreshLlmConfig,
  handleSend,
  sendDisabled = false,
  editorReferenceMode = false,
  ...rest
}) {
  const pendingQuestion = rest.pendingQuestion ?? cards?.pendingQuestion;
  const questionDraft = rest.questionDraft ?? cards?.questionDraft;
  const setQuestionDraft = rest.setQuestionDraft ?? cards?.setQuestionDraft;
  const resolveQuestion = rest.resolveQuestion ?? cards?.resolveQuestion;
  const pendingApproval = rest.pendingApproval ?? cards?.pendingApproval;
  const resolveApproval = rest.resolveApproval ?? cards?.resolveApproval;
  const handleStop = rest.handleStop ?? cards?.handleStop;

  const fileInputRef = rest.fileInputRef ?? attach?.fileInputRef;
  const skillFileInputRef = rest.skillFileInputRef ?? skills?.skillFileInputRef;
  const onOpenSettings = rest.onOpenSettings ?? cards?.onOpenSettings;
  const handleAttachmentSelect =
    rest.handleAttachmentSelect ?? attach?.handleAttachmentSelect;
  const handleSkillFileSelect =
    rest.handleSkillFileSelect ?? skills?.handleSkillFileSelect;
  const handlePaste = handlePasteProp ?? attach?.handlePaste;

  const modeMenuOpen = rest.modeMenuOpen ?? menus?.modeMenuOpen;
  const setModeMenuOpen = rest.setModeMenuOpen ?? menus?.setModeMenuOpen;
  const modeMenuRef = rest.modeMenuRef ?? menus?.modeMenuRef;
  const modeButtonRef = rest.modeButtonRef ?? menus?.modeButtonRef;
  const approvalMenuOpen = rest.approvalMenuOpen ?? menus?.approvalMenuOpen;
  const setApprovalMenuOpen =
    rest.setApprovalMenuOpen ?? menus?.setApprovalMenuOpen;
  const approvalMenuRef = rest.approvalMenuRef ?? menus?.approvalMenuRef;
  const approvalMode = rest.approvalMode ?? menus?.approvalMode;
  const setApprovalMode = rest.setApprovalMode ?? menus?.setApprovalMode;
  const planReviewEnabled =
    rest.planReviewEnabled ?? menus?.planReviewEnabled ?? false;
  const setPlanReviewEnabled =
    rest.setPlanReviewEnabled ?? menus?.setPlanReviewEnabled;

  const toggleSkill = rest.toggleSkill ?? skills?.toggleSkill;
  const hiddenSkillIds = rest.hiddenSkillIds ?? skills?.hiddenSkillIds;
  const pendingExternalSkill =
    rest.pendingExternalSkill ?? skills?.pendingExternalSkill;
  const setPendingExternalSkill =
    rest.setPendingExternalSkill ?? skills?.setPendingExternalSkill;
  const confirmExternalSkill =
    rest.confirmExternalSkill ?? skills?.confirmExternalSkill;
  const skillImportProgress =
    rest.skillImportProgress ?? skills?.skillImportProgress;
  const skillImportError = rest.skillImportError ?? skills?.skillImportError;

  const refImageError = rest.refImageError ?? attach?.refImageError;
  const referenceImages = rest.referenceImages ?? attach?.referenceImages;
  const handleRemoveReferenceImage =
    rest.handleRemoveReferenceImage ?? attach?.handleRemoveReferenceImage;
  const { t } = useI18n();

  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);

  const handleSelectMaterialAsset = (asset) => {
    if (attach?.addReferenceImage) {
      attach.addReferenceImage(asset);
    }
  };

  const handleRemoveMaterialAsset = (asset) => {
    if (attach?.removeReferenceImageById) {
      attach.removeReferenceImageById(asset.id);
    }
  };

  const mentionCandidates = useMemo(() => {
    const allNodes =
      selectedNodes && selectedNodes.length > 0 ? selectedNodes : [];
    const storeNodes = useWorkflowStore.getState().nodes || [];
    const targetNodes =
      allNodes.length > 0
        ? allNodes
        : storeNodes.filter(
            (n) =>
              (Array.isArray(n.data?.annotations) &&
                n.data.annotations.length > 0) ||
              getMediaCategory(n) !== null,
          );

    const mediaCandidates = [];
    const annotationCandidates = [];
    const nodeCandidates = [];

    const tagged = assignMediaTags(targetNodes, t);

    tagged.forEach(({ node, tag }) => {
      const displayName = getNodeDisplayName(node, t);
      const thumb = getNodeThumbnail(node, storeImages, storeThumbnails);

      if (tag) {
        mediaCandidates.push({
          id: `tag:${node.id}`,
          nodeId: node.id,
          label: tag,
          sublabel: displayName,
          thumb,
          type: "mediaTag",
          node,
        });
      }

      const annotations = Array.isArray(node.data?.annotations)
        ? node.data.annotations
        : Array.isArray(node.annotations)
          ? node.annotations
          : [];

      annotations.forEach((ann, idx) => {
        const markerLabel = t("mention.annotationMarker", { index: idx + 1 });
        annotationCandidates.push({
          id: `${node.id}#${ann.id}`,
          nodeId: node.id,
          label: `${displayName}·${markerLabel}`,
          note: ann.note,
          index: idx + 1,
          type: "annotation",
          node,
        });
      });

      nodeCandidates.push({
        id: node.id,
        nodeId: node.id,
        label: displayName,
        thumb,
        type: node.type || "node",
        node,
      });
    });

    return [...mediaCandidates, ...annotationCandidates, ...nodeCandidates];
  }, [selectedNodes, storeImages, storeThumbnails, t]);

  const filteredCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionCandidates.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.sublabel && c.sublabel.toLowerCase().includes(q)) ||
        (c.note && c.note.toLowerCase().includes(q)),
    );
  }, [mentionQuery, mentionCandidates]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    const pos = e.target.selectionStart;
    const textBefore = val.slice(0, pos);
    const lastAt = textBefore.lastIndexOf("@");
    if (lastAt !== -1 && !/\s/.test(textBefore.slice(lastAt + 1))) {
      setMentionQuery(textBefore.slice(lastAt + 1));
      setMentionHighlight(0);
    } else {
      setMentionQuery(null);
    }
  };

  const selectMentionCandidate = (candidate) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const textBefore = inputText.slice(0, pos);
    const lastAt = textBefore.lastIndexOf("@");
    const before =
      lastAt !== -1 ? inputText.slice(0, lastAt) : inputText.slice(0, pos);
    const after = inputText.slice(pos);

    const tag =
      candidate.type === "mediaTag"
        ? `@${candidate.label} `
        : candidate.type === "annotation"
          ? candidate.note
            ? `@[${candidate.label}: ${candidate.note}] `
            : `@[${candidate.label}] `
          : `@[${candidate.label}] `;

    const nextText = `${before}${tag}${after}`;
    setInputText(nextText);
    setMentionQuery(null);

    if (
      (editorReferenceMode || activeMode === "design") &&
      candidate.type !== "annotation" &&
      getMediaCategory(candidate.node) === "image"
    ) {
      attach?.setCanvasReference?.({
        nodeId: candidate.nodeId,
        name:
          candidate.type === "mediaTag"
            ? candidate.label
            : getNodeDisplayName(candidate.node, t),
      });
    }

    // Link node if not already selected
    const store = useWorkflowStore.getState();
    const isLinked = (store.nodes || []).some(
      (n) => n.id === candidate.nodeId && n.selected,
    );
    if (!editorReferenceMode && !isLinked) {
      store.onNodesChange?.([
        { id: candidate.nodeId, type: "select", selected: true },
      ]);
    }

    requestAnimationFrame(() => {
      textarea.focus();
      const nextPos = before.length + tag.length;
      textarea.setSelectionRange(nextPos, nextPos);
    });
  };

  const handleComposerKeyDown = (e) => {
    if (mentionQuery !== null && filteredCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionHighlight((h) => (h + 1) % filteredCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionHighlight(
          (h) =>
            (h - 1 + filteredCandidates.length) % filteredCandidates.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMentionCandidate(filteredCandidates[mentionHighlight]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    handleKeyDown?.(e);
  };

  return (
    <div className="px-3 pb-3 pt-1.5 bg-transparent">
      <AgentQuestionCard
        pendingQuestion={pendingQuestion}
        questionDraft={questionDraft}
        setQuestionDraft={setQuestionDraft}
        resolveQuestion={resolveQuestion}
      />

      <AgentApprovalCard
        pendingApproval={pendingApproval}
        resolveApproval={resolveApproval}
      />

      {/* Hidden file input for attaching reference images or text files */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.txt,.md,.markdown,text/plain,text/markdown"
        multiple
        className="hidden"
        onChange={handleAttachmentSelect}
      />
      <input
        ref={skillFileInputRef}
        type="file"
        accept=".md,.skill,.zip,application/zip,application/x-zip-compressed"
        multiple
        className="hidden"
        onChange={handleSkillFileSelect}
      />

      <div className="relative flex flex-col agent-composer-frame rounded-2xl p-2.5">
        {materialModalOpen && (
          <MaterialPickerModal
            open={materialModalOpen}
            onClose={() => setMaterialModalOpen(false)}
            onSelectAsset={handleSelectMaterialAsset}
            onRemoveAsset={handleRemoveMaterialAsset}
            selectedImages={referenceImages}
            onUploadFiles={attach?.addReferenceImageFiles}
          />
        )}
        {modeMenuOpen && (
          <div ref={modeMenuRef}>
            <ModeSkillMenu
              open
              modes={availableModes}
              activeMode={activeMode}
              modeSkills={currentModeSkills}
              onSelectMode={handleSelectMode}
              onSelectSkill={handleSelectSkill}
              onToggleSkill={toggleSkill}
              hiddenSkillIds={hiddenSkillIds}
              onImportSkillFile={() => skillFileInputRef.current?.click()}
            />
          </div>
        )}
        {pendingExternalSkill && (
          <div className="mb-2 rounded-xl bg-[#E5B2FF]/10 p-2 text-[11px]">
            <div className="font-semibold text-[#eed0ff]">
              {pendingExternalSkill.name}
            </div>
            <div className="mt-1 text-neutral-300">
              {pendingExternalSkill.description}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={confirmExternalSkill}
                className="rounded-lg bg-[#E5B2FF] px-2 py-1 text-[10px] text-black"
              >
                {t("agent.skillImportConfirm")}
              </button>
              <button
                type="button"
                onClick={() => setPendingExternalSkill(null)}
                className="rounded-lg bg-white/[0.08] px-2 py-1 text-[10px] text-neutral-300"
              >
                {t("agent.skillImportCancel")}
              </button>
            </div>
          </div>
        )}
        {skillImportProgress && (
          <p className="mb-2 px-1 text-[10px] text-neutral-400">
            {t("agent.skillImportProgress", skillImportProgress)}
          </p>
        )}
        {skillImportError && (
          <p className="mb-2 px-1 text-[10px] text-rose-300">
            {skillImportError}
          </p>
        )}

        {/* Attached reference image thumbnails */}
        {isCodex && reasoningSaveError?.model === llmConfig.model && (
          <p
            role="alert"
            data-testid="agent-reasoning-error"
            className="px-1 pb-2 text-[10px] text-rose-300"
          >
            {reasoningSaveError.message}
          </p>
        )}
        {refImageError && (
          <p className="px-1 pb-2 text-[10px] text-rose-300">{refImageError}</p>
        )}
        {referenceImages.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2 px-1">
            {referenceImages.map((img) => (
              <div
                key={img.id}
                className="relative group h-12 w-12 rounded-lg overflow-hidden border border-white/20 bg-black"
              >
                <img
                  src={img.url}
                  alt={img.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={t("agent.removeImage")}
                  onClick={() =>
                    handleRemoveReferenceImage(
                      referenceImages.findIndex((item) => item.id === img.id),
                    )
                  }
                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                >
                  <IconClose size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {attach?.canvasReference && (
          <div className="flex items-center gap-2 px-1 pb-2 text-[11px] text-[#eed0ff]">
            <span className="truncate rounded-lg bg-[#E5B2FF]/10 px-2 py-1">
              {t("agent.canvasReference", {
                name: attach.canvasReference.name,
              })}
            </span>
            <button
              type="button"
              aria-label={t("agent.removeCanvasReference")}
              onClick={() => attach.setCanvasReference(null)}
              className="rounded-lg text-neutral-400 hover:text-white"
            >
              <IconClose size={12} />
            </button>
          </div>
        )}

        {/* Linked workflow objects selected on the canvas */}
        <AgentLinkedObjects
          selectedNodes={selectedNodes}
          storeImages={storeImages}
          storeThumbnails={storeThumbnails}
          handleUnlinkNode={handleUnlinkNode}
        />

        {selectedSkillIds.length > 0 && (
          <div
            className="flex flex-wrap gap-1.5 px-1 pb-2"
            data-testid="agent-selected-skills"
          >
            {selectedSkillIds.map((skillId) => (
              <span
                key={skillId}
                className="inline-flex items-center gap-1 rounded-lg bg-[#E5B2FF]/10 px-2 py-1 font-mono text-[11px] text-[#eed0ff]"
              >
                @{skillId}
                <button
                  type="button"
                  onClick={() => onRemoveSkill(skillId)}
                  aria-label={t("agent.removeSkill", { name: skillId })}
                  className="rounded-lg text-[#eed0ff] hover:text-white"
                >
                  <IconClose size={11} strokeWidth={1.5} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* @ Mention Popover */}
        {mentionQuery !== null && filteredCandidates.length > 0 && (
          <div
            role="listbox"
            className="absolute bottom-full left-2 z-50 mb-2 w-64 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-neutral-900/95 p-1 shadow-menu backdrop-blur-xl"
          >
            {filteredCandidates.map((candidate, i) => (
              <button
                key={candidate.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMentionCandidate(candidate);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors ${
                  i === mentionHighlight
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                }`}
              >
                {candidate.type === "mediaTag" && candidate.thumb ? (
                  <img
                    src={candidate.thumb}
                    alt=""
                    className="h-4 w-4 rounded-md object-cover flex-shrink-0"
                  />
                ) : candidate.type === "annotation" ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E5B2FF]/20 text-[10px] font-medium text-[#eed0ff]">
                    {candidate.index}
                  </span>
                ) : (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400">
                    {getNodeIcon(candidate.node || candidate.type)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-white">
                    {candidate.label}
                  </div>
                  {candidate.sublabel ? (
                    <div className="truncate text-[10px] text-neutral-400">
                      {candidate.sublabel}
                    </div>
                  ) : candidate.note ? (
                    <div className="truncate text-[10px] text-neutral-400">
                      {candidate.note}
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleComposerKeyDown}
          onPaste={handlePaste}
          placeholder={t(activeMode.placeholderKey)}
          aria-label={t(activeMode.placeholderKey)}
          rows={2}
          disabled={isRunning || !isConfigured}
          className="min-h-[48px] max-h-[168px] overflow-y-auto ui-scroll w-full resize-none border-0 bg-transparent px-1 text-[12px] leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-400 disabled:opacity-40"
        />

        <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
          {/* Left controls: + attach image/file, 技能 skills, More (...) */}
          {/* The More menu anchors here, aligned with the composer's content
              left edge — anchoring it to the small button itself pushed it
              against the panel's right edge. */}
          <div
            className="relative flex items-center gap-1.5 text-neutral-400"
            ref={approvalMenuRef}
          >
            {/* 1. 素材 Materials & Assets Picker */}
            <button
              type="button"
              onClick={() => setMaterialModalOpen((v) => !v)}
              title={t("agent.materialPickerTitle")}
              aria-label={t("agent.materialPickerTitle")}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                materialModalOpen
                  ? "bg-[#E5B2FF]/20 text-[#eed0ff]"
                  : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.12] hover:text-white"
              }`}
            >
              <IconAdd size={14} />
            </button>

            {/* 2. Skills — list per goal mode, with user skill import */}
            <button
              ref={modeButtonRef}
              type="button"
              data-testid="agent-skills-trigger"
              aria-label={t("agent.skillPanelTitle")}
              onClick={() => setModeMenuOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                modeMenuOpen
                  ? "bg-[#E5B2FF]/20 text-[#eed0ff]"
                  : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.1] hover:text-white"
              }`}
            >
              <IconSparkles size={12} />
              <span className="hidden sm:inline">
                {t("agent.skillsButton")}
              </span>
              <IconChevronDown size={11} className="text-neutral-500" />
            </button>

            {/* 3. Design System — only active in design mode */}
            {activeMode.id === "design" && (
              <DesignSystemSelect disabled={isRunning} />
            )}

            {/* 4. More options (...) — speed/reasoning, approval mode, tokens.
                The menu itself anchors to the left-controls group above. */}
            <button
              type="button"
              onClick={() => setApprovalMenuOpen((v) => !v)}
              title={t("agent.moreSettings")}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                approvalMenuOpen
                  ? "bg-white/15 text-white"
                  : "text-neutral-400 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <IconMore size={14} />
            </button>

            {approvalMenuOpen && (
              <ApprovalMenu
                open
                approvalMode={approvalMode}
                budgetUsed={budgetUsed}
                tokenBudget={tokenBudget}
                agentSpeed={agentSpeed}
                onSelectSpeed={setAgentSpeed}
                planReviewEnabled={planReviewEnabled}
                onTogglePlanReview={setPlanReviewEnabled}
                llmConfig={llmConfig}
                isRunning={isRunning}
                onOpenSettings={onOpenSettings}
                onCloseMenu={() => setApprovalMenuOpen(false)}
                reasoning={
                  isCodex
                    ? {
                        model: llmConfig.model,
                        effort: llmConfig.reasoningEffort,
                        efforts: llmConfig.reasoningEfforts,
                        capabilityError: llmConfig.reasoningError,
                        disabled: isRunning,
                        onRefresh: refreshLlmConfig,
                        onError: (message) =>
                          setReasoningSaveError(
                            message
                              ? { model: llmConfig.model, message }
                              : null,
                          ),
                      }
                    : null
                }
                onSelect={(mode) => {
                  setApprovalMode(mode);
                  setApprovalMenuOpen(false);
                }}
              />
            )}
          </div>

          {/* Keep cancellation reachable in the same place as submission. */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-testid="agent-composer-action"
              onClick={() => (isRunning ? handleStop() : handleSend())}
              disabled={
                !isRunning &&
                ((!inputText.trim() && selectedSkillIds.length === 0) ||
                  !isConfigured ||
                  sendDisabled)
              }
              aria-label={t(isRunning ? "agent.stop" : "textAi.generate")}
              title={t(isRunning ? "agent.stop" : "textAi.generate")}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]/40 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-neutral-500 ${
                isRunning
                  ? "bg-white text-black hover:bg-neutral-200"
                  : "bg-[#E5B2FF] text-black hover:bg-[#eed0ff]"
              }`}
            >
              {isRunning ? (
                <IconStop size={14} fill="currentColor" />
              ) : (
                <IconArrowUp size={16} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
