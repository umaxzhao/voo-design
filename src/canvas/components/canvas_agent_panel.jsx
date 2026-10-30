import { useDesignStore } from "../../store/design_store.js";
import { consumePendingAgentIntent, consumePendingGeneration } from "./pending_agent_intent.js";
import { generationContextText, generationBadgeText, referenceImageContext } from "./welcome_dashboard/generation_intent.js";
import { resolveAgentProvider } from "../agent/agent_provider.js";
import { externalMcpTools } from "../agent/external_mcp_tools.js";
import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import AgentPanelView from "./agent-panel/agent_panel_view.jsx";
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
import { createUnmountGuard } from "./agent-panel/unmount_guard.js";
import {
  CLI_MODEL_GROUPS,
  availableModelGroups,
  getModelDisplayLabel,
  getModelDisplayParts,
} from "./agent-panel/model_catalog.js";
export { CLI_MODEL_GROUPS, getModelDisplayLabel, getModelDisplayParts };
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
          ? { label: generationBadgeText(generationIntent), modelId: model }
          : (targetContext?.name ? `@${targetContext.name}` : undefined),
      };
      setTranscript((prev) => [...prev, userItem]);
      try {
        let promptWithContext = text;
        if (generationIntent) {
          promptWithContext = `${generationContextText(generationIntent)}\n${text}`;
          const referenceNote = referenceImageContext(generationIntent.attachments);
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
          visualReferences: generationIntent?.attachments
            ?.filter((attachment) => attachment?.kind === "image" && attachment.dataUrl)
            .map((attachment) => ({ name: attachment.name, dataUrl: attachment.dataUrl })) ?? [],
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
  const modelGroups = availableModelGroups();
  return <AgentPanelView {...{
    t, activeTitle, historyOpen, setHistoryOpen, setModelMenuOpen,
    startNewSession, onClose, modelMenuOpen, modelGroups, currentModel,
    handleSelectModel, sessions, activeId, openSession, removeSession,
    isEmpty, setInput, transcript, directions, directionChoice, busy,
    pipelineProgress, streamingText, candidates, keepCandidate,
    activeContext, setActiveContext, cancelled, lastRequest, send,
    error, configError, onSubmit, input, onKeyDown, turnRef
  }} />;
}
CanvasAgentPanel.propTypes = { onClose: PropTypes.func };
