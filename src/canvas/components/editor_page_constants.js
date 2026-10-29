import { CANVAS_TYPE } from "../editor/scene_doc_factory.js";

export const CANVAS_TYPE_TONES = Object.freeze({
  [CANVAS_TYPE.DESIGN]: {
    wash: "bg-white/[0.08]",
    bar: "bg-white/40",
    text: "text-neutral-400",
    solid: "bg-white text-black",
    label: "editor.canvasType.design",
  },
  [CANVAS_TYPE.MOTION]: {
    wash: "bg-white/[0.08]",
    bar: "bg-white/40",
    text: "text-neutral-400",
    solid: "bg-white text-black",
    label: "editor.canvasType.motion",
  },
  [CANVAS_TYPE.THREE_D]: {
    wash: "bg-white/[0.08]",
    bar: "bg-white/40",
    text: "text-neutral-400",
    solid: "bg-white text-black",
    label: "editor.canvasType.threeD",
  },
});

export const FRAME_TYPE_ICON_TONES = CANVAS_TYPE_TONES;

