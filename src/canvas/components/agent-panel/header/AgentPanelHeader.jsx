/* eslint-disable react/prop-types */
import {
  IconChevronDown,
  IconPanelRightClose,
  IconMessagePlus,
  ICON_STROKE_WIDTH,
} from "../../../icons.jsx";
import { useI18n } from "../../../use_i18n.js";

export default function AgentPanelHeader({
  menus,
  handleNewChat,
  onClose,
  sessionTitle = null,
  ...rest
}) {
  const historyOpen = rest.historyOpen ?? menus?.historyOpen;
  const setHistoryOpen = rest.setHistoryOpen ?? menus?.setHistoryOpen;
  // The brief/memory/brand-library/preferences drawers keep their open state
  // in useAgentMenus (AgentDrawers still renders them); the header only owns
  // dismissing them when the history session menu opens.
  const setBriefOpen = rest.setBriefOpen ?? menus?.setBriefOpen;
  const setMemoryOpen = rest.setMemoryOpen ?? menus?.setMemoryOpen;
  const setBrandLibraryOpen =
    rest.setBrandLibraryOpen ?? menus?.setBrandLibraryOpen;
  const setPreferencesOpen =
    rest.setPreferencesOpen ?? menus?.setPreferencesOpen;
  const { t } = useI18n();

  // The authoritative run state, already supplied by AgentPanel as `runControls.isRunning`. New Chat
  // is refused while a turn is in flight (the guard lives in useAgentSessions and is correct), so the
  // control has to SAY so. It kept rendering as fully enabled and clickable, which left the affordance
  // claiming an action the product refuses — measured in the ninth run as
  // `nativeDisabled=false aria-disabled=null enabled=true`.
  //
  // `aria-disabled` rather than the native `disabled` attribute, deliberately: the button stays
  // focusable and keeps receiving the click, so the refusal stays observable instead of the control
  // silently disappearing from the tab order mid-turn. `handleNewChat` is untouched — the guard is not
  // duplicated here.
  const isRunning = rest.runControls?.isRunning === true;

  const displayTitle = sessionTitle || t("agent.newChat");

  return (
    <header className="flex flex-col border-b border-white/[0.06] bg-transparent">
      {/* Session actions stay separate from the canvas toolbar. */}
      <div className="flex h-11 items-center justify-between px-3.5">
        {/* Left: Session Title Dropdown button */}
        <button
          type="button"
          onClick={() => {
            setHistoryOpen?.((v) => !v);
            setBriefOpen?.(false);
            setMemoryOpen?.(false);
            setBrandLibraryOpen?.(false);
            setPreferencesOpen?.(false);
          }}
          data-testid="agent-drawer-history"
          title={displayTitle}
          aria-label={t("agent.history")}
          className={`group flex items-center gap-1.5 min-w-0 max-w-[210px] rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
            historyOpen
              ? "bg-white/15 text-white"
              : "text-neutral-200 hover:bg-white/[0.08] hover:text-white"
          }`}
        >
          <span className="truncate">{displayTitle}</span>
          <IconChevronDown
            size={12}
            strokeWidth={ICON_STROKE_WIDTH}
            className={`shrink-0 text-neutral-400 transition-transform duration-200 ${
              historyOpen ? "rotate-180 text-white" : "group-hover:text-white"
            }`}
          />
        </button>

        {/* Right: New Chat + Collapse */}
        <div className="flex items-center gap-1 text-neutral-400">
          {/* New Chat icon button */}
          <button
            type="button"
            onClick={handleNewChat}
            title={t("agent.newChat")}
            aria-label={t("agent.newChat")}
            aria-disabled={isRunning ? "true" : undefined}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4] ${
              isRunning
                ? "cursor-not-allowed text-neutral-500"
                : "text-neutral-400 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <IconMessagePlus size={15} strokeWidth={ICON_STROKE_WIDTH} />
          </button>

          {/* Close / Collapse button */}
          <button
            type="button"
            data-testid="agent-collapse-sidebar"
            aria-label={t("agent.collapseSidebar")}
            title={t("agent.collapseSidebar")}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
          >
            <IconPanelRightClose size={15} strokeWidth={ICON_STROKE_WIDTH} />
          </button>
        </div>
      </div>
    </header>
  );
}
