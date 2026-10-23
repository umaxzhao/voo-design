/**
 * Preset style kits for the design agent. A kit is a complete, coherent look:
 * palette + fonts + type scale + radius + shadow + spacing density + layout
 * guidance. Rule: pick ONE kit per design and never mix kits.
 */
function mkPalette(bg, surface, surfaceAlt, border, text, textMuted, accent, accentText, success, warning, danger) {
  return Object.freeze({
    bg,
    surface,
    surfaceAlt,
    border,
    text,
    textMuted,
    accent,
    accentText,
    success,
    warning,
    danger,
  });
}

const SANS_HAIRLINE = "rgba(255,255,255,0.08)";

function shadows(cssSm, cssMd, cssLg, color) {
  const parse = (css) => {
    const parts = css.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    return {
      css,
      x: parts[0] ?? 0,
      y: parts[1] ?? 0,
      blur: parts[2] ?? 0,
      spread: parts[3] ?? 0,
      color,
    };
  };
  return Object.freeze({ sm: parse(cssSm), md: parse(cssMd), lg: parse(cssLg) });
}

export const STYLE_KITS = {
  linear: {
    id: "linear",
    name: "Linear Dark",
    mood:
      "Restrained dark developer tool: near-black canvases, hairline borders, one muted accent, dense and precise.",
    palette: mkPalette(
      "#0B0B0F",
      "#101014",
      "#17171D",
      SANS_HAIRLINE,
      "#F2F3F5",
      "#8A8F98",
      "#5E6AD2",
      "#FFFFFF",
      "#4ADE80",
      "#FBBF24",
      "#F87171",
    ),
    fonts: { display: "Inter", body: "Inter", mono: "JetBrains Mono" },
    typeScale: [12, 13, 14, 16, 20, 24, 32, 48],
    radius: { sm: 4, md: 6, lg: 8, full: 9999 },
    shadow: shadows(
      "0 1px 2px rgba(0,0,0,0.4)",
      "0 4px 14px rgba(0,0,0,0.4)",
      "0 12px 32px rgba(0,0,0,0.5)",
      "rgba(0,0,0,0.4)",
    ),
    spacingDensity: "dense",
    layoutPatterns: [
      "App shell: left rail 220-260px, content column 12-col grid with 16-24px gutters",
      "Compact top bar 44-56px with breadcrumb left and actions right",
      "Cards 1px hairline border on #101014 surface, 8px radius, 0-1px shadow",
      "List rows 36-44px tall with 12px inline padding, hover surfaceAlt",
      "Detail/inspector columns split 2:1 with a single vertical hairline",
    ],
    dos: [
      "13-14px body text in Inter with 20px line-height",
      "One accent only, used for primary buttons, links and focus states",
      "Hairline 1px rgba(255,255,255,.08) borders instead of heavy shadows",
      "Dense spacing: 8px inside rows, 12-16px between rows, 24px between sections",
      "Muted secondary text (#8A8F98) for labels and metadata",
    ],
    donts: [
      "No colorful gradients or glow blobs",
      "No more than one accent hue",
      "No rounded corners above 8px for panels",
      "No oversized 60-72px display type; headings stay 20-32px",
      "No card noise: avoid stacking 3+ identical panels where a table or list fits",
    ],
  },
  glass: {
    id: "glass",
    name: "Frosted Glass",
    mood:
      "Layered translucent white panels floating over one soft photographic or blurred backdrop, bright and airy.",
    palette: mkPalette(
      "#2A3038",
      "rgba(255,255,255,0.72)",
      "rgba(255,255,255,0.52)",
      "rgba(255,255,255,0.38)",
      "#14181F",
      "rgba(20,24,31,0.62)",
      "#0E7490",
      "#FFFFFF",
      "#15803D",
      "#B45309",
      "#B91C1C",
    ),
    fonts: { display: "Sora", body: "Inter", mono: "IBM Plex Mono" },
    typeScale: [12, 14, 16, 20, 28, 36, 48],
    radius: { sm: 8, md: 16, lg: 24, full: 9999 },
    shadow: shadows(
      "0 2px 6px rgba(20,24,31,0.12)",
      "0 8px 24px rgba(20,24,31,0.14)",
      "0 24px 64px rgba(20,24,31,0.22)",
      "rgba(20,24,31,0.16)",
    ),
    spacingDensity: "comfortable",
    layoutPatterns: [
      "Full-bleed blurred backdrop image with a 24-32px inset sheet of panels",
      "Split layout: brand visual one side, glass card 380-440px the other",
      "Panels 16-24px radius, blur, 1px rgba-white border, layered soft shadows",
      "Bottom dock or floating toolbar as a translucent capsule",
    ],
    dos: [
      "One real backdrop (photo or gradient field) behind all glass",
      "White panels at 60-80% opacity with backdrop blur",
      "Dark text over glass for contrast; keep glass panels >60% white",
      "Use glass sparingly: 1-2 layered sheets per screen",
    ],
    donts: [
      "No more than 2-3 glass layers or it turns muddy",
      "No light text over light glass",
      "No sharp 0px radius boxes on top of a glass scene",
      "No fully flat colors over the backdrop; every panel is translucent",
    ],
  },
  editorial: {
    id: "editorial",
    name: "Editorial Print",
    mood:
      "Near-black serif display on warm off-white paper, generous margins, asymmetric grid, few or no cards, thin rules.",
    palette: mkPalette(
      "#F6F4EF",
      "#F6F4EF",
      "#EFEBE2",
      "#D8D3C6",
      "#141412",
      "#57534E",
      "#141412",
      "#F6F4EF",
      "#3F6212",
      "#A16207",
      "#991B1B",
    ),
    fonts: { display: "Playfair Display", body: "Inter", mono: "IBM Plex Mono" },
    typeScale: [14, 16, 20, 30, 36, 48, 72],
    radius: { sm: 0, md: 0, lg: 2, full: 9999 },
    shadow: shadows("0 0 0 rgba(0,0,0,0)", "0 0 0 rgba(0,0,0,0)", "0 0 0 rgba(0,0,0,0)", "rgba(0,0,0,0)"),
    spacingDensity: "roomy",
    layoutPatterns: [
      "Single text column 640-720px with 96-128px side margins",
      "Asymmetric hero: headline left 2/3, kicker and date right",
      "Thin 1px horizontal rules to separate sections, not boxes",
      "Full-bleed figure with a small caption line, no rounded corners",
    ],
    dos: [
      "Serif display 60-72px against 16px sans body for extreme contrast",
      "Black text on off-white #F6F4EF only; accent is ink",
      "Left-align everything; keep a strong asymmetry between columns",
      "Vary line lengths and let images break the grid",
      "Use 1px rules (#D8D3C6) instead of card containers",
    ],
    donts: [
      "No cards, pill buttons rounded > 2px, or drop shadows",
      "No centered stacked hero; keep the headline left-anchored",
      "No gradients or dark backgrounds in the body",
      "No more than 2 type sizes repeated; avoid equal-width three-column rows",
    ],
  },
  "enterprise-admin": {
    id: "enterprise-admin",
    name: "Enterprise Admin",
    mood:
      "Calm, functional light admin: white panels on a light gray canvas, structured tables, semantic status colors only.",
    palette: mkPalette(
      "#F7F8FA",
      "#FFFFFF",
      "#F2F4F7",
      "#E4E7EC",
      "#101828",
      "#667085",
      "#175CD3",
      "#FFFFFF",
      "#12B76A",
      "#F79009",
      "#F04438",
    ),
    fonts: { display: "Inter", body: "Inter", mono: "JetBrains Mono" },
    typeScale: [12, 14, 16, 18, 20, 24, 32],
    radius: { sm: 6, md: 8, lg: 12, full: 9999 },
    shadow: shadows(
      "0 1px 2px rgba(16,24,40,0.06)",
      "0 4px 12px rgba(16,24,40,0.08)",
      "0 16px 40px rgba(16,24,40,0.12)",
      "rgba(16,24,40,0.08)",
    ),
    spacingDensity: "structured",
    layoutPatterns: [
      "Office shell: 240-256px sidebar, 64px header, content on a 12-col grid with 24px gutters",
      "KPI strip of 4 cards in the first row, exactly one emphasized",
      "Master/detail: table 2/3 left, panel 1/3 right",
      "Settings: left nav 200-240px + grouped form sections 480-560px wide",
      "Status pills with a colored dot + 12px label in success/warning/danger only",
    ],
    dos: [
      "White panels with 1px #E4E7EC borders, 8px radius, shadow-sm only",
      "Body text 14px Inter; labels 12px medium; page title 20-24px",
      "24px gutters, 16px card padding, 8px row height multiples",
      "Real data everywhere: dates, currency, user initials avatars",
      "Traffic-light colors only for status, never for decoration",
    ],
    donts: [
      "No big gradients, glass, or dramatic type; this is quiet UI",
      "No purple/blue gradient panels",
      "No rows of 3+ identical promo cards",
      "No fonts other than Inter-like sans + one mono",
      "No dark background",
    ],
  },
  "dribbble-saas": {
    id: "dribbble-saas",
    name: "Dribbble Product Shot",
    mood:
      "Hero-grade SaaS frame aimed at design feeds: one focal module 2x larger, one vivid signal accent on deep black or warm neutral, real-looking content, soft layered shadows.",
    palette: mkPalette(
      "#0C0C0A",
      "#151511",
      "#1D1D18",
      "rgba(255,255,255,0.10)",
      "#F5F4EC",
      "#A3A396",
      "#C8F04A",
      "#0C0C0A",
      "#7DCF6E",
      "#F5C044",
      "#E5484D",
    ),
    fonts: { display: "DepartureMono", body: "Inter", mono: "JetBrains Mono" },
    typeScale: [12, 14, 16, 20, 24, 36, 56],
    radius: { sm: 8, md: 12, lg: 20, full: 9999 },
    shadow: shadows(
      "0 1px 2px rgba(0,0,0,0.3)",
      "0 8px 20px rgba(0,0,0,0.35)",
      "0 24px 60px rgba(0,0,0,0.5)",
      "rgba(0,0,0,0.35)",
    ),
    spacingDensity: "showcase",
    layoutPatterns: [
      "Bento grid: one focal module spanning 2 columns or 2x size of the others",
      "Hero card with an app screenshot, metric counter, and lime CTAs",
      "Stat rows with tiny sparklines and pill badges next to tabular numbers",
      "Icon + label list rows with avatar initials and status dots",
      "Floating panels with layered soft shadows instead of borders",
    ],
    dos: [
      "One vivid accent (e.g. lime) used on 5-10% of the surface; everything else neutral",
      "Real content: full names, dollar amounts, dates like 'Mar 14', avatar initials, status pills",
      "Miniature charts: sparklines, bar rows, donut arcs, 1-2px data lines",
      "Vary module sizes deliberately: focal module >=2x area of its neighbors",
      "Tight spacing inside groups (8-12px), loose between groups (32-48px)",
      "Tabular numbers and aligned baselines; 1px hairlines rgba(255,255,255,.10)",
    ],
    donts: [
      "No lorem ipsum, no placeholder boxes, no repeated 'Feature' wording",
      "No purple-to-blue/pink gradients",
      "No more than 3 identical sibling cards; break the grid with one hero module",
      "No thin pink/purple decorative lines or glow blobs",
      "No more than 2 font families",
      "Never center-stack headline+sub+button as a plain centered hero",
    ],
  },
};

/* Keyword -> weight map per kit id for pickStyleKit. Single short words use
 * word-boundary matching; multiword phrases match as substrings. */
const INLINE_HINT = {
  linear: [
    ["dark", 2],
    ["dashboard", 1],
    ["developer", 2],
    ["tool", 1],
    ["editor", 1],
    ["terminal", 2],
    ["code", 2],
    ["coding", 2],
    ["app", 1],
    ["git", 1],
    ["issue", 2],
    ["tasks", 2],
    ["kanban", 2],
    ["chat", 2],
    ["player", 2],
    ["music", 1],
    ["terminal", 2],
    ["ide", 2],
    ["linear", 4],
  ],
  glass: [
    ["glass", 4],
    ["glassmorphism", 4],
    ["frosted", 4],
    ["blur", 3],
    ["blurred", 3],
    ["translucent", 4],
    ["airy", 3],
    ["floating panel", 3],
    ["backdrop", 2],
    ["water", 2],
    ["weather", 2],
    ["login", 1],
    ["sign in", 1],
  ],
  editorial: [
    ["editorial", 5],
    ["magazine", 5],
    ["newspaper", 5],
    ["article", 4],
    ["blog post", 4],
    ["blog", 3],
    ["journal", 4],
    ["essay", 4],
    ["serif", 4],
    ["typographic", 4],
    ["typography", 3],
    ["print", 3],
    ["book cover", 3],
    ["poetry", 4],
    ["long form", 4],
  ],
  "enterprise-admin": [
    ["admin", 4],
    ["dashboard", 4],
    ["analytics", 4],
    ["table", 2],
    ["tables", 2],
    ["crm", 5],
    ["erp", 5],
    ["kpi", 5],
    ["metrics", 3],
    ["settings", 3],
    ["sidebar", 2],
    ["reports", 3],
    ["billing", 3],
    ["onboarding", 1],
    ["back office", 4],
    ["console", 2],
    ["inventory", 3],
    ["customers", 2],
    ["orders", 2],
  ],
  "dribbble-saas": [
    ["dribbble", 6],
    ["product shot", 6],
    ["shot", 3],
    ["showcase", 5],
    ["portfolio piece", 5],
    ["hero", 2],
    ["landing", 3],
    ["marketing", 3],
    ["beautiful", 2],
    ["stunning", 3],
    ["eye catching", 3],
    ["fancy", 2],
    ["bento", 3],
    ["feature", 1],
    ["pricing", 2],
    ["poster", 2],
  ],
};

function keywordScore(text, keywords) {
  let score = 0;
  for (const [word, weight] of keywords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (word.length <= 4) {
      const re = new RegExp(`\\b${escaped}\\b`);
      if (re.test(text)) score += weight;
    } else if (text.includes(word)) {
      score += weight;
    }
  }
  return score;
}

/**
 * Chooses one style kit for a user request. Weighted keyword scoring,
 * deterministic tie-breaks by kit id order, default = "linear".
 */
export function pickStyleKit(userText) {
  const text = String(userText ?? "")
    .replace(/[\n\r]+/g, " ")
    .toLowerCase();
  if (!text.trim()) return STYLE_KITS.linear;

  let bestId = null;
  let bestScore = 0;
  for (const id of Object.keys(STYLE_KITS)) {
    const score = keywordScore(text, INLINE_HINT[id] ?? []);
    if (score > bestScore) {
      bestId = id;
      bestScore = score;
    }
  }
  return STYLE_KITS[bestId ?? "linear"];
}
