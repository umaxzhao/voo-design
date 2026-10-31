import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import { useBrowserController } from "./use-browser-controller.js";
import { useBrowserOverlay } from "./use-browser-overlay.js";
import BrowserDrawerView from "./browser-drawer-view.jsx";

export default function BrowserDrawer({ open, onClose }) {
  const model = useBrowserController(open);
  const top = useBrowserOverlay(open, model.isPicking ? model.handleStopPick : onClose);
  if (!open) return null;
  // Escape workspace clipping and stacking contexts; native webviews stay inside this surface.
  return createPortal(
    <BrowserDrawerView model={model} onClose={onClose} top={top} />,
    document.body,
  );
}
BrowserDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
