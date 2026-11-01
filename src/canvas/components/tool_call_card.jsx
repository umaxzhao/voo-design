import { useState } from "react";
import PropTypes from "prop-types";
import { Ban, Check, ChevronDown, ChevronRight, Circle, LoaderCircle, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";

const STATUS_ICON = {
  in_progress: LoaderCircle,
  completed: Check,
  failed: X,
  cancelled: Ban,
};

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
  "needsDesktopApp",
  "extensionNotLinked",
  "loginRequired",
  "composerMissing",
  "chromeLaunchFailed",
  "timeout",
  "noImages",
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
  const StatusIcon = STATUS_ICON[call.status] ?? Circle;
  const ExpandIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={`rounded-xl px-3 py-2 text-[12px] ${
        failed ? "bg-rose-500/10 text-rose-300" : "bg-white/[0.04] text-neutral-300"
      }`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]"
      >
        <StatusIcon size={14} className={call.status === "in_progress" ? "animate-spin" : ""} aria-hidden="true" />
        <span className="flex-1 truncate">{call.name}</span>
        <ExpandIcon size={13} aria-hidden="true" />
      </button>
      {call.statusLine && (
        <p className="mt-1 pl-5 text-[11px] text-neutral-400">{call.statusLine}</p>
      )}
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
    statusLine: PropTypes.string,
    result: PropTypes.any,
    error: PropTypes.any,
  }).isRequired,
};

Section.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.any,
};
