/**
 * ToolCallCard — renders command_execution and mcp_tool_call items.
 *
 * Shows a compact card with tool name, status indicator, and expandable details.
 */

/* eslint-disable react/prop-types */
import { useState } from "react";
import { STATUS } from "./eventTypes.js";
import { useI18n } from "../../use_i18n.js";
import MessageCopyButton from "./message-copy-button.jsx";

export default function ToolCallCard({ item }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const isRunning = item.status === STATUS.IN_PROGRESS;
  const isSuccess = item.status === STATUS.COMPLETED;
  const isFailed = item.status === STATUS.FAILED;

  const statusClass = isRunning
    ? "agent-tool-card-running"
    : isSuccess
      ? "agent-tool-card-success"
      : isFailed
        ? "agent-tool-card-failed"
        : "";
  const copyText = [
    item.title || item.command || t("agent.system.toolCall"),
    item.arguments
      ? `${t("agent.system.arguments")}\n${JSON.stringify(item.arguments, null, 2)}`
      : null,
    item.externalWebsiteCostUnknown
      ? t("agent.cost.externalWebsiteUnknown")
      : null,
    item.result
      ? `${t("agent.system.result")}\n${JSON.stringify(item.result, null, 2)}`
      : null,
    item.error
      ? `${t("agent.system.error")}\n${
          typeof item.error === "string"
            ? item.error
            : JSON.stringify(item.error, null, 2)
        }`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className={`agent-tool-card group ${statusClass}`}>
      <button
        type="button"
        className="agent-tool-card-header"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="agent-tool-card-icon">
          {isRunning ? (
            <span className="agent-tool-spinner" />
          ) : isSuccess ? (
            "✓"
          ) : isFailed ? (
            "✗"
          ) : (
            "○"
          )}
        </span>
        <span className="agent-tool-card-title">
          {item.title || item.command || t("agent.system.toolCall")}
        </span>
        <span className="agent-tool-card-chevron">{expanded ? "▾" : "▸"}</span>
      </button>
      {item.externalWebsiteCostUnknown && (
        <p className="px-3 pb-2 text-[11px] text-amber-300">
          {t("agent.cost.externalWebsiteUnknown")}
        </p>
      )}
      <MessageCopyButton text={copyText} className="agent-tool-copy" />

      {expanded && (
        <div className="agent-tool-card-details">
          {item.arguments && (
            <div className="agent-tool-card-section">
              <span className="agent-tool-card-label">
                {t("agent.system.arguments")}
              </span>
              <pre className="agent-tool-card-code">
                {JSON.stringify(item.arguments, null, 2)}
              </pre>
            </div>
          )}
          {item.result && (
            <div className="agent-tool-card-section">
              <span className="agent-tool-card-label">
                {t("agent.system.result")}
              </span>
              <pre className="agent-tool-card-code">
                {JSON.stringify(item.result, null, 2)}
              </pre>
            </div>
          )}
          {item.error && (
            <div className="agent-tool-card-section agent-tool-card-error">
              <span className="agent-tool-card-label">
                {t("agent.system.error")}
              </span>
              <pre className="agent-tool-card-code">
                {typeof item.error === "string"
                  ? item.error
                  : JSON.stringify(item.error, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
