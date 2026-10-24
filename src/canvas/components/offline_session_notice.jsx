import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { useCollabState } from "../collab/use_collab.js";
import { STATUS } from "../collab/session.js";
import { useI18n } from "../use_i18n.js";

/** How long a freshly joined room may show no peers before it is called offline. */
export const OFFLINE_GRACE_MS = 8000;

/**
 * Notice displayed when a link visitor joins an empty room and receives no document
 * after the initial grace period.
 */
export default function OfflineSessionNotice({
  state: propState,
  graceMs = OFFLINE_GRACE_MS,
  delayed: propDelayed,
  onDismiss: propOnDismiss,
}) {
  const { t } = useI18n();
  const liveCollabState = useCollabState();
  const collab = propState ?? liveCollabState;
  const [delayed, setDelayed] = useState(
    graceMs === 0 || Boolean(propDelayed),
  );
  const [dismissed, setDismissed] = useState(false);

  const inRoom = collab?.status !== STATUS.OFF && Boolean(collab?.roomId);
  const otherPeers = (collab?.peers ?? []).filter((peer) => !peer.self).length;
  const empty =
    inRoom &&
    Boolean(collab?.joinedViaLink) &&
    !collab?.receivedDocument &&
    otherPeers === 0;

  useEffect(() => {
    if (!empty || dismissed) {
      setDelayed(false);
      return undefined;
    }
    const timer = setTimeout(() => setDelayed(true), graceMs);
    return () => clearTimeout(timer);
  }, [empty, graceMs, dismissed]);

  if (!delayed || !empty || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    setDelayed(false);
    propOnDismiss?.();
  };

  return (
    <div
      role="status"
      data-testid="offline-session-notice"
      className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900 px-3.5 py-2 text-[12px] text-neutral-300"
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-500"
        aria-hidden="true"
      />
      <span className="flex-1">{t("collab.offlineBody")}</span>
      <button
        type="button"
        onClick={handleDismiss}
        className="rounded-lg px-1.5 py-0.5 text-[11px] text-neutral-400 transition-colors hover:text-white focus-visible:outline-none"
      >
        {t("error.dismiss")}
      </button>
    </div>
  );
}

OfflineSessionNotice.propTypes = {
  state: PropTypes.shape({
    status: PropTypes.string,
    roomId: PropTypes.string,
    joinedViaLink: PropTypes.bool,
    receivedDocument: PropTypes.bool,
    peers: PropTypes.array,
  }),
  graceMs: PropTypes.number,
  delayed: PropTypes.bool,
  onDismiss: PropTypes.func,
};
