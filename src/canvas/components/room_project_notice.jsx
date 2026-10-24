import PropTypes from "prop-types";
import { useState } from "react";
import { useCollabState } from "../collab/use_collab.js";
import { STATUS } from "../collab/session.js";
import { useDesignStore } from "../../store/design_store.js";
import { saveRoomSessionToProjectFolder } from "../store/share_actions.js";
import { useI18n } from "../use_i18n.js";

/**
 * Prompts desktop room collaborators to save the live session as a local project file.
 */
export default function RoomProjectNotice({
  state: propState,
  isDesktop: propIsDesktop,
  onSave: propOnSave,
  onDismiss: propOnDismiss,
}) {
  const { t } = useI18n();
  const liveCollabState = useCollabState();
  const collab = propState ?? liveCollabState;

  const filePath = useDesignStore((state) => state.filePath);
  const [dismissedRoomId, setDismissedRoomId] = useState(null);

  const isDesktop =
    propIsDesktop ??
    Boolean(
      globalThis.window?.vooElectron ||
        globalThis.window?.electronAPI?.platform,
    );
  const isInRoom = collab?.status !== STATUS.OFF && Boolean(collab?.roomId);
  const isDismissed = dismissedRoomId === collab?.roomId;

  if (!isDesktop || !isInRoom || filePath || isDismissed) return null;

  const handleSave = () => {
    const saveFn = propOnSave ?? saveRoomSessionToProjectFolder;
    Promise.resolve(saveFn())
      .then((saved) => {
        if (saved) setDismissedRoomId(collab.roomId);
      })
      .catch((error) => {
        console.warn("Room project save failed", error);
      });
  };

  const handleDismiss = () => {
    setDismissedRoomId(collab.roomId);
    propOnDismiss?.();
  };

  return (
    <div
      role="status"
      data-testid="room-project-notice"
      className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900 px-3.5 py-2 text-[12px] text-neutral-300"
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-500"
        aria-hidden="true"
      />
      <span className="flex-1">{t("collab.roomProjectBody")}</span>
      <button
        type="button"
        onClick={handleSave}
        className="shrink-0 rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-medium text-neutral-200 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none"
      >
        {t("collab.roomProjectAction")}
      </button>
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

RoomProjectNotice.propTypes = {
  state: PropTypes.shape({
    status: PropTypes.string,
    roomId: PropTypes.string,
  }),
  isDesktop: PropTypes.bool,
  onSave: PropTypes.func,
  onDismiss: PropTypes.func,
};
