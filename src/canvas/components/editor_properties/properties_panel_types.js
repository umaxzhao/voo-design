/** Prop types definition for EditorProperties panel. */

import PropTypes from "prop-types";

export const editorPropertiesPropTypes = {
  object: PropTypes.object,
  parentLayout: PropTypes.object,
  parentIsFrame: PropTypes.bool,
  parentNode: PropTypes.object,
  colorVariableActions: PropTypes.object,
  index: PropTypes.number,
  isBackground: PropTypes.bool,
  backgroundColor: PropTypes.string,
  onSetBackgroundColor: PropTypes.func,
  docSize: PropTypes.shape({
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  maskActions: PropTypes.object,
  transformActions: PropTypes.object,
  onTransformMode: PropTypes.func,
  getBitmap: PropTypes.func,
  onMutate: PropTypes.func,
  onCommit: PropTypes.func,
  selectionCount: PropTypes.number,
  /** Selected node objects when several are picked (plan 1.9). */
  selectedNodes: PropTypes.array,
  onCombine: PropTypes.func,
  onLayout: PropTypes.func,
  swapSide: PropTypes.bool,
  onToggleSide: PropTypes.func,
  onToggleMotion: PropTypes.func,
  motionTriggerRef: PropTypes.object,
  motionOpen: PropTypes.bool,
  bottomInset: PropTypes.number,
  engine: PropTypes.object,
  mediaError: PropTypes.string,
  tool: PropTypes.string,
  /** Per-tool option props forwarded to the tool properties section. */
  toolProps: PropTypes.object,
  penEditing: PropTypes.bool,
  /** The selected (green) Puppet Warp pin's id, or null. */
  puppetPinId: PropTypes.string,
  /** The selected node's Puppet Warp pins (engine truth). */
  puppetPins: PropTypes.array,
  /** The selected pin's current rotation in degrees. */
  puppetRotation: PropTypes.number,
  /** Set the selected pin's absolute rotation, in degrees. */
  onRotatePuppetPin: PropTypes.func,
  /** Move the selected pin to the front or back of its stacking order. */
  onMovePuppetPinDepth: PropTypes.func,
  /** Toggle the selected pin's fixed state. */
  onTogglePuppetPinFixed: PropTypes.func,
  onConvertAnchor: PropTypes.func,
  onDeleteAnchor: PropTypes.func,
  imageAiActions: PropTypes.object,
  onRemoveBackground: PropTypes.func,
  removeBackgroundBusy: PropTypes.bool,
  onCreateComponent: PropTypes.func,
  onDetachInstance: PropTypes.func,
  onDeleteCanvas: PropTypes.func,
};
