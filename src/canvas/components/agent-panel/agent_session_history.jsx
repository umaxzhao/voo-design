import PropTypes from "prop-types";
import { Check, Pencil, X } from "lucide-react";

/** Saved-session presentation stays separate from the live composer. */
export default function AgentSessionHistory({
  t, sessions, activeId, openSession, removeSession,
  renamingSessionId, renameDraft, setRenameDraft, setRenamingSessionId, renameSession,
}) {
  return (
    <ul
      aria-label={t("agent.history.title")}
      className="absolute inset-x-2 top-12 z-10 flex max-h-[60%] flex-col gap-0.5 overflow-y-auto rounded-2xl border border-white/[0.06] bg-[#171717] p-2 shadow-panel"
    >
      {sessions.length === 0 && (
        <li className="px-2.5 py-3 text-[12px] text-neutral-400">{t("agent.history.empty")}</li>
      )}
      {sessions.map((session) => {
        const isActive = session.id === activeId;
        return (
          <li key={session.id} className="group flex items-center gap-1">
            {renamingSessionId === session.id ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  renameSession(session.id, renameDraft);
                }}
              >
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  aria-label={t("agent.history.rename")}
                  className="h-8 min-w-0 flex-1 rounded-lg bg-white/[0.06] px-2 text-[12px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]/50"
                />
                <button type="submit" aria-label={t("agent.history.saveName")} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white">
                  <Check size={14} aria-hidden="true" />
                </button>
                <button type="button" aria-label={t("agent.history.cancelRename")} onClick={() => setRenamingSessionId(null)} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white">
                  <X size={14} aria-hidden="true" />
                </button>
              </form>
            ) : (
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
            )}
            {renamingSessionId !== session.id && (
              <button
                type="button"
                onClick={() => {
                  setRenamingSessionId(session.id);
                  setRenameDraft(session.title || "");
                }}
                aria-label={t("agent.history.rename")}
                title={t("agent.history.rename")}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:text-white group-hover:text-neutral-400"
              >
                <Pencil size={13} aria-hidden="true" />
              </button>
            )}
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
  );
}

AgentSessionHistory.propTypes = {
  t: PropTypes.func.isRequired,
  sessions: PropTypes.array.isRequired,
  activeId: PropTypes.string,
  openSession: PropTypes.func.isRequired,
  removeSession: PropTypes.func.isRequired,
  renamingSessionId: PropTypes.string,
  renameDraft: PropTypes.string,
  setRenameDraft: PropTypes.func.isRequired,
  setRenamingSessionId: PropTypes.func.isRequired,
  renameSession: PropTypes.func.isRequired,
};
