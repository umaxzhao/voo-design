import PropTypes from "prop-types";
import alignLeft from "../assets/alignment/align-left.svg";
import alignCenter from "../assets/alignment/align-center-horizontal.svg";
import alignRight from "../assets/alignment/align-right.svg";
import alignTop from "../assets/alignment/align-top.svg";
import alignMiddle from "../assets/alignment/align-center-vertical.svg";
import alignBottom from "../assets/alignment/align-bottom.svg";
import distributeHorizontal from "../assets/alignment/distribute-horizontal.svg";
import distributeVertical from "../assets/alignment/distribute-vertical.svg";
import styles from "./alignment_icon.module.css";

const ALIGNMENT_ASSETS = {
  left: alignLeft,
  center: alignCenter,
  right: alignRight,
  top: alignTop,
  middle: alignMiddle,
  bottom: alignBottom,
  "distribute-horizontal": distributeHorizontal,
  "distribute-vertical": distributeVertical,
};

/** Original Figma silhouettes inherit the control color without editing the SVGs. */
export function AlignIcon({ type, size = 16, className = "" }) {
  const asset = ALIGNMENT_ASSETS[type];
  if (!asset) throw new Error(`Unknown alignment icon: ${type}`);
  return (
    <span
      aria-hidden="true"
      data-alignment-icon={type}
      className={`${styles.icon} ${className}`}
      style={{ "--alignment-size": `${size}px`, "--alignment-asset": `url("${asset}")` }}
    />
  );
}

AlignIcon.propTypes = {
  type: PropTypes.oneOf(Object.keys(ALIGNMENT_ASSETS)).isRequired,
  size: PropTypes.number,
  className: PropTypes.string,
};

export function DistributeIcon({ axis }) {
  return <AlignIcon type={`distribute-${axis}`} />;
}

DistributeIcon.propTypes = { axis: PropTypes.oneOf(["horizontal", "vertical"]).isRequired };

/** Figma node 91:448 uses nine native rounded blocks on a 40px canvas. */
export function TidyIcon() {
  return (
    <span aria-hidden="true" data-alignment-icon="tidy" className={styles.tidy}>
      {["nw", "n", "ne", "w", "center", "e", "sw", "s", "se"].map(position => (
        <span key={position} />
      ))}
    </span>
  );
}

export function AlignmentLeftIcon(props) {
  return <AlignIcon {...props} type="left" />;
}

export function AlignmentCenterIcon(props) {
  return <AlignIcon {...props} type="center" />;
}

export function AlignmentRightIcon(props) {
  return <AlignIcon {...props} type="right" />;
}
