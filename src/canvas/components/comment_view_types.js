import PropTypes from "prop-types";

export const commentViewModelType = PropTypes.shape({
  list: PropTypes.array.isRequired, threads: PropTypes.array.isRequired,
  openCount: PropTypes.number.isRequired, unreadCount: PropTypes.number.isRequired,
  unreadIds: PropTypes.instanceOf(Set).isRequired, filter: PropTypes.string.isRequired,
  selectedId: PropTypes.string, selected: PropTypes.object, draft: PropTypes.object,
  replyBody: PropTypes.string.isRequired, author: PropTypes.object.isRequired,
  cameraX: PropTypes.object.isRequired, cameraY: PropTypes.object.isRequired,
  setDraft: PropTypes.func.isRequired, setReplyBody: PropTypes.func.isRequired,
  setFilter: PropTypes.func.isRequired, closeThread: PropTypes.func.isRequired,
  submitDraft: PropTypes.func.isRequired, submitReply: PropTypes.func.isRequired,
  handleDelete: PropTypes.func.isRequired, handleResolve: PropTypes.func.isRequired,
  focusThread: PropTypes.func.isRequired, popoverStyle: PropTypes.func.isRequired,
});

export const commentSurfaceProps = {
  swapSide: PropTypes.bool, launcherVisible: PropTypes.bool, open: PropTypes.bool, addMode: PropTypes.bool, comments: PropTypes.array,
  zoom: PropTypes.number, offsetX: PropTypes.number, offsetY: PropTypes.number,
  onOpen: PropTypes.func, onClose: PropTypes.func, onToggleAddMode: PropTypes.func,
  onCreate: PropTypes.func, onReply: PropTypes.func, onResolve: PropTypes.func,
  onDelete: PropTypes.func, t: PropTypes.func,
};
