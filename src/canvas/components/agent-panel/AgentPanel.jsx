/**
 * Agent Panel — AI agent chat drawer.
 *
 * Composing component coordinating header, drawers, message stream,
 * and composer under the strict <= 400 line architecture.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAgentLoop } from "./useAgentLoop.js";
import { useContextAssembly } from "./useContextAssembly.js";
import { useWorkflowStore } from "../../store/workflow_store.js";
import { useUserStore } from "../../store/user_store.js";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../use_i18n.js";
import {
  AGENT_MODES,
  CREATION_TYPE_CARDS,
  EDITOR_SELECTION_CARDS,
} from "./agentModes.js";
import { buildComposerSkills } from "../node_store_skill_catalog.js";
import { formatSkillCatalogForPrompt } from "./skill-metadata.js";
import {
  getStoredAgentSpeed,
  AGENT_SPEED_STORAGE_KEY,
  FAST_MAX_STEPS_PER_TURN,
} from "./agentNodeHelpers.jsx";
import { MODE_PREACTIVATED_TOOLS } from "./mode_preactivated_tools.js";
import {
  resolveAgentLlmConfig,
  setStoredLlmModel,
  setStoredLlmProvider,
} from "./agentLlmConfig.js";
import { PROVIDER_ID } from "../../../shared/providers.js";
import { cliAgentForProvider } from "../../../shared/cli-agents.js";
import {
  getAgentModesForContext,
  modeOnEditorEntry,
} from "./agent-mode-context.js";
import {
  getThemeNames,
  AGENT_IDENTITY_COLORS,
  AGENT_NAME_THEME_STORAGE_KEY,
  AGENT_DEFAULT_NAME_STORAGE_KEY,
  AGENT_CUSTOM_NAMES_STORAGE_KEY,
} from "../../../shared/agent_persona.js";
import { getSetting, onSettingChange } from "../../../shared/settings.js";
import { useAgentGlobalMemory } from "./useAgentGlobalMemory.js";
import { useAgentCliStatus } from "./useAgentCliStatus.js";
import { useAgentAttachments } from "./useAgentAttachments.js";
import { useAgentSkills } from "./useAgentSkills.js";
import { useAgentSessions } from "./useAgentSessions.js";
import { useAgentInteractiveCards } from "./useAgentInteractiveCards.js";
import { useAgentReviews } from "./useAgentReviews.js";
import { useAgentCanvasState } from "./useAgentCanvasState.js";
import { useAgentSend } from "./useAgentSend.js";
import { useAgentMenus } from "./useAgentMenus.js";
import { useAgentRenderedItems } from "./useAgentRenderedItems.js";
import { useAgentPanelHover } from "./useAgentPanelHover.js";
import { AGENT_NODE_RESET_EVENT } from "../../nodes/agent_events.js";
import AgentDrawers from "./drawers/AgentDrawers.jsx";
import AgentPanelHeader from "./header/AgentPanelHeader.jsx";
import AgentMessageStream from "./AgentMessageStream.jsx";
import AgentComposer from "./AgentComposer.jsx";
import CreationTypePicker from "./creation_type_picker.jsx";
import { useEditorAgentIntent } from "./use_editor_agent_intent.js";
import { getCreationType } from "./creation-types.js";
import "./AgentPanel.css";

/* eslint-disable react/prop-types */

export { AGENT_MODES } from "./agentModes.js";
export { MODE_SKILLS } from "./agentSkills.js";

export default function AgentPanel({
  onClose,
  onOpenSettings,
  lockedMode = null,
  preferredMode = null,
  pendingPrompt = null,
  onClearPendingPrompt = null,
  pendingSkill = null,
  onClearPendingSkill = null,
  agentNodeId = null,
}) {
  const { t, locale } = useI18n();
  const [inputText, setInputText] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState([]);

  const boundAgent = useWorkflowStore((state) =>
    agentNodeId ? (state.nodes || []).find((n) => n.id === agentNodeId) : null,
  );
  const [selectedThemeId, setSelectedThemeId] = useState(
    () => getSetting(AGENT_NAME_THEME_STORAGE_KEY) || "default",
  );
  const [selectedDefaultName, setSelectedDefaultName] = useState(
    () => getSetting(AGENT_DEFAULT_NAME_STORAGE_KEY) || "",
  );

  useEffect(() => {
    const unsubTheme = onSettingChange(AGENT_NAME_THEME_STORAGE_KEY, (val) =>
      setSelectedThemeId(val || "default"),
    );
    const unsubName = onSettingChange(AGENT_DEFAULT_NAME_STORAGE_KEY, (val) =>
      setSelectedDefaultName(val || ""),
    );
    return () => {
      unsubTheme?.();
      unsubName?.();
    };
  }, []);

  const activeAgentName = useMemo(() => {
    if (boundAgent?.data?.agentName) return boundAgent.data.agentName;
    const themeId = selectedThemeId || "default";
    const customNames = getSetting(AGENT_CUSTOM_NAMES_STORAGE_KEY) || [];
    const names = getThemeNames(themeId, customNames, locale);
    if (selectedDefaultName && names.includes(selectedDefaultName)) {
      return selectedDefaultName;
    }
    return names[0] || "Agent";
  }, [
    boundAgent?.data?.agentName,
    selectedThemeId,
    selectedDefaultName,
    locale,
  ]);

  const activeAgentColor = useMemo(() => {
    if (boundAgent?.data?.agentColor) return boundAgent.data.agentColor;
    const themeId = selectedThemeId || "default";
    const customNames = getSetting(AGENT_CUSTOM_NAMES_STORAGE_KEY) || [];
    const names = getThemeNames(themeId, customNames, locale);
    const idx = selectedDefaultName ? names.indexOf(selectedDefaultName) : 0;
    const effectiveIdx = idx >= 0 ? idx : 0;
    return AGENT_IDENTITY_COLORS[effectiveIdx % AGENT_IDENTITY_COLORS.length];
  }, [
    boundAgent?.data?.agentColor,
    selectedThemeId,
    selectedDefaultName,
    locale,
  ]);

  useEffect(() => {
    if (pendingPrompt) {
      setInputText(pendingPrompt);
      onClearPendingPrompt?.();
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.value.length;
          textareaRef.current.selectionEnd = textareaRef.current.value.length;
        }
      }, 50);
    }
  }, [pendingPrompt, onClearPendingPrompt]);

  useEffect(() => {
    const handlePromptEvent = (e) => {
      const text =
        typeof e.detail === "string"
          ? e.detail
          : (e.detail?.prompt ?? e.detail?.text);
      if (typeof text === "string" && text) {
        setInputText(text);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.selectionStart =
              textareaRef.current.value.length;
            textareaRef.current.selectionEnd = textareaRef.current.value.length;
          }
        }, 50);
      }
    };
    window.addEventListener("voo:agent-prompt", handlePromptEvent);
    return () =>
      window.removeEventListener("voo:agent-prompt", handlePromptEvent);
  }, []);

  const [llmConfig, setLlmConfig] = useState({
    providerId: "deepseek",
    providerName: "DeepSeek",
    model: "deepseek-flash",
    baseUrl: "https://api.deepseek.com",
    apiKey: null,
    configured: false,
    availableProviders: [],
  });

  const menus = useAgentMenus();
  const globalMem = useAgentGlobalMemory();

  const [agentMode, setAgentMode] = useState(lockedMode || "workflow");
  const [creationType, setCreationType] = useState(null);
  const showCreationTypes = !lockedMode && !agentNodeId;
  const showEditorIntent =
    preferredMode === "design" && !lockedMode && !agentNodeId;
  const editorIntent = useEditorAgentIntent(showEditorIntent, creationType);
  const activeCreationType = getCreationType(creationType);
  const [agentSpeed, setAgentSpeed] = useState(getStoredAgentSpeed);
  const [reasoningSaveError, setReasoningSaveError] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const textareaRef = useRef(null);
  const stickToBottomRef = useRef(true);

  const selectedNodes = useWorkflowStore(
    useShallow((state) => (state.nodes || []).filter((n) => n.selected)),
  );
  const storeImages = useWorkflowStore(
    useShallow((state) => state.images || {}),
  );
  const storeThumbnails = useWorkflowStore(
    useShallow((state) => state.thumbnails || {}),
  );
  const {
    projectBrief,
    updateProjectBrief,
    projectMemory,
    removeProjectMemoryItem,
    clearProjectMemory,
  } = useWorkflowStore(
    useShallow((s) => ({
      projectBrief: s.projectBrief,
      updateProjectBrief: s.updateProjectBrief,
      projectMemory: s.projectMemory,
      removeProjectMemoryItem: s.removeProjectMemoryItem,
      clearProjectMemory: s.clearProjectMemory,
    })),
  );

  const refreshLlmConfig = useCallback(() => {
    return resolveAgentLlmConfig().then((cfg) => setLlmConfig(cfg));
  }, []);

  const cli = useAgentCliStatus(llmConfig, refreshLlmConfig);
  const attach = useAgentAttachments({ t, setInputText, textareaRef });
  const skills = useAgentSkills({ t });
  const skillCatalog = useMemo(
    () => formatSkillCatalogForPrompt(skills.externalSkills),
    [skills.externalSkills],
  );

  useEffect(() => {
    if (!pendingSkill?.id) return;
    setSelectedSkillIds((current) =>
      current.includes(pendingSkill.id)
        ? current
        : [...current, pendingSkill.id],
    );
    onClearPendingSkill?.();
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [pendingSkill, onClearPendingSkill]);

  const availableModes = useMemo(
    () =>
      getAgentModesForContext(
        AGENT_MODES,
        showEditorIntent ? "design" : lockedMode,
      ),
    [lockedMode, showEditorIntent],
  );
  // The open editor is a Design surface for the agent regardless of its canvas
  // mode. The canvas type travels in the request context (editor-request-intent),
  // not in the panel UI: switching 设计/动效/3D must not retitle the Agent's
  // mode, placeholder or creation-type row.
  const effectiveAgentMode = showEditorIntent ? "design" : agentMode;
  const baseMode =
    AGENT_MODES.find((m) => m.id === effectiveAgentMode) ?? AGENT_MODES[0];
  const presentationMode = activeCreationType
    ? (AGENT_MODES.find((mode) => mode.id === activeCreationType.mode) ??
      baseMode)
    : baseMode;
  const activeMode =
    showEditorIntent && editorIntent.operation !== "generate"
      ? {
          ...baseMode,
          placeholderKey: `agent.editorIntent.${editorIntent.operation}Placeholder`,
          welcomeKey: "agent.editorIntent.editWelcome",
          cards: EDITOR_SELECTION_CARDS,
        }
      : activeCreationType
        ? {
            ...presentationMode,
            placeholderKey: activeCreationType.placeholderKey,
            cards:
              CREATION_TYPE_CARDS[activeCreationType.id] ??
              presentationMode.cards,
          }
        : baseMode;

  const { setModeMenuOpen } = menus;
  useEffect(() => {
    setAgentMode((currentMode) => {
      if (lockedMode) return lockedMode;
      return currentMode;
    });
    setModeMenuOpen(false);
  }, [lockedMode, setModeMenuOpen]);

  useEffect(() => {
    refreshLlmConfig();
    const evts = [
      "ciw-provider-config-changed",
      "ciw-agent-llm-changed",
      "focus",
      "storage",
    ];
    evts.forEach((e) => window.addEventListener(e, refreshLlmConfig));
    return () =>
      evts.forEach((e) => window.removeEventListener(e, refreshLlmConfig));
  }, [refreshLlmConfig]);

  const isCodex =
    llmConfig.providerId === "cli" && llmConfig.model.startsWith("codex:");
  const isFastMode = !isCodex && agentSpeed === "fast";
  const modePreactivatedTools = useMemo(
    () => [
      ...new Set([
        ...(MODE_PREACTIVATED_TOOLS[effectiveAgentMode] ?? []),
        ...(activeCreationType?.tools ?? []),
        ...(showEditorIntent
          ? [
              "get_design_scene",
              "edit_design_scene",
              "edit_image_layer",
              "mount_image_in_design",
              "generate_3d_model",
            ]
          : []),
      ]),
    ],
    [effectiveAgentMode, activeCreationType, showEditorIntent],
  );
  const assembleSystemPrompt = useContextAssembly({
    mode: effectiveAgentMode,
    planFirst: !isFastMode,
    agentNodeId,
  });

  useEffect(() => {
    try {
      localStorage.setItem(AGENT_SPEED_STORAGE_KEY, agentSpeed);
    } catch {
      /* ignore */
    }
  }, [agentSpeed]);

  const { getCanvasState, handleUnlinkNode } = useAgentCanvasState({
    t,
    globalBrands: globalMem.globalBrands,
    globalPreferences: globalMem.globalPreferences,
  });

  const getStore = useCallback(() => useWorkflowStore.getState(), []);
  const loopCancelRef = useRef(null);
  const cards = useAgentInteractiveCards(() => loopCancelRef.current?.());

  const apiKey = llmConfig.apiKey;
  const isCli = llmConfig.providerId === "cli";
  const isConfigured = llmConfig.configured && Boolean(apiKey);
  // AGENT-1: the API-key empty state offers signing in to VOO Cloud alongside
  // the settings route.
  const openAuthModal = useUserStore((state) => state.openAuthModal);
  const userLoggedIn = useUserStore((state) => Boolean(state.user?.isLoggedIn));

  const {
    events,
    messages,
    isRunning,
    sendMessage,
    cancel,
    reset,
    setSessionState,
    budgetUsed,
    spentBudget,
    tokenBudget,
    resolveReview,
    runs,
    resumeRun,
    abandonRun,
    takeoverRun,
    applyPersistedPlanReview,
  } = useAgentLoop({
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
    baseUrl: llmConfig.baseUrl,
    providerId: llmConfig.providerId,
    reasoningEffort: llmConfig.reasoningEffort,
    approvalMode: menus.approvalMode,
    assembleSystemPrompt,
    getCanvasState,
    requestApproval: cards.requestApproval,
    requestPlanApproval: cards.requestPlanApproval,
    planReviewEnabled: menus.planReviewEnabled,
    onRequestUserInput: cards.onRequestUserInput,
    getStore,
    maxStepsPerTurn: isFastMode ? FAST_MAX_STEPS_PER_TURN : undefined,
    preactivateTools: modePreactivatedTools,
    storagePrefix: null,
  });
  loopCancelRef.current = cancel;

  const previousPreferredModeRef = useRef(null);
  useEffect(() => {
    const enteringEditor =
      preferredMode && previousPreferredModeRef.current !== preferredMode;
    previousPreferredModeRef.current = preferredMode;
    if (enteringEditor && !showEditorIntent) {
      setAgentMode((current) =>
        modeOnEditorEntry(current, preferredMode, isRunning),
      );
    }
  }, [preferredMode, isRunning, showEditorIntent]);

  // Publish the bound node to the store so tool execution adopts nodes created
  // in this session into the node's output Group. Cleared on unbind/unmount.
  useEffect(() => {
    const store = useWorkflowStore.getState();
    store.setAgentSessionNode?.(agentNodeId);
    return () => {
      const current = useWorkflowStore.getState();
      if ((current.agentSessionNodeId ?? null) === (agentNodeId ?? null)) {
        current.setAgentSessionNode?.(null);
      }
    };
  }, [agentNodeId]);

  // "Reset session" on the bound Agent node clears the conversation but never
  // the artifacts: the Group binding and brief live on the node, untouched.
  useEffect(() => {
    if (!agentNodeId) return undefined;
    const onReset = (event) => {
      if (event?.detail?.nodeId !== agentNodeId) return;
      reset();
    };
    window.addEventListener(AGENT_NODE_RESET_EVENT, onReset);
    return () => window.removeEventListener(AGENT_NODE_RESET_EVENT, onReset);
  }, [agentNodeId, reset]);

  const { reviews, setReviews, reviewEventsSeenRef } = useAgentReviews(events);
  const { layoutItems, setLayoutItems, renderedItems, latestPlan } =
    useAgentRenderedItems(events, t);

  // The plan review card prefers the run-persisted pending review, so it
  // survives a reload; the live in-memory promise is only the fallback source.
  const persistedPlanReview = useMemo(() => {
    const run = (runs || []).find(
      (candidate) =>
        candidate?.planReview?.pending === true &&
        Array.isArray(candidate?.planReview?.plan?.steps),
    );
    if (!run) return null;
    return {
      runId: run.id,
      plan: run.planReview.plan,
      estimatedCost: run.planReview.estimatedCost ?? 0,
      persisted: true,
    };
  }, [runs]);

  const planReview =
    persistedPlanReview ??
    (cards.pendingPlanReview
      ? {
          runId: cards.pendingPlanReview.runId,
          plan: cards.pendingPlanReview.plan,
          estimatedCost: cards.pendingPlanReview.estimatedCost ?? 0,
          persisted: false,
        }
      : null);

  const handleResolvePlanReview = useCallback(
    (decision, runId) => {
      if (cards.resolvePlanReview(decision)) return;
      // The live promise is gone (reload): fall back to the persisted record.
      if (runId) applyPersistedPlanReview(runId, decision);
    },
    [cards, applyPersistedPlanReview],
  );

  const {
    sessions,
    currentSessionId,
    handleNewChat,
    handleSelectSession,
    handleDeleteSession,
  } = useAgentSessions({
    events,
    messages,
    budgetUsed,
    spentBudget,
    isRunning,
    reset,
    setSessionState,
    stickToBottomRef,
    setReviews,
    setLayoutItems,
    reviewEventsSeenRef,
    setHistoryOpen: menus.setHistoryOpen,
    agentNodeId,
  });

  // Output choices belong to this draft, never to another conversation.
  useEffect(() => setCreationType(null), [currentSessionId]);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId),
    [sessions, currentSessionId],
  );
  const currentSessionTitle = useMemo(() => {
    if (currentSession?.title?.trim()) return currentSession.title.trim();
    const firstUserMsg = messages.find((m) => m.role === "user");
    if (firstUserMsg?.content) {
      if (
        typeof firstUserMsg.content === "string" &&
        firstUserMsg.content.trim()
      ) {
        return firstUserMsg.content.trim().slice(0, 24);
      }
      if (Array.isArray(firstUserMsg.content)) {
        const text = firstUserMsg.content
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text)
          .join(" ")
          .trim();
        if (text) return text.slice(0, 24);
      }
    }
    return t("agent.newChat");
  }, [currentSession, messages, t]);

  const { handleSend } = useAgentSend({
    inputText,
    setInputText,
    skillCatalog,
    selectedSkillIds,
    setSelectedSkillIds,
    isRunning,
    referenceImages: attach.referenceImages,
    setReferenceImages: attach.setReferenceImages,
    canvasReference: attach.canvasReference,
    setCanvasReference: attach.setCanvasReference,
    setRefImageError: attach.setRefImageError,
    selectedNodes: showEditorIntent ? [] : selectedNodes,
    sendMessage,
    agentNodeId,
    creationType: activeCreationType?.id ?? null,
    editorIntent: editorIntent.editorIntent,
    t,
  });

  const handleSubmit = useCallback(
    (text) => {
      if (editorIntent.blocked) return;
      return handleSend(text);
    },
    [editorIntent.blocked, handleSend],
  );

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, layoutItems]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 168) + "px";
    }
  }, [inputText]);

  const handleSelectSkill = useCallback(
    (skill) => {
      menus.setModeMenuOpen(false);
      setSelectedSkillIds((current) =>
        current.includes(skill.id) ? current : [...current, skill.id],
      );
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
    [menus],
  );

  const handleSelectPromptCard = useCallback((promptText) => {
    setInputText(promptText);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = textareaRef.current.value.length;
        textareaRef.current.selectionEnd = textareaRef.current.value.length;
      }
    }, 50);
  }, []);

  const handleSelectMode = useCallback(
    (modeId) => {
      if (lockedMode || showEditorIntent) return;
      setCreationType(null);
      setAgentMode(modeId);
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
    [lockedMode, showEditorIntent],
  );

  const handleSelectCreationType = (id) => {
    if (isRunning) return;
    if (creationType === id) {
      setCreationType(null);
      setAgentMode(preferredMode || "workflow");
      return;
    }
    const type = getCreationType(id);
    setCreationType(type.id);
    setAgentMode(type.mode);
    textareaRef.current?.focus();
  };

  const { handlePanelMouseEnter, handlePanelMouseLeave } = useAgentPanelHover({
    lockedMode,
    eventsLength: events.length,
    isRunning,
    layoutItemsLength: layoutItems.length,
    onClose,
  });

  const handleKeyDown = useCallback(
    (e) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const modelDisplayName = useMemo(() => {
    const value = String(llmConfig.model || "");
    const separator = value.lastIndexOf(":");
    return separator > -1 ? value.slice(separator + 1) : value;
  }, [llmConfig.model]);

  const currentModeSkills = buildComposerSkills(skills.externalSkills);

  const handleSwitchToApi = useCallback(() => {
    const firstConfigured = llmConfig?.availableProviders?.find(
      (p) =>
        !cliAgentForProvider(p.id) && p.id !== PROVIDER_ID.CLI && p.configured,
    );
    const target = firstConfigured?.id || PROVIDER_ID.DEEPSEEK;
    setStoredLlmProvider(target);
    refreshLlmConfig();
    if (!firstConfigured) {
      onOpenSettings?.({ tab: "models" });
    }
  }, [llmConfig?.availableProviders, refreshLlmConfig, onOpenSettings]);

  // One right-anchored row: an open drawer takes the column to the LEFT of the
  // panel instead of covering the conversation. The row grows leftwards because
  // it is anchored by `right-2`, so the panel itself never moves. Nothing is
  // covered, so the stream and composer stay interactive while a drawer is open.
  return (
    <div className="pointer-events-none absolute bottom-2 right-2 top-[51px] z-50 flex max-w-[calc(100%_-_16px)] items-stretch justify-end gap-2">
      <AgentDrawers
        menus={menus}
        globalMem={globalMem}
        agentName={activeAgentName}
        agentColor={activeAgentColor}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        runs={runs}
        resumeRun={resumeRun}
        abandonRun={abandonRun}
        takeoverRun={takeoverRun}
        projectBrief={projectBrief}
        updateProjectBrief={updateProjectBrief}
        projectMemory={projectMemory}
        removeProjectMemoryItem={removeProjectMemoryItem}
        clearProjectMemory={clearProjectMemory}
      />

      <aside
        data-testid="agent-panel"
        onMouseEnter={handlePanelMouseEnter}
        onMouseLeave={handlePanelMouseLeave}
        className="pointer-events-auto relative flex w-[360px] max-w-full flex-col overflow-hidden rounded-2xl bg-neutral-900 text-neutral-100 shadow-panel"
      >
        <AgentPanelHeader
          menus={menus}
          hasRenderedItems={renderedItems.length > 0}
          handleNewChat={handleNewChat}
          onClose={onClose}
          isConfigured={isConfigured}
          modelDisplayName={modelDisplayName}
          llmConfig={llmConfig}
          setStoredLlmProvider={setStoredLlmProvider}
          setStoredLlmModel={setStoredLlmModel}
          refreshLlmConfig={refreshLlmConfig}
          onOpenSettings={onOpenSettings}
          sessionTitle={currentSessionTitle}
          agentName={activeAgentName}
          agentColor={activeAgentColor}
          runControls={{ runs, resumeRun, isRunning, cancel }}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <AgentMessageStream
            cli={cli}
            menus={menus}
            messagesScrollRef={messagesScrollRef}
            handleMessagesScroll={handleMessagesScroll}
            latestPlan={latestPlan}
            planReview={planReview}
            onResolvePlanReview={handleResolvePlanReview}
            isConfigured={isConfigured}
            isCli={isCli}
            onOpenSettings={onOpenSettings}
            onSwitchToApi={handleSwitchToApi}
            onSignIn={userLoggedIn ? null : () => openAuthModal("login")}
            renderedItems={renderedItems}
            activeMode={activeMode}
            handleSend={handleSubmit}
            onSelectPrompt={handleSelectPromptCard}
            reviews={reviews}
            resolveReview={resolveReview}
            getStore={getStore}
            isRunning={isRunning}
            messagesEndRef={messagesEndRef}
            agentName={activeAgentName}
            agentColor={activeAgentColor}
          />

          {showCreationTypes && (
            <div className="flex items-center gap-2 px-3 pb-2 pt-2">
              <div className="min-w-0 flex-1">
                <CreationTypePicker
                  value={creationType}
                  onChange={handleSelectCreationType}
                  disabled={isRunning}
                />
              </div>
            </div>
          )}
          <AgentComposer
            cards={cards}
            menus={menus}
            skills={skills}
            attach={attach}
            editorReferenceMode={showEditorIntent}
            isRunning={isRunning}
            availableModes={availableModes}
            activeMode={activeMode}
            currentModeSkills={currentModeSkills}
            handleSelectMode={handleSelectMode}
            handleSelectSkill={handleSelectSkill}
            isCodex={isCodex}
            reasoningSaveError={reasoningSaveError}
            setReasoningSaveError={setReasoningSaveError}
            llmConfig={llmConfig}
            selectedNodes={showEditorIntent ? [] : selectedNodes}
            storeImages={storeImages}
            storeThumbnails={storeThumbnails}
            handleUnlinkNode={handleUnlinkNode}
            textareaRef={textareaRef}
            inputText={inputText}
            setInputText={setInputText}
            selectedSkillIds={selectedSkillIds}
            onRemoveSkill={(skillId) =>
              setSelectedSkillIds((current) =>
                current.filter((id) => id !== skillId),
              )
            }
            handleKeyDown={handleKeyDown}
            isConfigured={isConfigured}
            budgetUsed={budgetUsed}
            tokenBudget={tokenBudget}
            agentSpeed={agentSpeed}
            setAgentSpeed={setAgentSpeed}
            refreshLlmConfig={refreshLlmConfig}
            handleSend={handleSubmit}
            sendDisabled={editorIntent.blocked}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </aside>
    </div>
  );
}
