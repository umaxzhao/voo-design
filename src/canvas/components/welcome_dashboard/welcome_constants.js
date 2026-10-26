import {
  Globe,
  Smartphone,
  Monitor,
  Presentation,
  LayoutDashboard,
  Sparkles,
} from "lucide-react";
import { CANVAS_TYPE } from "../../editor/scene_doc_factory.js";

// AI generation preset types for prompt composer
export const AI_GEN_TYPES = [
  {
    id: "landing",
    label: "welcome.pills.landing",
    placeholder: "welcome.prompt.landingPlaceholder",
    guidance: "welcome.guide.landing",
    width: 1440,
    height: 900,
    type: CANVAS_TYPE.DESIGN,
    category: "landing",
    icon: Globe,
  },
  {
    id: "mobile",
    label: "welcome.pills.mobile",
    placeholder: "welcome.prompt.mobilePlaceholder",
    guidance: "welcome.guide.mobile",
    width: 393,
    height: 852,
    type: CANVAS_TYPE.DESIGN,
    category: "mobile",
    icon: Smartphone,
  },
  {
    id: "web",
    label: "welcome.pills.web",
    placeholder: "welcome.prompt.webPlaceholder",
    guidance: "welcome.guide.web",
    width: 1440,
    height: 900,
    type: CANVAS_TYPE.DESIGN,
    category: "web",
    icon: Monitor,
  },
  {
    id: "slides",
    label: "welcome.pills.slides",
    placeholder: "welcome.prompt.slidesPlaceholder",
    guidance: "welcome.guide.slides",
    width: 1920,
    height: 1080,
    type: CANVAS_TYPE.DESIGN,
    category: "slides",
    icon: Presentation,
  },
  {
    id: "dashboard",
    label: "welcome.pills.dashboard",
    placeholder: "welcome.prompt.dashboardPlaceholder",
    guidance: "welcome.guide.dashboard",
    width: 1440,
    height: 960,
    type: CANVAS_TYPE.DESIGN,
    category: "dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "other",
    label: "welcome.pills.other",
    placeholder: "welcome.prompt.otherPlaceholder",
    guidance: "welcome.guide.other",
    width: 1200,
    height: 800,
    type: CANVAS_TYPE.DESIGN,
    category: "other",
    icon: Sparkles,
  },
];

// Alias for backwards compatibility
export const CATEGORY_PILLS = AI_GEN_TYPES;

export const SHORTCUTS_LIST = [
  { key: "⌘S / Ctrl+S", desc: "welcome.sc.save" },
  { key: "⌘⇧S / Ctrl+Shift+S", desc: "welcome.sc.saveAs" },
  { key: "⌘O / Ctrl+O", desc: "welcome.sc.open" },
  { key: "⌘N / Ctrl+N", desc: "welcome.sc.new" },
  { key: "V", desc: "welcome.sc.select" },
  { key: "P", desc: "welcome.sc.pen" },
  { key: "T", desc: "welcome.sc.text" },
  { key: "R / O", desc: "welcome.sc.rectEllipse" },
  { key: "welcome.sc.panKey", desc: "welcome.sc.pan" },
  { key: "welcome.sc.zoomKey", desc: "welcome.sc.zoom" },
  { key: "⌘Z / ⌘⇧Z", desc: "welcome.sc.undoRedo" },
  { key: "⌘G / ⌘⇧G", desc: "welcome.sc.group" },
];
