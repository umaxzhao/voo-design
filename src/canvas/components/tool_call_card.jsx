import { useState } from "react";
import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";

const STATUS_MARK = { in_progress: "…", completed: "✓", failed: "✗" };

/** Error codes the assistant and its tools raise, mapped to message keys. */
const KNOWN_ERRORS = new Set([
  "agentNoEditor",
  "agentNoImageModel",
  "agentNotConfigured",
  "agentHttpError",
  "agentStepLimit",
  "generateImageFailed",
  "generateImageTimeout",
  "generateImageNoResult",
  "providerNotConfigured",
  "toolFailed",
]);

/** Readable text for a known error code; anything else is shown as it came. */
function errorText(t, error) {
  if (typeof error === "string" && KNOWN_ERRORS.has(error)) return t(`agent.error.${error}`);
  return typeof error === "string" ? error : JSON.stringify(error, null, 2);
}

/** One tool call from the assistant: name, status, and expandable arguments and result. */
export default function ToolCallCard({ call }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const failed = call.status === "failed";

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-[12px] ${
        failed ? "border-[#E5B2FF]/40 text-[#eed0ff]" : "border-white/[0.06] text-neutral-300"
      }`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span aria-hidden="true">{STATUS_MARK[call.status] ?? "○"}</span>
        <span className="flex-1 truncate">{call.name}</span>
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          <Section label={t("agent.system.arguments")} value={call.arguments} />
          {call.result !== undefined && (
            <Section label={t("agent.system.result")} value={call.result} />
          )}
          {call.error && (
            <Section label={t("agent.system.error")} value={errorText(t, call.error)} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, value }) {
  return (
    <div>
      <span className="text-[11px] text-neutral-400">{label}</span>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#0c0c0c] p-2 text-[11px] text-neutral-300">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

ToolCallCard.propTypes = {
  call: PropTypes.shape({
    name: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    arguments: PropTypes.any,
    result: PropTypes.any,
    error: PropTypes.any,
  }).isRequired,
};

Section.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.any,
};
