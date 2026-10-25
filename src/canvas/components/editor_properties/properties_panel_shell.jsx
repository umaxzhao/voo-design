/**
 * The docked panel shell every properties panel shares: Design's own, and the
 * 3D and Motion inspectors. One container, header and scroll area, so the
 * three modes read as the same editor.
 */
import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import PropertiesPanelHeader from "./properties_panel_header.jsx";
import { DOCKED_PANEL_MAX_HEIGHT_CLASS } from "../editor_panel_clearance.js";

export default function PropertiesPanelShell({
  swapSide = false,
  bottomInset = 0,
  onToggleMotion = null,
  motionTriggerRef = null,
  motionOpen = false,
  onToggleSide = null,
  testId = undefined,
  children = null,
}) {
  const { t } = useI18n();
  const sideClass = swapSide ? "left-4" : "right-4";
  // The canvas-local timeline owns the reserved bottom area: keep the
  // horizontal placement and centre within the height that is left.
  const panelClass = `flex flex-col [&>div:first-child]:shrink-0 ${DOCKED_PANEL_MAX_HEIGHT_CLASS} absolute ${sideClass} top-1/2 z-30 w-64 -translate-y-1/2 rounded-3xl bg-black/95 p-3 shadow-panel backdrop-blur-md font-mono text-neutral-200 transition-[top,max-height,transform] duration-200 ease-out`;
  const panelStyle =
    bottomInset > 0
      ? {
          top: `calc(50% - ${bottomInset / 2}px)`,
          maxHeight: `calc(100% - ${bottomInset + 80}px)`,
        }
      : undefined;
  // The scrollbar stays hidden in both states so opening the timeline never
  // changes the panel's inner width.
  const contentClass = `no-scrollbar overflow-x-hidden overflow-y-auto ${
    bottomInset > 0 ? "min-h-0" : "min-h-0 max-h-[75vh]"
  }`;
  return (
    <aside
      data-testid={testId}
      aria-label={t("editor.properties")}
      className={panelClass}
      style={panelStyle}
    >
      <PropertiesPanelHeader
        onToggleMotion={onToggleMotion}
        motionTriggerRef={motionTriggerRef}
        motionOpen={motionOpen}
        onToggleSide={onToggleSide}
        t={t}
      />
      <div className={contentClass}>{children}</div>
    </aside>
  );
}

PropertiesPanelShell.propTypes = {
  swapSide: PropTypes.bool,
  bottomInset: PropTypes.number,
  onToggleMotion: PropTypes.func,
  motionTriggerRef: PropTypes.object,
  motionOpen: PropTypes.bool,
  onToggleSide: PropTypes.func,
  testId: PropTypes.string,
  children: PropTypes.node,
};
