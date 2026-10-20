import {
  IconAlign,
  IconBox3,
  IconClapper,
  IconBranch,
  IconFileText,
  IconGlobe,
  IconImage,
  IconMusic,
  IconPresentation,
  IconSparkles,
  IconVideo,
} from "../../icons.jsx";

export * from "./agentNodeHelpers.js";

export function getNodeIcon(nodeOrType, data = null) {
  let type = nodeOrType;
  let nodeData = data;
  if (typeof nodeOrType === "object" && nodeOrType !== null) {
    type = nodeOrType.type;
    nodeData = nodeOrType.data || data;
  }
  switch (type) {
    case "imageAsset":
    case "apiImage":
    case "generate":
      return <IconImage size={12} />;
    case "videoShot":
    case "apiVideo":
    case "combineVideo":
      return <IconVideo size={12} />;
    case "apiAudio":
      return <IconMusic size={12} />;
    case "prompt":
      return <IconAlign size={12} />;
    case "storyboardPlan":
      return <IconClapper size={12} />;
    case "model3d":
    case "apiModel3d":
      return <IconBox3 size={12} />;
    case "html":
      return <IconGlobe size={12} />;
    case "slides":
      return <IconPresentation size={12} />;
    case "mediaPreview": {
      const mediaType =
        nodeData?.mediaType || (nodeData?.imageId ? "image" : null);
      switch (mediaType) {
        case "image":
          return <IconImage size={12} />;
        case "video":
          return <IconVideo size={12} />;
        case "audio":
          return <IconMusic size={12} />;
        case "model3d":
          return <IconBox3 size={12} />;
        case "html":
          return <IconGlobe size={12} />;
        case "slides":
          return <IconPresentation size={12} />;
        case "markdown":
          return <IconFileText size={12} />;
        case "mindmap":
          return <IconBranch size={12} />;
        default:
          return <IconSparkles size={12} />;
      }
    }
    default:
      return <IconSparkles size={12} />;
  }
}
