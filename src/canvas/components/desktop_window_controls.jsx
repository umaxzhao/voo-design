import PropTypes from "prop-types";
import { Copy, Minus, Square, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import styles from "./desktop-window-controls.module.css";

/** The native desktop window owns these commands; browsers reserve no space. */
export default function DesktopWindowControls({ controls }) {
  const { t } = useI18n();
  if (!controls.supported) return null;
  const MaximizeIcon = controls.maximized ? Copy : Square;
  const maximizeLabel = t(controls.maximized ? "windowControls.restore" : "windowControls.maximize");
  return (
    <div className={styles.controls} role="group" aria-label={t("windowControls.label")}
      data-testid="desktop-window-controls">
      <button type="button" className={styles.button} onClick={controls.minimize}
        title={t("windowControls.minimize")} aria-label={t("windowControls.minimize")}>
        <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button type="button" className={styles.button} onClick={controls.toggleMaximize}
        title={maximizeLabel} aria-label={maximizeLabel} aria-pressed={controls.maximized}>
        <MaximizeIcon size={13} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button type="button" className={styles.button} onClick={controls.close}
        title={t("windowControls.close")} aria-label={t("windowControls.close")}>
        <X size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}

DesktopWindowControls.propTypes = {
  controls: PropTypes.shape({
    supported: PropTypes.bool.isRequired,
    maximized: PropTypes.bool.isRequired,
    minimize: PropTypes.func.isRequired,
    toggleMaximize: PropTypes.func.isRequired,
    close: PropTypes.func.isRequired,
  }).isRequired,
};
