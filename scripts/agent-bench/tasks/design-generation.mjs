/**
 * scripts/agent-bench/tasks/design-generation.mjs
 *
 * Benchmark tasks: composed designs on an editor artboard (poster, banner,
 * social post, deck slide). Predicates assert artboard size and layer
 * structure of the resulting editor state.
 */

export const DESIGN_GENERATION_TASKS = [
  {
    id: "design-poster-music-fest",
    category: "design-generation",
    requiredTools: ["update_plan", "create_frame", "create_shape", "create_variable", "capture_canvas"],
    prompt:
      "Design a 1080x1440 poster for the 'NEON PULSE' electronic music festival on July 18. Bold title at top, date and venue 'Harbor Warehouse' below, one full-bleed abstract light-streak visual, dark background.",
    expect: [
      { type: "layerCount", layerKind: "text", min: 3 },
      { type: "artboardSize", width: 1080, height: 1440 },
      { type: "layerTextIncludes", text: "NEON PULSE" },
      { type: "layerTextIncludes", text: "July 18" },
      { type: "layerCount", layerKind: "image", min: 1 },
    ],
    visualCriteria: [
      "Title is the dominant element and readable at thumbnail size.",
      "Date and venue are present and smaller than the title.",
      "Background visual does not reduce title legibility.",
    ],
    costCeilingUsd: 0.15,
  },
  {
    id: "design-poster-exhibition",
    category: "design-generation",
    requiredTools: ["update_plan", "create_frame", "create_shape", "create_variable", "capture_canvas"],
    prompt:
      "Design a minimal 1080x1440 exhibition poster for 'QUIET FORMS', a ceramics show. Lots of white space, one small centered vessel photo, thin serif type, show dates 'Sep 3 - Oct 2' at the bottom.",
    expect: [
      { type: "artboardSize", width: 1080, height: 1440 },
      { type: "layerCount", layerKind: "text", min: 2 },
      { type: "layerTextIncludes", text: "QUIET FORMS" },
      { type: "layerTextIncludes", text: "Sep 3" },
      { type: "layerCount", layerKind: "image", min: 1 },
    ],
    visualCriteria: [
      "Majority of the canvas is empty white space.",
      "Type is thin and serif; no bold display face.",
      "Vessel image is small, centered, and not full-bleed.",
    ],
    costCeilingUsd: 0.15,
  },
  {
    id: "design-banner-web-hero",
    category: "design-generation",
    requiredTools: ["update_plan", "create_frame", "create_shape", "create_variable", "capture_canvas"],
    prompt:
      "Design a 1920x640 website hero banner for a summer sale: headline 'SUMMER SALE', subline 'Up to 50% off selected gear', product photo of a backpack on the right third, warm gradient-free flat background.",
    expect: [
      { type: "artboardSize", width: 1920, height: 640 },
      { type: "layerCount", layerKind: "text", min: 2 },
      { type: "layerTextIncludes", text: "SUMMER SALE" },
      { type: "layerTextIncludes", text: "50%" },
      { type: "layerCount", layerKind: "image", min: 1 },
    ],
    visualCriteria: [
      "Headline and discount line sit in the left two-thirds.",
      "Product image occupies roughly the right third.",
      "Background is flat color, no gradient.",
    ],
    costCeilingUsd: 0.15,
  },
  {
    id: "design-banner-app-feature",
    category: "design-generation",
    requiredTools: ["update_plan", "create_frame", "create_shape", "create_variable", "capture_canvas"],
    prompt:
      "Design a 1600x500 feature banner announcing 'Offline Mode' for a note-taking app: short headline with the words 'Offline Mode', one-line subtext 'Your notes, anywhere.', phone mockup image on the right.",
    expect: [
      { type: "artboardSize", width: 1600, height: 500 },
      { type: "layerCount", layerKind: "text", min: 2 },
      { type: "layerTextIncludes", text: "Offline Mode" },
      { type: "layerCount", layerKind: "image", min: 1 },
    ],
    visualCriteria: [
      "Headline names the feature exactly.",
      "Phone mockup is on the right and does not overlap text.",
      "Layout keeps at least one clear margin around all text.",
    ],
    costCeilingUsd: 0.12,
  },
  {
    id: "design-social-instagram-post",
    category: "design-generation",
    requiredTools: ["update_plan", "create_frame", "create_shape", "create_variable", "capture_canvas"],
    prompt:
      "Design a 1080x1080 Instagram post for a coffee roastery announcing a new 'Ethiopia Guji' single origin. Include the roastery handle '@emberroast', a photo of a coffee bag, and a small 'New' tag.",
    expect: [
      { type: "artboardSize", width: 1080, height: 1080 },
      { type: "layerCount", layerKind: "text", min: 2 },
      { type: "layerTextIncludes", text: "Ethiopia Guji" },
      { type: "layerTextIncludes", text: "@emberroast" },
      { type: "layerCount", layerKind: "image", min: 1 },
    ],
    visualCriteria: [
      "Product name is the largest text on the post.",
      "Handle is present but visually secondary.",
      "The 'New' tag is small and does not cover the product photo.",
    ],
    costCeilingUsd: 0.15,
  },
  {
    id: "design-deck-title-slide",
    category: "design-generation",
    requiredTools: ["update_plan", "create_frame", "create_shape", "create_variable", "capture_canvas"],
    prompt:
      "Design a 1920x1080 title slide for a Q3 business review deck: title 'Q3 BUSINESS REVIEW', subtitle 'Growth & Retention', presenter line 'A. Chen, Oct 2026', dark navy background with one thin mint accent rule.",
    expect: [
      { type: "artboardSize", width: 1920, height: 1080 },
      { type: "layerCount", layerKind: "text", min: 3 },
      { type: "layerTextIncludes", text: "Q3 BUSINESS REVIEW" },
      { type: "layerTextIncludes", text: "Growth & Retention" },
      { type: "layerCount", layerKind: "shape", min: 1 },
    ],
    visualCriteria: [
      "Title hierarchy: title > subtitle > presenter line.",
      "Exactly one thin accent rule; no other decoration.",
      "Background is a single dark navy fill.",
    ],
    costCeilingUsd: 0.12,
  },
];
