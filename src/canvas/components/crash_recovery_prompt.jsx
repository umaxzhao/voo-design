import React, { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { useDesignStore } from "../../store/design_store.js";
import { clearCrashDraft, loadLatestCrashDraft } from "../../shared/crash_recovery.js";

export async function resolveCrashRecovery(draft, restore, store = useDesignStore.getState(), onClose = () => {}) {
  if (restore) store.restoreCrashDraft(draft);
  await clearCrashDraft(draft.id);
  onClose();
}

export function CrashRecoveryDialog({ draft, onRestore, onDiscard, busy = false }) {
  const { t } = useI18n();
  const panel = useRef(null);
  useEffect(() => {
    if (!draft) return;
    const previous = document.activeElement;
    panel.current?.querySelector("button")?.focus();
    return () => previous?.focus?.();
  }, [draft]);
  if (!draft) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="crash-recovery-title" aria-describedby="crash-recovery-body"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons = [...panel.current.querySelectorAll("button:not(:disabled)")];
          if (!buttons.length) { event.preventDefault(); return; }
          const next = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
          if (document.activeElement === next) {
            event.preventDefault();
            (event.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus();
          }
        }}
        className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-900/95 p-7 text-neutral-200 shadow-panel backdrop-blur-md">
        <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-[#E5B2FF]/10 text-[#E5B2FF]"><RotateCcw size={22} aria-hidden="true" /></div>
        <h2 id="crash-recovery-title" className="text-lg font-semibold text-white">{t("app.crashRecovery.title")}</h2>
        <p id="crash-recovery-body" className="mt-2 text-sm leading-relaxed text-neutral-400">{t("app.crashRecovery.body")}</p>
        {draft.label && <p className="mt-4 truncate rounded-xl bg-white/5 px-3 py-2 text-sm">{draft.label}</p>}
        <div className="mt-7 flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onDiscard} className="rounded-xl px-4 py-2 text-sm hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#E5B2FF] disabled:opacity-50">{t("app.crashRecovery.discard")}</button>
          <button type="button" disabled={busy} onClick={onRestore} className="rounded-xl bg-[#E5B2FF] px-4 py-2 text-sm font-semibold text-black hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50">{t("app.crashRecovery.restore")}</button>
        </div>
      </section>
    </div>
  );
}

export default function CrashRecoveryPrompt() {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    loadLatestCrashDraft().then((entry) => { if (active) setDraft(entry); });
    return () => { active = false; };
  }, []);
  const resolve = async (restore) => {
    if (busy) return;
    setBusy(true);
    try {
      await resolveCrashRecovery(draft, restore, useDesignStore.getState(), () => setDraft(null));
    } finally { setBusy(false); }
  };
  return <CrashRecoveryDialog draft={draft} busy={busy} onRestore={() => resolve(true)} onDiscard={() => resolve(false)} />;
}
