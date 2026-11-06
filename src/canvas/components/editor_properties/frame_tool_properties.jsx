import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";

const POPULAR_FRAME_PRESETS = [
  { groupKey: "editor.canvas.group.phone", items: [
    { name: "iPhone 16 Pro", w: 393, h: 852 },
    { name: "iPhone SE", w: 375, h: 667 },
    { name: "Android", w: 360, h: 800 },
  ]},
  { groupKey: "editor.canvas.group.desktop", items: [
    { name: "Desktop", w: 1440, h: 900 },
    { name: "MacBook Air", w: 1280, h: 832 },
    { name: "Full HD", w: 1920, h: 1080 },
  ]},
  { groupKey: "editor.canvas.group.social", items: [
    { name: "Instagram Post", w: 1080, h: 1080 },
    { name: "Story / Reel", w: 1080, h: 1920 },
    { name: "X / Twitter", w: 1600, h: 900 },
    { name: "小红书封面", w: 1242, h: 1660 },
  ]},
];

export default function FrameToolProperties({ onAddFramePreset }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3">
      {POPULAR_FRAME_PRESETS.map((group) => (
        <StaticSection key={group.groupKey} title={t(group.groupKey)}>
          <div className="flex flex-col gap-1.5">
            {group.items.map((preset) => (
              <button
                key={`${preset.name}-${preset.w}x${preset.h}`}
                type="button"
                onClick={() => onAddFramePreset?.(preset)}
                className="flex h-7 w-full items-center justify-between rounded-xl bg-white/[0.04] px-2.5 text-[11px] font-mono text-neutral-300 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
              >
                <span className="truncate">{preset.name}</span>
                <span className="text-[10px] text-neutral-500">{preset.w}×{preset.h}</span>
              </button>
            ))}
          </div>
        </StaticSection>
      ))}
    </div>
  );
}

FrameToolProperties.propTypes = {
  onAddFramePreset: PropTypes.func,
};
