import PropTypes from "prop-types";
import { useBrowserController } from "./use-browser-controller.js";
import { useBrowserOverlay } from "./use-browser-overlay.js";
import BrowserDrawerView from "./browser-drawer-view.jsx";
import "./browser-drawer.css";

export default function BrowserDrawer({ open, onClose }) {
  const model = useBrowserController(open);
  useBrowserOverlay(open, model.isPicking ? model.handleStopPick : onClose);
  if (!open) return null;
  return <BrowserDrawerView model={model} onClose={onClose} />;
}
BrowserDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
