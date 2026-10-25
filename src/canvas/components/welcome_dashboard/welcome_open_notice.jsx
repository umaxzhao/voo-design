/** Inline alert shown when a recent item cannot be opened; cleared by the next successful open. */
export function WelcomeOpenNotice({ t, notice }) {
  if (!notice) return null;
  return (
    <p
      role="alert"
      className="mx-4 lg:mx-8 mt-3 rounded-xl border border-rose-400/40 bg-neutral-900 px-4 py-2.5 text-xs text-rose-400"
    >
      {t(notice.key, { reason: notice.reason })}
    </p>
  );
}
