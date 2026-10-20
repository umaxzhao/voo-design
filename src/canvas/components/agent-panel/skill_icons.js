/**
 * Icons for the agent skill list. Built-in skills are keyed by id; imported
 * skills carry no artwork of their own, so they share the file icon.
 */

import {
  IconClapper,
  IconCutout,
  IconFileAdd,
  IconFileText,
  IconFilm,
  IconHelpCircle,
  IconImageAi,
  IconLayout,
  IconPalette,
  IconShuffle,
  IconSparkles,
  IconStore,
} from "../../icons.jsx";

const SKILL_ICONS = {
  // Workflow
  skillCreator: IconFileAdd,
  explainProcess: IconHelpCircle,
  storyToShortfilm: IconClapper,
  abTest: IconShuffle,
  multiPlatformExport: IconLayout,
  productShoot: IconStore,
  productCampaign: IconStore,
  referenceStyleSystem: IconPalette,
  nbaFestivalPoster: IconImageAi,
  // Image
  chatgptImageCopilot: IconImageAi,
  jimengCopilot: IconImageAi,
  fluxCopilot: IconImageAi,
  smartCutout: IconCutout,
  // Video
  seedanceCopilot: IconFilm,
  klingCopilot: IconFilm,
  // Design
  sketchToDesign: IconLayout,
  photoToPoster: IconPalette,
  brandKit: IconPalette,
};

/** The icon component a skill row shows. */
export function skillIcon(skill) {
  if (skill?.source === "upload") return IconFileText;
  return SKILL_ICONS[skill?.id] ?? IconSparkles;
}
