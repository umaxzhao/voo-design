import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import { IconImage } from "../icons.jsx";

// Texture and video tabs are not yet supported by the renderer:
// - "texture" writes repeating-*-gradient() CSS that isCssGradient() won't
//   match, so the fill is silently dropped.
// - "video" writes a blob: URL that the canvas treats as a transparent image.
// Both tabs are hidden until the renderer adds support. "image" routes through
// blob: URLs the same way, so it too is hidden for now.
// Only "solid" and "gradient" are connected to working renderer paths.
export const PRIMARY_FILL_TYPES = [
  { id: "solid", labelKey: "editor.colorPicker.solid", icon: "solid" },
  { id: "gradient", labelKey: "editor.colorPicker.gradient", icon: "gradient" },
  // image / texture / video deliberately omitted until renderer support lands.
];

/** Fill-type tabs (or the plain title) plus the close button. */
export function PickerHeader({ showTypeTabs, activeType, onSelectType, onClose }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
      {showTypeTabs ? (
        <div className="flex items-center gap-1">
          {PRIMARY_FILL_TYPES.map((fillType) => (
            <button
              key={fillType.id}
              type="button"
              onClick={() => onSelectType(fillType.id)}
              title={t(fillType.labelKey)}
              aria-label={t(fillType.labelKey)}
              className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-mono transition-all ${
                activeType === fillType.id
                  ? "bg-white/20 text-white font-medium"
                  : "text-neutral-400 hover:text-neutral-100 hover:bg-white/10"
              }`}
            >
              {fillType.icon === "solid" ? (
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="3"
                    fill="currentColor"
                    fillOpacity={0.9}
                  />
                </svg>
              ) : fillType.icon === "gradient" ? (
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <defs>
                    <linearGradient
                      id="popover_grad_icon"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity="0.2"
                      />
                      <stop
                        offset="100%"
                        stopColor="currentColor"
                        stopOpacity="1"
                      />
                    </linearGradient>
                  </defs>
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="3"
                    fill="url(#popover_grad_icon)"
                    stroke="currentColor"
                  />
                </svg>
              ) : fillType.icon === "image" ? (
                <IconImage size={14} />
              ) : (
                <span>{fillType.icon}</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-[12px] font-mono font-medium">
          {t("editor.colorPicker.title")}
        </span>
      )}

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

PickerHeader.propTypes = {
  showTypeTabs: PropTypes.bool.isRequired,
  activeType: PropTypes.string.isRequired,
  onSelectType: PropTypes.func.isRequired,
  onClose: PropTypes.func,
};
