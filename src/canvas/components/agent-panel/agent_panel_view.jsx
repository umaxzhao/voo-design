import { useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { ArrowUp, History, PanelLeft, Plus, X } from "lucide-react";
import { VooBrandLogo } from "../../../app_title_bar.jsx";
import ToolCallCard from "../tool_call_card.jsx";
import AgentModelLabel from "./agent_model_label.jsx";
import AgentModelMenu from "./agent_model_menu.jsx";

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

/** Presentation for the agent conversation and its single model-picker entry. */
export default function AgentPanelView({
  t, activeTitle, historyOpen, setHistoryOpen, setModelMenuOpen,
  startNewSession, onClose, modelMenuOpen, modelGroups, currentModel,
  handleSelectModel, sessions, activeId, openSession, removeSession,
  isEmpty, setInput, transcript, directions, directionChoice, busy,
  pipelineProgress, streamingText, candidates, keepCandidate,
  activeContext, setActiveContext, cancelled, lastRequest, send,
  error, configError, onSubmit, input, onKeyDown, turnRef
}) {
  const composerRef = useRef(null);
  const modelTriggerRef = useRef(null);
  const closeModelMenu = useCallback(() => setModelMenuOpen(false), [setModelMenuOpen]);
  return (
    <section
      aria-label={t("agent.panel.title")}
      className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl bg-black text-neutral-100 shadow-panel"
    >
      <header className="flex h-12 items-center gap-2 px-4">
        <h2 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-neutral-100">
          {activeTitle || t("agent.history.untitled")}
        </h2>
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
                      {typeof item.contextBadge === "string" ? item.contextBadge : (
                        <>
                          <span>{item.contextBadge.label}</span>
                          <AgentModelLabel modelId={item.contextBadge.modelId} size={10} />
                        </>
                      )}
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
      <form ref={composerRef} onSubmit={onSubmit} className="prompt-composer agent-composer relative mx-3 mb-3 rounded-2xl p-3">
        {modelMenuOpen && (
          <AgentModelMenu currentModel={currentModel} groups={modelGroups}
            onSelect={handleSelectModel} onClose={closeModelMenu}
            triggerRef={modelTriggerRef} composerRef={composerRef} />
        )}
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
              ref={modelTriggerRef}
              title={currentModel}
              aria-label={t("agent.panel.selectModel")}
              aria-haspopup="menu"
              aria-expanded={modelMenuOpen}
              aria-controls={modelMenuOpen ? "agent-model-menu" : undefined}
              data-testid="agent-composer-model-pill"
              className="max-w-[220px] truncate rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] text-neutral-400 hover:bg-white/[0.1] hover:text-neutral-200 transition-colors"
            >
              <AgentModelLabel modelId={currentModel} size={12} />
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

AgentPanelView.propTypes = {
  t: PropTypes.func.isRequired,
  activeTitle: PropTypes.string,
  historyOpen: PropTypes.bool,
  setHistoryOpen: PropTypes.func.isRequired,
  setModelMenuOpen: PropTypes.func.isRequired,
  startNewSession: PropTypes.func.isRequired,
  onClose: PropTypes.func,
  modelMenuOpen: PropTypes.bool,
  modelGroups: PropTypes.array.isRequired,
  currentModel: PropTypes.string,
  handleSelectModel: PropTypes.func.isRequired,
  sessions: PropTypes.array.isRequired,
  activeId: PropTypes.string,
  openSession: PropTypes.func.isRequired,
  removeSession: PropTypes.func.isRequired,
  isEmpty: PropTypes.bool,
  setInput: PropTypes.func.isRequired,
  transcript: PropTypes.array.isRequired,
  directions: PropTypes.array.isRequired,
  directionChoice: PropTypes.object.isRequired,
  busy: PropTypes.bool,
  pipelineProgress: PropTypes.object,
  streamingText: PropTypes.string,
  candidates: PropTypes.array.isRequired,
  keepCandidate: PropTypes.func.isRequired,
  activeContext: PropTypes.object,
  setActiveContext: PropTypes.func.isRequired,
  cancelled: PropTypes.bool,
  lastRequest: PropTypes.object,
  send: PropTypes.func.isRequired,
  error: PropTypes.string,
  configError: PropTypes.bool,
  onSubmit: PropTypes.func.isRequired,
  input: PropTypes.string,
  onKeyDown: PropTypes.func.isRequired,
  turnRef: PropTypes.object.isRequired,
};
