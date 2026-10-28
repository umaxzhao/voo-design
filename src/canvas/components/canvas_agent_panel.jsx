import { useDesignStore } from "../../store/design_store.js";
import { consumePendingAgentIntent, consumePendingGeneration } from "./pending_agent_intent.js";
import { generationContextText, generationBadgeText, placeReferenceImages } from "./welcome_dashboard/generation_intent.js";
import { resolveAgentProvider } from "../agent/agent_provider.js";
import { externalMcpTools } from "../agent/external_mcp_tools.js";
import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { ArrowUp, Check, ChevronDown, History, PanelLeft, Plus, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { getSetting, setSetting } from "../../shared/settings.js";
import { DEFAULT_AGENT_MODEL } from "../../shared/agent-defaults.js";
import { runAgentTurn } from "../agent/canvas_agent.js";
import { errorText } from "../error_text.js";
import { abortable } from "../agent/abortable.js";
import {
  AGENT_DEFAULTS,
  AGENT_SETTING,
  CANVAS_TOOL_SCHEMAS,
  executeCanvasTool,
} from "../agent/canvas_tools.js";
import { CHAT_ERROR, streamChatTurn } from "../agent/chat_stream.js";
import { isCliAgentModel, streamCliStep } from "../agent/cli_agent_step.js";
import {
  createEmptySession,
  createSessionId,
  deleteSessionFromList,
  loadStoredSessions,
  saveStoredSessions,
  upsertSession,
} from "../agent/session_history.js";
import { VooBrandLogo } from "../../app_title_bar.jsx";
import ToolCallCard from "./tool_call_card.jsx";
import { createUnmountGuard } from "./agent-panel/unmount_guard.js";

import {
  CLI_MODEL_GROUPS,
  availableModelGroups,
  getModelDisplayLabel,
} from "./agent-panel/model_catalog.js";

export { CLI_MODEL_GROUPS, getModelDisplayLabel };

/** Starter prompts shown on an empty conversation; each fills the composer. */
const SUGGESTION_KEYS = [
  "agent.panel.suggestion.poster",
  "agent.panel.suggestion.layers",
  "agent.panel.suggestion.palette",
];

/** Icon-only header control. The label doubles as the tooltip and accessible name. */
function HeaderButton({ label, onClick, active = false, expanded, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.08] hover:text-white ${
        active ? "bg-white/[0.08] text-white" : "text-neutral-400"
      }`}
    >
      {children}
    </button>
  );
}

HeaderButton.propTypes = {
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  active: PropTypes.bool,
  expanded: PropTypes.bool,
  children: PropTypes.node.isRequired,
};

/** Chat panel beside the editor frame: text in, canvas changes out, saved history. */
export default function CanvasAgentPanel({ onClose }) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState(() => loadStoredSessions());
  // Bootstrap once without an effect that calls changing session handlers.
  const initialSessionRef = useRef(null);
  if (!initialSessionRef.current) initialSessionRef.current = sessions[0] ?? createEmptySession();
  const [activeId, setActiveId] = useState(initialSessionRef.current.id);
  const [transcript, setTranscript] = useState(() => initialSessionRef.current.messages ?? []);
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [pipelineProgress, setPipelineProgress] = useState(null);
  const [directions, setDirections] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const directionChoice = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [configError, setConfigError] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [lastRequest, setLastRequest] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    () => getSetting(AGENT_SETTING.MODEL) || DEFAULT_AGENT_MODEL,
  );
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [activeContext, setActiveContext] = useState(null);
  const turnRef = useRef(null);
  // StrictMode runs effect cleanups once on a simulated unmount in development;
  // the guard makes sure only a real unmount aborts the in-flight turn.
  const unmountGuardRef = useRef(null);
  if (!unmountGuardRef.current) {
    unmountGuardRef.current = createUnmountGuard(() => {
      turnRef.current?.abort();
      directionChoice.current?.("auto");
      useDesignStore.setState({ agentGenerating: false });
    });
  }
  useEffect(() => {
    unmountGuardRef.current.mount();
    return () => unmountGuardRef.current.unmount();
  }, []);
  const historyRef = useRef(initialSessionRef.current.history ?? []);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const transcriptRef = useRef([]);
  transcriptRef.current = transcript;

  const persist = (session) => {
    const next = upsertSession(sessionsRef.current, session);
    sessionsRef.current = next;
    setSessions(next);
    saveStoredSessions(next);
  };

  const openSession = (session) => {
    if (turnRef.current) return;
    setCancelled(false);
    setLastRequest(null);
    setActiveId(session.id);
    setTranscript(session.messages ?? []);
    historyRef.current = session.history ?? [];
    setError(null);
    setHistoryOpen(false);
    setModelMenuOpen(false);
  };

  const startNewSession = () => {
    if (turnRef.current) return;
    const session = createEmptySession();
    setCancelled(false);
    setLastRequest(null);
    setActiveId(session.id);
    setTranscript([]);
    historyRef.current = [];
    setError(null);
    setHistoryOpen(false);
    setModelMenuOpen(false);
  };

  const handleSelectModel = (modelId) => {
    setSetting(AGENT_SETTING.MODEL, modelId);
    setSelectedModel(modelId);
    setModelMenuOpen(false);
  };

  const removeSession = (sessionId) => {
    if (turnRef.current) return;
    const next = deleteSessionFromList(sessionsRef.current, sessionId);
    sessionsRef.current = next;
    setSessions(next);
    saveStoredSessions(next);
    if (sessionId === activeId) {
      if (next[0]) openSession(next[0]);
      else startNewSession();
    }
  };

  useEffect(() => {
    const onProgress = (event) => {
      const statusLine = event.detail?.statusLine;
      if (!statusLine) return;
      setTranscript((prev) => {
        let target = -1;
        for (let index = prev.length - 1; index >= 0; index -= 1) {
          const item = prev[index];
          if (
            item.kind === "tool" &&
            item.call?.name === "generate_image_web" &&
            item.call.status === "in_progress"
          ) {
            target = index;
            break;
          }
        }
        if (target === -1) return prev;
        return prev.map((item, index) =>
          index === target ? { ...item, call: { ...item.call, statusLine } } : item,
        );
      });
    };
    window.addEventListener("voo:web-image-progress", onProgress);
    return () => window.removeEventListener("voo:web-image-progress", onProgress);
  }, []);

  const updateToolItem = (event) => {
    setTranscript((prev) => {
      const index = prev.findIndex((item) => item.kind === "tool" && item.call.id === event.id);
      const call = { ...event };
      if (index === -1) return [...prev, { kind: "tool", call }];
      return prev.map((item, i) => (i === index ? { kind: "tool", call: { ...item.call, ...call } } : item));
    });
  };

  const send = useCallback(
    async (overrideText, contextAttachment, recoveryRequest, generationIntent) => {
      const targetContext = contextAttachment !== undefined ? contextAttachment : activeContext;
      const text = (overrideText ?? input).trim();
      if (!text || busy || turnRef.current) return;
      const model = generationIntent?.modelId || selectedModel || getSetting(AGENT_SETTING.MODEL);
      if (generationIntent?.modelId && generationIntent.modelId !== selectedModel) {
        setSetting(AGENT_SETTING.MODEL, generationIntent.modelId);
        setSelectedModel(generationIntent.modelId);
      }
      const controller = new AbortController();
      turnRef.current = controller;
      useDesignStore.setState({ agentGenerating: true });
      setInput("");
      setError(null);
      setConfigError(false);
      setCancelled(false);
      setLastRequest(recoveryRequest ?? { text, context: targetContext, generation: generationIntent ?? null });
      setBusy(true);
      setStreamingText("");
      setCandidates([]);
      const variantCount = Math.max(1, Math.min(3, Number(generationIntent?.candidates) || 1));
      const sessionId = activeId ?? createSessionId();
      setActiveId(sessionId);
      const userItem = {
        kind: "text",
        role: "user",
        content: text,
        contextBadge: generationIntent
          ? generationBadgeText(generationIntent, getModelDisplayLabel(model))
          : (targetContext?.name ? `@${targetContext.name}` : undefined),
      };
      setTranscript((prev) => [...prev, userItem]);
      try {
        let promptWithContext = text;
        if (generationIntent) {
          promptWithContext = `${generationContextText(generationIntent)}\n${text}`;
          // Only the first attempt places references; a retry would duplicate them.
          const referenceNote = recoveryRequest ? "" : await placeReferenceImages(generationIntent.attachments);
          if (referenceNote) promptWithContext += `\n${referenceNote}`;
          controller.signal.throwIfAborted();
        } else if (targetContext?.name) {
          promptWithContext = `[Context: ${targetContext.name} (${targetContext.kind || "layer"}, id: ${targetContext.nodeId}${
            targetContext.width ? `, ${targetContext.width}x${targetContext.height}` : ""
          })]\n${text}`;
        }

        const provider = await abortable(() => resolveAgentProvider(model), controller.signal);
        const external = await abortable(() => externalMcpTools(), controller.signal);
        controller.signal.throwIfAborted();
        const reply = await runAgentTurn({
          signal: controller.signal,
          ...provider,
          maxSteps: Number(getSetting(AGENT_SETTING.MAX_STEPS)) || AGENT_DEFAULTS.maxSteps,
          styleNote: getSetting(AGENT_SETTING.STYLE_NOTE) ?? AGENT_DEFAULTS.styleNote,
          styleId: generationIntent?.styleId ?? null,
          sceneKind: generationIntent?.kind ?? null,
          designSystem: generationIntent?.designSystemContract ?? null,
          frame: generationIntent?.frame ?? null,
          variantCount,
          onVariant: (variant) => setCandidates((current) => [...current, variant]),
          history: historyRef.current,
          userText: promptWithContext,
          tools: [...CANVAS_TOOL_SCHEMAS, ...external.tools],
          executeTool: (name, args, context) => name.startsWith("mcp__") ? external.execute(name, args, context) : executeCanvasTool(name, args, context),
          onText: (text) => { if (!controller.signal.aborted) setStreamingText(text); },
          onProgress: setPipelineProgress,
          chooseDirection: variantCount > 1
            ? (choices, { variantIndex = 0 } = {}) =>
                Promise.resolve(choices[variantIndex % choices.length]?.id ?? "auto")
            : (choices, { signal } = {}) => new Promise((resolve, reject) => {
                setDirections(choices);
                const finish = choice => { clearTimeout(timer); signal?.removeEventListener('abort', abort); directionChoice.current = null; setDirections([]); resolve(choice); };
                const abort = () => { clearTimeout(timer); directionChoice.current = null; setDirections([]); reject(new DOMException('Aborted', 'AbortError')); };
                const timer = setTimeout(() => finish('auto'), 15000);
                directionChoice.current = finish;
                signal?.addEventListener('abort', abort, { once: true });
                if (signal?.aborted) abort();
              }),
          onToolEvent: updateToolItem,
        });
        controller.signal.throwIfAborted();
        const replyItem = { kind: "text", role: "assistant", content: reply };
        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: text },
          { role: "assistant", content: reply },
        ];
        const messages = [...transcriptRef.current, replyItem];
        setTranscript(messages);
        persist({
          id: sessionId,
          messages,
          history: historyRef.current,
          createdAt: Date.now(),
        });
      } catch (caught) {
        if (!controller.signal.aborted) {
          const code = caught?.code ?? caught?.message;
          const wantsConfig =
            code === CHAT_ERROR.NOT_CONFIGURED ||
            code === "agentNotConfigured" ||
            code === "agent.connection.desktopOnly";
          setConfigError(wantsConfig);
          setError(
            code === CHAT_ERROR.NOT_CONFIGURED
              ? t("agent.panel.notConfigured")
              : errorText({ code, message: caught?.message }),
          );
        }
      } finally {
        turnRef.current = null;
        useDesignStore.setState({ agentGenerating: false });
        if (controller.signal.aborted) {
          setCancelled(true);
          setTranscript((items) => items.map((item) => item.call?.status === "in_progress"
            ? { ...item, call: { ...item.call, status: "cancelled", statusLine: t("node.generate.cancelled") } }
            : item));
        }
        setStreamingText("");
        setBusy(false);
        setPipelineProgress(null);
        setDirections([]);
      }
    },
    [busy, input, activeId, activeContext, selectedModel, t],
  );

  const keepCandidate = useCallback(async (candidate) => {
    const others = candidates
      .map((item) => item.frameId)
      .filter((frameId) => frameId && frameId !== candidate.frameId);
    try {
      if (others.length) await executeCanvasTool("delete_layers", { layerIds: others }, {});
      setTranscript((prev) => [
        ...prev,
        { kind: "text", role: "assistant", content: t("agent.panel.variantKept", { n: candidate.index + 1 }) },
      ]);
    } catch (caught) {
      setError(errorText({ code: caught?.code ?? caught?.message, message: caught?.message }));
    } finally {
      setCandidates([]);
    }
  }, [candidates, t]);

  useEffect(() => {
    const consume = () => {
      if (busy) return;
      consumePendingGeneration(useDesignStore, (generation) => {
        setActiveContext(null);
        send(generation.prompt, null, undefined, generation);
      });
      consumePendingAgentIntent(useDesignStore, (prompt, context) => {
        if (context) setActiveContext(context);
        send(prompt, context);
      });
    };
    const unsubscribe = useDesignStore.subscribe(consume);
    consume();
    return unsubscribe;
  }, [busy, send]);

  // Listen for Pen-style contextual island prompts and panel open events
  useEffect(() => {
    const handleAgentPrompt = (event) => {
      const { prompt, context } = event.detail || {};
      if (context) {
        setActiveContext(context);
      }
      if (prompt && prompt.trim()) {
        send(prompt, context);
      }
    };
    const handleOpenPanel = (event) => {
      const { context } = event.detail || {};
      if (context) {
        setActiveContext(context);
      }
    };
    window.addEventListener("voo:agent-prompt", handleAgentPrompt);
    window.addEventListener("voo:open-agent-panel", handleOpenPanel);
    return () => {
      window.removeEventListener("voo:agent-prompt", handleAgentPrompt);
      window.removeEventListener("voo:open-agent-panel", handleOpenPanel);
    };
  }, [send]);

  const onSubmit = (event) => {
    event.preventDefault();
    send();
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const isEmpty = transcript.length === 0 && !busy;
  const activeTitle = sessions.find((session) => session.id === activeId)?.title;
  const currentModel = selectedModel || getSetting(AGENT_SETTING.MODEL);

  return (
    <section
      aria-label={t("agent.panel.title")}
      className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl bg-black text-neutral-100 shadow-panel"
    >
      <header className="flex h-12 items-center gap-2 px-4">
        {/* Same animated circular badge as the floating button in App.jsx. */}
        <span className="voo-ai-fab flex size-7 shrink-0 items-center justify-center rounded-full bg-[#E5B2FF]">
          <span className="voo-ai-fab-icon flex items-center justify-center">
            <VooBrandLogo className="size-4 text-black" />
          </span>
        </span>
        <h2 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-neutral-100">
          {activeTitle || t("agent.history.untitled")}
        </h2>
        {/* Model Selector Pill */}
        <button
          type="button"
          onClick={() => {
            setModelMenuOpen((open) => !open);
            setHistoryOpen(false);
          }}
          data-testid="agent-model-pill"
          aria-label={t("agent.panel.selectModel")}
          aria-expanded={modelMenuOpen}
          aria-haspopup="true"
          className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] text-neutral-300 transition-colors hover:bg-white/[0.12] focus:outline-none"
        >
          <span className="size-1.5 rounded-full bg-[#a7ffd4] animate-pulse" aria-hidden="true" />
          <span className="font-mono text-[9px] text-neutral-200 max-w-[160px] truncate font-medium">
            {getModelDisplayLabel(currentModel)}
          </span>
          <ChevronDown
            size={11}
            className={`text-neutral-400 transition-transform ${modelMenuOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        <HeaderButton
          label={t("agent.history.title")}
          onClick={() => {
            setHistoryOpen((value) => !value);
            setModelMenuOpen(false);
          }}
          active={historyOpen}
          expanded={historyOpen}
        >
          <History size={16} strokeWidth={1.5} aria-hidden="true" />
        </HeaderButton>
        <HeaderButton label={t("agent.history.new")} onClick={startNewSession}>
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
        </HeaderButton>
        <HeaderButton label={t("agent.panel.collapse")} onClick={onClose}>
          <PanelLeft size={16} strokeWidth={1.5} aria-hidden="true" />
        </HeaderButton>
      </header>

      {modelMenuOpen && (
        <div
          data-testid="agent-model-menu"
          aria-label={t("agent.panel.selectModel")}
          className="absolute inset-x-2 top-12 z-20 flex max-h-[70%] flex-col gap-2 overflow-y-auto rounded-2xl bg-[#171717] p-2.5 shadow-panel border border-white/10"
        >
          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-neutral-400 border-b border-white/[0.06]">
            <span>{t("agent.panel.selectModel")}</span>
            <button
              type="button"
              onClick={() => setModelMenuOpen(false)}
              className="rounded-lg p-0.5 text-neutral-500 hover:text-white"
              aria-label={t("agent.panel.collapse")}
            >
              <X size={12} />
            </button>
          </div>
          <div className="px-2 text-[11px] text-neutral-400">{t("agent.providers.hint")}</div>
          {availableModelGroups().length === CLI_MODEL_GROUPS.length && <p className="px-2 text-[11px] text-neutral-500">{t("agent.providers.customHint")}</p>}
          {availableModelGroups().map((group) => (
            <div key={group.cliId} className="flex flex-col gap-0.5">
              <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                {group.name}
              </div>
              {group.models.map((m) => {
                const isSelected = currentModel === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`model-option-${m.id}`}
                    onClick={() => handleSelectModel(m.id)}
                    aria-current={isSelected}
                    className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.08] ${
                      isSelected ? "bg-[#E5B2FF]/15 text-[#eed0ff] font-medium" : "text-neutral-300"
                    }`}
                  >
                    <span className="truncate">{m.label}</span>
                    {isSelected && <Check size={13} className="text-neutral-300 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {historyOpen && (
        <ul
          aria-label={t("agent.history.title")}
          className="absolute inset-x-2 top-12 z-10 flex max-h-[60%] flex-col gap-0.5 overflow-y-auto rounded-2xl bg-[#171717] p-2 shadow-panel"
        >
          {sessions.length === 0 && (
            <li className="px-2.5 py-3 text-[12px] text-neutral-400">{t("agent.history.empty")}</li>
          )}
          {sessions.map((session) => {
            const isActive = session.id === activeId;
            return (
              <li key={session.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openSession(session)}
                  aria-current={isActive}
                  className={`flex-1 truncate rounded-xl px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-white/[0.06] ${
                    isActive ? "bg-[#E5B2FF]/10 text-[#eed0ff]" : "text-neutral-300"
                  }`}
                >
                  {session.title || t("agent.history.untitled")}
                </button>
                <button
                  type="button"
                  onClick={() => removeSession(session.id)}
                  aria-label={t("agent.history.delete")}
                  title={t("agent.history.delete")}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  <X size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-2">
        {isEmpty ? (
          <div className="flex flex-1 flex-col justify-center gap-6">
            <div className="flex flex-col gap-4">
              {/* Large animated badge, the same mark as the floating button. */}
              <span className="voo-ai-fab flex size-14 items-center justify-center rounded-full bg-[#E5B2FF]">
                <span className="voo-ai-fab-icon flex items-center justify-center">
                  <VooBrandLogo className="size-7 text-black" />
                </span>
              </span>
              <h3 className="text-[15px] text-neutral-200">{t("agent.panel.emptyTitle")}</h3>
            </div>
            <ul className="flex flex-col gap-2">
              {SUGGESTION_KEYS.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setInput(t(key))}
                    className="w-full truncate rounded-xl bg-white/[0.06] px-3.5 py-2.5 text-left text-[12px] text-neutral-300 transition-colors hover:bg-white/[0.1] hover:text-white"
                  >
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-[12px] leading-relaxed text-neutral-500">{t("agent.panel.emptyHint")}</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {transcript.map((item, index) =>
              item.kind === "tool" ? (
                <li key={item.call.id ?? index} className="max-w-[92%]">
                  <ToolCallCard call={item.call} />
                </li>
              ) : (
                <li
                  key={index}
                  className={
                    item.role === "user"
                      ? "max-w-[85%] self-end rounded-2xl rounded-br-md bg-[#262626] px-3.5 py-2.5 text-[12px] leading-relaxed text-neutral-100"
                      : "max-w-[92%] self-start rounded-2xl rounded-bl-md bg-[#141414] px-3.5 py-2.5 text-[12px] leading-relaxed text-neutral-200"
                  }
                >
                  {item.contextBadge && (
                    <div className="mb-1.5 inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-neutral-300">
                      {item.contextBadge}
                    </div>
                  )}
                  <div>{item.content}</div>
                </li>
              ),
            )}
            {directions.length > 0 && (
              <li className="flex flex-wrap gap-1.5" aria-label="Visual directions">
                {directions.map(direction => (
                  <button key={direction.id} type="button" title={`${direction.mood} — ${direction.layoutIdea}`} onClick={() => directionChoice.current?.(direction.id)} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-neutral-200 hover:bg-white/10">
                    {direction.name}
                  </button>
                ))}
              </li>
            )}
            {busy && (
              <li className="flex items-center gap-2 text-[12px] text-neutral-400">
                <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[#E5B2FF]" aria-hidden="true" />
                {pipelineProgress ? `${pipelineProgress.stage} · ${pipelineProgress.status}` : streamingText || t("agent.panel.busy")}
              </li>
            )}
          </ol>
        )}
      </div>

      {candidates.length > 1 && !busy && (
        <div className="mx-4 mb-2 rounded-xl bg-white/[0.04] p-2">
          <p className="mb-1 text-[11px] text-neutral-400">{t("agent.panel.variantsTitle")}</p>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((candidate) => (
              <button
                key={`${candidate.index}:${candidate.frameId ?? "?"}`}
                type="button"
                onClick={() => keepCandidate(candidate)}
                className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] text-neutral-200 transition-colors hover:bg-[#E5B2FF]/20 hover:text-white"
              >
                {t("agent.panel.keepVariant", { n: candidate.index + 1 })}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pen App Style Context Attachment Badge */}
      {activeContext && (
        <div className="flex items-center gap-1.5 px-4 pt-1 pb-1">
          <span
            data-testid="agent-context-badge"
            className="flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-neutral-300"
          >
            <span>@{activeContext.name || activeContext.kind}</span>
            <button
              type="button"
              data-testid="agent-context-detach"
              onClick={() => setActiveContext(null)}
              className="text-neutral-400 hover:text-white"
              aria-label="Remove context"
            >
              ✕
            </button>
          </span>
          {activeContext.width && activeContext.height && (
            <span className="text-[10px] text-neutral-500 font-mono">
              {activeContext.width} × {activeContext.height}
            </span>
          )}
        </div>
      )}

      {!busy && cancelled && (
        <p role="status" className="mx-4 mb-2 text-[12px] text-neutral-400">{t("agent.panel.cancelled")}</p>
      )}
      {!busy && lastRequest && (
        <div className="mx-4 mb-2 flex gap-2 text-[12px]">
          <button type="button" className="rounded-lg px-3 py-2 text-neutral-300 hover:bg-white/10"
            onClick={() => send(lastRequest.text, lastRequest.context, undefined, lastRequest.generation)}>{t("agent.panel.retry")}</button>
          {cancelled && <button type="button" className="rounded-lg px-3 py-2 text-neutral-300 hover:bg-white/10"
            onClick={() => send(`${lastRequest.text}\n\n${t("agent.panel.resumePrompt")}`, lastRequest.context, lastRequest, lastRequest.generation)}>{t("agent.panel.resume")}</button>}
        </div>
      )}
      {error && (
        <div role="alert" className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-[12px] text-rose-400">
          <span className="min-w-0 flex-1">{error}</span>
          {configError && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("voo:open-onboarding"))}
              className="shrink-0 rounded-lg bg-rose-500/15 px-2.5 py-1 text-rose-200 transition-colors hover:bg-rose-500/25"
            >
              {t("agent.panel.configureAgent")}
            </button>
          )}
        </div>
      )}
      <form onSubmit={onSubmit} className="prompt-composer agent-composer relative mx-3 mb-3 rounded-2xl p-3">
        <textarea
          aria-label={t("agent.panel.placeholder")}
          placeholder={t("agent.panel.placeholder")}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          className="w-full resize-none bg-transparent text-xs leading-relaxed text-neutral-100 placeholder-neutral-400 focus:outline-none"
        />
        <div className="flex items-center gap-2 pt-2">
          <span className="min-w-0 flex-1" aria-hidden="true" />
          {currentModel && (
            <button
              type="button"
              onClick={() => {
                setModelMenuOpen((open) => !open);
                setHistoryOpen(false);
              }}
              title={currentModel}
              data-testid="agent-composer-model-pill"
              className="max-w-[220px] truncate rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] text-neutral-400 hover:bg-white/[0.1] hover:text-neutral-200 transition-colors"
            >
              {getModelDisplayLabel(currentModel)}
            </button>
          )}
          {busy && (
            <button
              type="button"
              onClick={() => turnRef.current?.abort()}
              data-testid="agent-cancel"
              className="rounded-lg px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10"
            >
              {t("agent.plan.review.cancel")}
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={t("agent.panel.send")}
            title={t("agent.panel.send")}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E5B2FF] text-black transition-colors hover:bg-[#eed0ff] disabled:opacity-40"
          >
            <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </form>
    </section>
  );
}

CanvasAgentPanel.propTypes = {
  onClose: PropTypes.func,
};
