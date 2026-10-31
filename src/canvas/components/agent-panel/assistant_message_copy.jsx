import { useState } from "react";
import PropTypes from "prop-types";
import { Check, Copy } from "lucide-react";

export default function AssistantMessageCopy({ content, t }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      aria-label={t("agent.message.copy")}
      title={failed ? t("agent.message.copyFailed") : copied ? t("agent.message.copied") : t("agent.message.copy")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(content ?? ""));
          setCopied(true);
          setFailed(false);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setFailed(true);
        }
      }}
      className="mt-1 inline-flex size-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/[0.08] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]"
    >
      {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {failed ? t("agent.message.copyFailed") : copied ? t("agent.message.copied") : ""}
      </span>
    </button>
  );
}

AssistantMessageCopy.propTypes = {
  content: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  t: PropTypes.func.isRequired,
};
