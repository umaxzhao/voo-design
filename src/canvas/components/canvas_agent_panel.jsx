import { customModelGroups, resolveAgentProvider } from "../agent/agent_provider.js";
import { externalMcpTools } from "../agent/external_mcp_tools.js";
import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { ArrowUp, Check, ChevronDown, History, PanelLeft, Plus, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { getSetting, setSetting } from "../../shared/settings.js";
import { DEFAULT_AGENT_MODEL } from "../../shared/agent-defaults.js";
import { runAgentTurn } from "../agent/canvas_agent.js";
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

/** Available CLI agent model groups for selection */
export const CLI_MODEL_GROUPS = [
  {
    cliId: "claude",
    name: "Claude Code",
    models: [
      { id: "claude:claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude:sonnet", label: "Claude Sonnet" },
      { id: "claude:haiku", label: "Claude Haiku" },
      { id: "claude:opus", label: "Claude Opus" },
      { id: "claude:best", label: "Claude Best" },
      { id: "claude:default", label: "Claude Default" },
    ],
  },
  {
    cliId: "codex",
    name: "Codex",
    models: [
      { id: "codex:gpt-6-astra", label: "GPT-6 Astra" },
      { id: "codex:gpt-5.6-terra", label: "GPT-5.6 Terra" },
      { id: "codex:gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { id: "codex:gpt-5.6-luna", label: "GPT-5.6 Luna" },
    ],
  },
  {
    cliId: "antigravity",
    name: "Antigravity",
    models: [
      { id: "antigravity:gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
      { id: "antigravity:gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
      { id: "antigravity:gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" },
      { id: "antigravity:claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
      { id: "antigravity:claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)" },
      { id: "antigravity:gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
    ],
  },
];

export function getModelDisplayLabel(modelId) {
  if (!modelId) return "Flash";
  for (const group of CLI_MODEL_GROUPS) {
    for (const m of group.models) {
      if (m.id === modelId) {
        return `${group.name} · ${m.label.replace(/^Claude\s+|Gemini\s+/, "")}`;
      }
    }
  }
  for (const group of customModelGroups()) {
    const model = group.models.find(model => model.id === modelId);
    if (model) return `${group.name} · ${model.label}`;
  }
  const parts = String(modelId).split(":");
  if (parts.length >= 2) {
    const cli = parts[0];
    const rest = parts.slice(1).join(":");
    return `${cli.charAt(0).toUpperCase() + cli.slice(1)} · ${rest}`;
  }
  return modelId;
}

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
  const [activeId, setActiveId] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [pipelineProgress, setPipelineProgress] = useState(null);
  const [directions, setDirections] = useState([]);
  const directionChoice = useRef(null);
  useEffect(() => () => directionChoice.current?.('auto'), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    () => getSetting(AGENT_SETTING.MODEL) || DEFAULT_AGENT_MODEL,
  );
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [activeContext, setActiveContext] = useState(null);
  const historyRef = useRef([]);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const transcriptRef = useRef([]);
  transcriptRef.current = transcript;

  // Start on the most recent saved conversation, or a fresh one.
  useEffect(() => {
    const [latest] = sessionsRef.current;
    if (latest) openSession(latest);
    else startNewSession();
    // Runs once on mount; the handlers below read state through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (session) => {
    const next = upsertSession(sessionsRef.current, session);
    sessionsRef.current = next;
    setSessions(next);
    saveStoredSessions(next);
  };

  const openSession = (session) => {
    setActiveId(session.id);
    setTranscript(session.messages ?? []);
    historyRef.current = session.history ?? [];
    setError(null);
    setHistoryOpen(false);
    setModelMenuOpen(false);
  };

  const startNewSession = () => {
    const session = createEmptySession();
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
    async (overrideText, contextAttachment) => {
      const targetContext = contextAttachment !== undefined ? contextAttachment : activeContext;
      const text = (overrideText ?? input).trim();
      if (!text || busy) return;
      setInput("");
      setError(null);
      setBusy(true);
      setStreamingText("");
      const sessionId = activeId ?? createSessionId();
      setActiveId(sessionId);
      const userItem = {
        kind: "text",
        role: "user",
        content: text,
        contextBadge: targetContext?.name ? `@${targetContext.name}` : undefined,
      };
      setTranscript((prev) => [...prev, userItem]);
      try {
        const promptWithContext = targetContext?.name
          ? `[Context: ${targetContext.name} (${targetContext.kind || "layer"}, id: ${targetContext.nodeId}${
              targetContext.width ? `, ${targetContext.width}x${targetContext.height}` : ""
            })]\n${text}`
          : text;

        const model = selectedModel || getSetting(AGENT_SETTING.MODEL);
        const provider = await resolveAgentProvider(model);
        const external = await externalMcpTools();
        const reply = await runAgentTurn({
          ...provider,
          maxSteps: Number(getSetting(AGENT_SETTING.MAX_STEPS)) || AGENT_DEFAULTS.maxSteps,
          styleNote: getSetting(AGENT_SETTING.STYLE_NOTE) ?? AGENT_DEFAULTS.styleNote,
          history: historyRef.current,
          userText: promptWithContext,
          tools: [...CANVAS_TOOL_SCHEMAS, ...external.tools],
          executeTool: (name, args) => name.startsWith("mcp__") ? external.execute(name, args) : executeCanvasTool(name, args),
          onText: setStreamingText,
          onProgress: setPipelineProgress,
          chooseDirection: (choices, { signal } = {}) => new Promise((resolve, reject) => {
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
        setError(caught?.code === CHAT_ERROR.NOT_CONFIGURED ? "notConfigured" : "failed");
      } finally {
        setStreamingText("");
        setBusy(false);
        setPipelineProgress(null);
        setDirections([]);
      }
    },
    [busy, input, activeId, activeContext, selectedModel],
  );

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
        <span className="voo-ai-fab flex size-7 shrink-0 items-center justify-center rounded-full">
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
          <span className="font-mono text-[9px] text-neutral-200 max-w-[100px] truncate font-medium">
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
          {customModelGroups().length === 0 && <p className="px-2 text-[11px] text-neutral-500">{t("agent.providers.customHint")}</p>}
          {[...CLI_MODEL_GROUPS, ...customModelGroups()].map((group) => (
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
                    {isSelected && <Check size={13} className="text-[#E5B2FF] shrink-0 ml-2" />}
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
              <span className="voo-ai-fab flex size-14 items-center justify-center rounded-full">
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
                    <div className="mb-1.5 inline-flex items-center gap-1 rounded-md bg-[#a7ffd4]/15 px-1.5 py-0.5 text-[10px] font-mono text-[#a7ffd4]">
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
                  <button key={direction.id} type="button" title={`${direction.mood} — ${direction.layoutIdea}`} onClick={() => directionChoice.current?.(direction.id)} className="rounded-full border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-200 hover:border-purple-300">
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

      {/* Pen App Style Context Attachment Badge */}
      {activeContext && (
        <div className="flex items-center gap-1.5 px-4 pt-1 pb-1">
          <span
            data-testid="agent-context-badge"
            className="flex items-center gap-1 rounded-md bg-[#a7ffd4]/15 px-2 py-0.5 text-[10px] font-mono text-[#a7ffd4]"
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

      {error && (
        <p role="alert" className="mx-4 mb-2 rounded-xl bg-[#E5B2FF]/10 px-3 py-2 text-[12px] text-[#eed0ff]">
          {t(`agent.panel.${error}`)}
        </p>
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
              className="max-w-[150px] truncate rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] text-neutral-400 hover:bg-white/[0.1] hover:text-neutral-200 transition-colors"
            >
              {getModelDisplayLabel(currentModel)}
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
