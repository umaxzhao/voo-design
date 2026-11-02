import { useState } from "react";
import PropTypes from "prop-types";
import { Check, Copy } from "lucide-react";

/** Per-message copy affordance for assistant replies. */
export default function AssistantMessageCopy({ content, t }) {
  const [status, setStatus] = useState("idle");

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(String(content ?? ""));
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="mt-1.5 flex min-h-6 items-center justify-end gap-1.5">
      <span aria-live="polite" className="text-[10px] text-neutral-500">
        {status === "copied" ? t("agent.panel.copied") : status === "failed" ? t("agent.panel.copyFailed") : ""}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={t("agent.panel.copy")}
        title={t("agent.panel.copy")}
        className="flex size-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/[0.08] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]/50"
      >
        {status === "copied" ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      </button>
    </div>
  );
}

AssistantMessageCopy.propTypes = {
  content: PropTypes.string,
  t: PropTypes.func.isRequired,
};
