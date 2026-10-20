/**
 * MessageBubble — renders agent_message, reasoning, and error items.
 */

/* eslint-disable react/prop-types */
import { ITEM_TYPE, STATUS } from "./eventTypes.js";
import { useI18n } from "../../use_i18n.js";
import {
  agentErrorSettingsTarget,
  formatAgentErrorText,
  isInsufficientCreditsError,
} from "./agentErrorText.js";
import MessageCopyButton from "./message-copy-button.jsx";
import RichMessageText from "./rich-message-text.jsx";
import InfoHint from "../info_hint.jsx";

export default function MessageBubble({ item, onOpenSettings }) {
  const { t } = useI18n();
  const itemText = String(item.text || "");

  if (item.type === ITEM_TYPE.USER_MESSAGE) {
    if (!itemText.trim()) return null;
    return (
      <div className="agent-msg agent-msg-user">
        <div className="agent-msg-bubble agent-msg-bubble-user group">
          <MessageCopyButton text={itemText} />
          <RichMessageText text={itemText} />
        </div>
      </div>
    );
  }

  if (item.type === ITEM_TYPE.AGENT_MESSAGE) {
    // Tool-only model turns contain no prose. Rendering their empty streaming
    // shell produced the small blank bubbles seen between real messages.
    if (!itemText.trim()) return null;
    return (
      <div className="agent-msg agent-msg-assistant">
        <div className="agent-msg-bubble agent-msg-bubble-assistant group">
          <MessageCopyButton text={itemText} />
          <RichMessageText text={itemText} />
          {item.status === STATUS.IN_PROGRESS && (
            <span className="agent-msg-cursor" />
          )}
        </div>
      </div>
    );
  }

  if (item.type === ITEM_TYPE.REASONING) {
    if (!itemText.trim()) return null;
    return (
      <div className="agent-msg agent-msg-assistant">
        <div className="agent-msg-bubble agent-msg-bubble-reasoning group">
          <MessageCopyButton text={itemText} />
          <span className="agent-msg-label">{t("agent.system.reasoning")}</span>
          <RichMessageText text={itemText} />
        </div>
      </div>
    );
  }

  if (item.type === ITEM_TYPE.ERROR) {
    // Payment failures expose only their known cause and credit amounts.
    const errorText = `⚠ ${formatAgentErrorText(item, t)}`;
    const settingsTab = agentErrorSettingsTarget(item);
    const isInsufficient = isInsufficientCreditsError(item);
    return (
      <div className="agent-msg agent-msg-assistant">
        <div
          role="alert"
          className="agent-msg-bubble agent-msg-bubble-error group"
        >
          <MessageCopyButton text={errorText} />
          <RichMessageText text={errorText} />
          {(isInsufficient || (settingsTab && onOpenSettings)) && (
            <div className="mt-2 flex items-center gap-2">
              {isInsufficient && (
                <button
                  type="button"
                  data-testid="agent-error-recharge"
                  onClick={() => {
                    if (onOpenSettings) {
                      onOpenSettings({ tab: "general", section: "recharge" });
                    } else {
                      window.dispatchEvent(
                        new CustomEvent("voo:open-settings"),
                      );
                      window.dispatchEvent(
                        new CustomEvent("voo:navigate-settings-tab", {
                          detail: "general",
                        }),
                      );
                    }
                    setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent("voo:scroll-to-recharge"),
                      );
                    }, 150);
                  }}
                  className="rounded-lg bg-white px-3 py-2 text-[11px] font-medium text-black hover:bg-neutral-200 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
                >
                  {t("credits.goToRecharge")}
                </button>
              )}
              {settingsTab && onOpenSettings ? (
                <button
                  type="button"
                  data-testid="agent-error-open-models"
                  onClick={() => onOpenSettings({ tab: settingsTab })}
                  className="rounded-lg bg-white/[0.08] px-3 py-2 text-[11px] text-neutral-200 hover:bg-white/[0.12] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]/40"
                >
                  {t("agent.error.openModelSettings")}
                </button>
              ) : null}
            </div>
          )}
          {/* Only failures whose cause needs a paragraph carry `hintKey`;
              the sentence above stays the terse cause-plus-action line. */}
          {item.hintKey && <InfoHint label="" text={t(item.hintKey)} />}
        </div>
      </div>
    );
  }

  return null;
}
