import PropTypes from "prop-types";
import { createPortal } from "react-dom";

/** Global surfaces must escape canvas transforms, clipping and stacking contexts. */
export default function GlobalOverlayPortal({ children }) {
  return typeof document === "undefined" || !document.body
    ? children
    : createPortal(children, document.body);
}

GlobalOverlayPortal.propTypes = { children: PropTypes.node.isRequired };
