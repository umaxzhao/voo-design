import {
  IconAlign,
  IconBox3,
  IconBrush,
  IconFilm,
  IconGamepad,
  IconImage,
  IconLayers,
  IconMusic,
  IconPalette,
  IconPalmtree,
  IconSparkles,
  IconVideo,
  IconWand,
  IconZap,
  IconZoomIn,
} from "../../icons.jsx";

/**
 * Goal modes: the user picks what kind of output they want before describing
 * it. Each mode maps onto one generator node — Image → generate, Video →
 * videoShot, Audio → apiAudio, Design → imageAsset (the Design editor) — plus
 * Workflow, which wires several of them
 * together. Each mode gets its own welcome, suggestion cards, placeholder and
 * a system-prompt goal section steering the agent's tool sequence.
 *
 * Card and skill prompts live in the dictionaries as `promptKey`: they are
 * user-visible text (they land in the input box) and must follow the UI
 * language, so they are resolved with t() at click time, not stored inline.
 */
export const AGENT_MODES = [
  {
    id: "workflow",
    labelKey: "agent.mode.workflow",
    placeholderKey: "agent.mode.workflowPlaceholder",
    welcomeKey: "agent.mode.workflowWelcome",
    Icon: IconAlign,
    cards: [
      {
        key: "agent.mode.workflowCard1",
        promptKey: "agent.mode.workflowCard1Prompt",
        Icon: IconFilm,
      },
      {
        key: "agent.mode.workflowCard2",
        promptKey: "agent.mode.workflowCard2Prompt",
        Icon: IconVideo,
      },
      {
        key: "agent.mode.workflowCard3",
        promptKey: "agent.mode.workflowCard3Prompt",
        Icon: IconSparkles,
      },
      {
        key: "agent.mode.workflowCard4",
        promptKey: "agent.mode.workflowCard4Prompt",
        Icon: IconPalette,
      },
    ],
  },
  {
    id: "image",
    labelKey: "agent.mode.image",
    placeholderKey: "agent.mode.imagePlaceholder",
    welcomeKey: "agent.mode.imageWelcome",
    Icon: IconImage,
    cards: [
      {
        key: "agent.mode.imageCard1",
        promptKey: "agent.mode.imageCard1Prompt",
        Icon: IconImage,
      },
      {
        key: "agent.mode.imageCard2",
        promptKey: "agent.mode.imageCard2Prompt",
        Icon: IconSparkles,
      },
      {
        key: "agent.mode.imageCard3",
        promptKey: "agent.mode.imageCard3Prompt",
        Icon: IconPalette,
      },
    ],
  },
  {
    id: "video",
    labelKey: "agent.mode.video",
    placeholderKey: "agent.mode.videoPlaceholder",
    welcomeKey: "agent.mode.videoWelcome",
    Icon: IconVideo,
    cards: [
      {
        key: "agent.mode.videoCard1",
        promptKey: "agent.mode.videoCard1Prompt",
        Icon: IconVideo,
      },
      {
        key: "agent.mode.videoCard2",
        promptKey: "agent.mode.videoCard2Prompt",
        Icon: IconZap,
      },
      {
        key: "agent.mode.videoCard3",
        promptKey: "agent.mode.videoCard3Prompt",
        Icon: IconImage,
      },
    ],
  },
  {
    id: "audio",
    labelKey: "agent.mode.audio",
    placeholderKey: "agent.mode.audioPlaceholder",
    welcomeKey: "agent.mode.audioWelcome",
    Icon: IconMusic,
    cards: [
      {
        key: "agent.mode.audioCard1",
        promptKey: "agent.mode.audioCard1Prompt",
        Icon: IconMusic,
      },
      {
        key: "agent.mode.audioCard2",
        promptKey: "agent.mode.audioCard2Prompt",
        Icon: IconSparkles,
      },
      {
        key: "agent.mode.audioCard3",
        promptKey: "agent.mode.audioCard3Prompt",
        Icon: IconZap,
      },
    ],
  },
  {
    id: "design",
    labelKey: "agent.mode.design",
    placeholderKey: "agent.mode.designPlaceholder",
    welcomeKey: "agent.mode.designWelcome",
    Icon: IconPalette,
    cards: [
      {
        key: "agent.mode.designCard1",
        promptKey: "agent.mode.designCard1Prompt",
        Icon: IconPalette,
      },
      {
        key: "agent.mode.designCard2",
        promptKey: "agent.mode.designCard2Prompt",
        Icon: IconImage,
      },
      {
        key: "agent.mode.designCard3",
        promptKey: "agent.mode.designCard3Prompt",
        Icon: IconZap,
      },
    ],
  },
];

export const CREATION_TYPE_CARDS = {
  model3d: [
    {
      key: "agent.creationType.model3dCard1",
      promptKey: "agent.creationType.model3dCard1Prompt",
      Icon: IconGamepad,
    },
    {
      key: "agent.creationType.model3dCard2",
      promptKey: "agent.creationType.model3dCard2Prompt",
      Icon: IconPalmtree,
    },
    {
      key: "agent.creationType.model3dCard3",
      promptKey: "agent.creationType.model3dCard3Prompt",
      Icon: IconSparkles,
    },
    {
      key: "agent.creationType.model3dCard4",
      promptKey: "agent.creationType.model3dCard4Prompt",
      Icon: IconBox3,
    },
  ],
};

export const EDITOR_SELECTION_CARDS = [
  {
    key: "agent.editorSelection.repaint",
    promptKey: "agent.editorSelection.repaintPrompt",
    Icon: IconBrush,
  },
  {
    key: "agent.editorSelection.upscale",
    promptKey: "agent.editorSelection.upscalePrompt",
    Icon: IconZoomIn,
  },
  {
    key: "agent.editorSelection.deconstruct",
    promptKey: "agent.editorSelection.deconstructPrompt",
    Icon: IconLayers,
  },
  {
    key: "agent.editorSelection.matting",
    promptKey: "agent.editorSelection.mattingPrompt",
    Icon: IconWand,
  },
];

