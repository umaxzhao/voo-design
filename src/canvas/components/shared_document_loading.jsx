import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { useCollabState } from "../collab/use_collab.js";
import { STATUS } from "../collab/session.js";
import { useI18n } from "../use_i18n.js";
import LoadingModal from "./loading_modal.jsx";
import { OFFLINE_GRACE_MS } from "./offline_session_notice.jsx";

/**
 * Temporary modal veil shown to link visitors waiting for the initial shared document.
 */
export default function SharedDocumentLoading({
  state: propState,
  graceMs = OFFLINE_GRACE_MS,
}) {
  const { t } = useI18n();
  const liveCollabState = useCollabState();
  const collab = propState ?? liveCollabState;
  const [delayed, setDelayed] = useState(false);

  const inRoom = collab?.status !== STATUS.OFF && Boolean(collab?.roomId);
  const otherPeers = (collab?.peers ?? []).filter((peer) => !peer.self).length;
  const waiting =
    inRoom && Boolean(collab?.joinedViaLink) && !collab?.receivedDocument;
  const empty = waiting && otherPeers === 0;

  useEffect(() => {
    if (!empty) {
      setDelayed(false);
      return undefined;
    }
    const timer = setTimeout(() => setDelayed(true), graceMs);
    return () => clearTimeout(timer);
  }, [empty, graceMs]);

  if (!waiting || (empty && delayed)) return null;

  return (
    <div
      data-testid="shared-document-loading"
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
    >
      <LoadingModal label={t("collab.loadingShared")} />
    </div>
  );
}

SharedDocumentLoading.propTypes = {
  state: PropTypes.shape({
    status: PropTypes.string,
    roomId: PropTypes.string,
    joinedViaLink: PropTypes.bool,
    receivedDocument: PropTypes.bool,
    peers: PropTypes.array,
  }),
  graceMs: PropTypes.number,
};
