import { Keyboard as IconKeyboard } from "lucide-react";
import { IconSliders, IconSparkles } from "../icons.jsx";

/** Settings drawer tabs in display order. The design-systems tab is not first. */
export const SETTINGS_TABS = [
  {
    id: "general",
    labelZh: "常规偏好",
    labelEn: "General",
    icon: IconSliders,
  },
  {
    id: "assistant",
    labelZh: "AI 助手",
    labelEn: "AI Assistant",
    icon: IconSparkles,
  },
  {
    id: "design-systems",
    labelKey: "settings.tabDesignSystems",
    icon: IconSliders,
  },
  {
    id: "providers",
    labelZh: "AI 供应商",
    labelEn: "AI Providers",
    icon: IconSparkles,
  },
  {
    id: "shortcuts",
    labelZh: "快捷键速查",
    labelEn: "Shortcuts",
    icon: IconKeyboard,
  },
];
