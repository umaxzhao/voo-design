import PropTypes from "prop-types";
import {
  InspectorGroup,
  InspectorRow,
  InspectorSwitch,
} from "./three-inspector.jsx";

/** The document owns frame dimensions; the 3D scene inspector only reports them. */
export function ThreeSceneFrame({
  width,
  height,
  autoZoom = true,
  cameraPreview = false,
  onAutoZoomChange = () => {},
  onCameraPreviewChange = () => {},
  onCommit,
  t,
}) {
  return (
    <InspectorGroup
      title={t("editor.three.frame")}
      testId="editor-three-frame-group"
    >
      <InspectorRow label={t("editor.three.frameSize")}>
        <span
          data-testid="editor-three-frame-size"
          className="tabular-nums text-[11px] text-neutral-200"
        >
          {width} × {height}
        </span>
      </InspectorRow>
      <InspectorRow label={t("editor.three.cameraPreview")}>
        <div data-testid="editor-three-camera-preview">
          <InspectorSwitch
            checked={cameraPreview}
            label={t("editor.three.cameraPreview")}
            onChange={(enabled) => {
              onCameraPreviewChange(enabled);
              onCommit?.();
            }}
          />
        </div>
      </InspectorRow>
      <InspectorRow label={t("editor.three.autoZoom")}>
        <div data-testid="editor-three-auto-zoom">
          <InspectorSwitch
            checked={autoZoom}
            label={t("editor.three.autoZoom")}
            onChange={(enabled) => {
              onAutoZoomChange(enabled);
              onCommit?.();
            }}
          />
        </div>
      </InspectorRow>
    </InspectorGroup>
  );
}

ThreeSceneFrame.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  autoZoom: PropTypes.bool,
  cameraPreview: PropTypes.bool,
  onAutoZoomChange: PropTypes.func,
  onCameraPreviewChange: PropTypes.func,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
};
