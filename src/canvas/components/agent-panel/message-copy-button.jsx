import { useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy } from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";

/* eslint-disable react/prop-types */

function legacyCopy(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Clipboard copy was rejected.");
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  legacyCopy(text);
}

export default function MessageCopyButton({ text, className = "" }) {
  const { t } = useI18n();
  const [state, setState] = useState("idle");
  const resetTimerRef = useRef(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      await writeClipboard(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setState("idle"), 1600);
  };

  const label =
    state === "copied"
      ? t("agent.message.copied")
      : state === "failed"
        ? t("agent.message.copyFailed")
        : t("agent.message.copy");

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className={`agent-message-copy-button ${className}`}
    >
      {state === "copied" ? <IconCheck size={12} /> : <IconCopy size={12} />}
    </button>
  );
}
