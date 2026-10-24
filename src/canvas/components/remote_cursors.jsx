import PropTypes from "prop-types";
import { useCollabState } from "../collab/use_collab.js";
import { STATUS } from "../collab/session.js";
import { useDesignStore } from "../../store/design_store.js";
import { useI18n } from "../use_i18n.js";
import { IconCursor, ICON_STROKE_WIDTH } from "../icons.jsx";

/**
 * Remote collaborators' live cursors, projected over the canvas.
 *
 * Positions arrive in canvas coordinate space and are projected to screen
 * coordinates using the editor camera's zoom and pan offsets.
 */
export default function RemoteCursors({
  zoom: propZoom,
  panX: propPanX,
  panY: propPanY,
  state: propState,
}) {
  const { t } = useI18n();
  const liveCollabState = useCollabState();
  const collab = propState ?? liveCollabState;

  const camera = useDesignStore((s) => s.editorCamera) || {
    panX: 0,
    panY: 0,
    zoom: 1,
  };
  const zoom = propZoom ?? camera.zoom ?? 1;
  const viewX = propPanX ?? camera.panX ?? 0;
  const viewY = propPanY ?? camera.panY ?? 0;

  if (collab?.status === STATUS.OFF) return null;
  const peers = (collab?.peers ?? []).filter(
    (peer) => !peer.self && peer.cursor,
  );
  if (peers.length === 0) return null;

  return (
    <div
      data-testid="remote-cursors-layer"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {peers.map((peer) => (
        <div
          key={peer.peerId}
          data-testid={`remote-cursor-${peer.peerId}`}
          className="absolute flex items-start gap-1 will-change-transform"
          style={{
            left: peer.cursor.x * zoom + viewX,
            top: peer.cursor.y * zoom + viewY,
          }}
        >
          <IconCursor
            size={15}
            className="shrink-0"
            aria-hidden="true"
            color={peer.colour}
            fill={peer.colour}
            strokeWidth={ICON_STROKE_WIDTH}
          />
          <span
            className="mt-[2px] max-w-[140px] truncate bg-transparent px-1 py-0.5 text-[10px] font-semibold leading-none"
            style={{ color: peer.colour }}
          >
            {peer.name || t("collab.anonymous")}
          </span>
        </div>
      ))}
    </div>
  );
}

RemoteCursors.propTypes = {
  zoom: PropTypes.number,
  panX: PropTypes.number,
  panY: PropTypes.number,
  state: PropTypes.shape({
    status: PropTypes.string,
    peers: PropTypes.array,
  }),
};
