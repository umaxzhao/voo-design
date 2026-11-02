import { createSignatureDesignSystems } from "./design-system-signatures.js";
import { createDiscoverDesignSystems } from "./design_systems_discover.js";

/** Artifact design systems. These tokens style generated canvases, not VOO chrome. */
const SPACING = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
});
const RADIUS = Object.freeze({ control: 10, card: 16, panel: 24, pill: 999 });

function defineSystem(
  id,
  labelKey,
  descriptionKey,
  colors,
  fonts,
  type,
  keywords,
  options = {},
) {
  const spacing = options.spacing ?? SPACING;
  const radius = options.radius ?? RADIUS;
  const resolvedFonts = options.fontsLabel ? { ...fonts, label: options.fontsLabel } : fonts;
  return Object.freeze({
    id,
    labelKey,
    descriptionKey,
    keywords,
    coverImage: options.coverImage ?? null,
    sourceName: options.sourceName ?? null,
    sourceUrl: options.sourceUrl ?? null,
    // Extra art-direction lines appended to the generated brief, per locale.
    briefZh: Object.freeze([...(options.brief?.zh ?? [])]),
    briefEn: Object.freeze([...(options.brief?.en ?? [])]),
    tokens: {
      primitive: { colors, spacing, radius, fonts: resolvedFonts, type },
      semantic: {
        canvas: "paper",
        surface: "white",
        surfaceMuted: "soft",
        text: "ink",
        textMuted: "secondary",
        action: "brand",
        actionHover: "brandHover",
        actionText: "brandInk",
        divider: "line",
      },
      component: {
        button: {
          background: "action",
          text: "actionText",
          height: 48,
          paddingX: "xl",
          radius: "control",
        },
        card: { background: "surface", padding: "xl", radius: "card" },
        navigation: {
          background: "surface",
          text: "textMuted",
          active: "action",
          height: 64,
        },
        input: {
          background: "surfaceMuted",
          text: "text",
          height: 48,
          radius: "control",
        },
      },
    },
  });
}

const DEFAULT_TYPE = Object.freeze({
  desktop: { display: 64, title: 36, body: 18, caption: 14 },
  mobile: { display: 36, title: 28, body: 16, caption: 14 },
});

export const DESIGN_SYSTEMS = Object.freeze({
  ...createDiscoverDesignSystems(defineSystem),
  studio: defineSystem(
    "studio",
    "designSystem.studio",
    "designSystem.studioDescription",
    {
      paper: "#F6F7F5",
      white: "#FFFFFF",
      soft: "#EAF0EC",
      ink: "#1B2821",
      secondary: "#53665B",
      brand: "#176B52",
      brandHover: "#12563F",
      brandInk: "#FFFFFF",
      line: "#D7E2DA",
    },
    { heading: "Arial", body: "Arial" },
    DEFAULT_TYPE,
    ["product", "saas", "通用", "产品"],
  ),
  wellness: defineSystem(
    "wellness",
    "designSystem.wellness",
    "designSystem.wellnessDescription",
    {
      paper: "#F7F6F1",
      white: "#FFFFFF",
      soft: "#E9F0E8",
      ink: "#1D2A25",
      secondary: "#53675A",
      brand: "#287C61",
      brandHover: "#1F654E",
      brandInk: "#FFFFFF",
      line: "#D9E4DA",
    },
    { heading: "Arial", body: "Arial" },
    {
      desktop: { display: 72, title: 36, body: 18, caption: 14 },
      mobile: { display: 56, title: 28, body: 16, caption: 14 },
    },
    ["fitness", "wellness", "health", "健身", "健康", "运动"],
  ),
  commerce: defineSystem(
    "commerce",
    "designSystem.commerce",
    "designSystem.commerceDescription",
    {
      paper: "#F8F7F4",
      white: "#FFFFFF",
      soft: "#F1EBE5",
      ink: "#25231F",
      secondary: "#655F58",
      brand: "#9C4C32",
      brandHover: "#803B26",
      brandInk: "#FFFFFF",
      line: "#E4DDD5",
    },
    { heading: "Arial", body: "Arial" },
    DEFAULT_TYPE,
    ["commerce", "shopping", "retail", "电商", "购物"],
  ),
  editorial: defineSystem(
    "editorial",
    "designSystem.editorial",
    "designSystem.editorialDescription",
    {
      paper: "#F6F2E9",
      white: "#FFFDF8",
      soft: "#EBE3D7",
      ink: "#28231F",
      secondary: "#665B51",
      brand: "#8C3B2E",
      brandHover: "#702B22",
      brandInk: "#FFFFFF",
      line: "#DCD1C3",
    },
    { heading: "Georgia", body: "Arial" },
    {
      desktop: { display: 72, title: 38, body: 18, caption: 14 },
      mobile: { display: 36, title: 28, body: 16, caption: 14 },
    },
    ["editorial", "magazine", "reading", "杂志", "阅读"],
  ),
  analytics: defineSystem(
    "analytics",
    "designSystem.analytics",
    "designSystem.analyticsDescription",
    {
      paper: "#F4F6F8",
      white: "#FFFFFF",
      soft: "#EAF0F4",
      ink: "#1B2732",
      secondary: "#536171",
      brand: "#17698F",
      brandHover: "#115573",
      brandInk: "#FFFFFF",
      line: "#DCE4E9",
    },
    { heading: "Arial", body: "Arial" },
    {
      desktop: { display: 56, title: 32, body: 17, caption: 14 },
      mobile: { display: 34, title: 26, body: 16, caption: 14 },
    },
    ["analytics", "dashboard", "metrics", "仪表盘", "数据"],
  ),
  ...createSignatureDesignSystems(defineSystem),
});

const INTENT_RULES = [
  ["stripe", /\b(stripe|payments?|fintech|financial infrastructure)\b|支付|金融科技|收款/i],
  ["linear", /\b(linear|issue tracker|roadmap|product development)\b|项目管理|产品研发|路线图/i],
  ["vercel", /\b(vercel|deployment|developer platform|hosting)\b|开发者平台|部署平台/i],
  ["anthropic", /\b(anthropic|ai safety|research lab)\b|人工智能安全|研究机构/i],
  ["notion", /\b(notion|knowledge base|workspace|documents)\b|知识库|工作空间|文档/i],
  ["figma", /\b(figma|design tool|creative canvas)\b|设计工具|创作画布/i],
  [
    "wellness",
    /\b(fitness|workout|wellness|health|training|meditation)\b|健身|运动|健康|训练|冥想/i,
  ],
  [
    "commerce",
    /\b(shop|shopping|store|commerce|retail|product catalog)\b|购物|电商|商城|零售|商品/i,
  ],
  [
    "analytics",
    /\b(dashboard|analytics|metrics|reporting)\b|仪表盘|数据分析|报表|统计/i,
  ],
  [
    "editorial",
    /\b(editorial|magazine|publication|reading)\b|杂志|出版|阅读|期刊/i,
  ],
  ["axiom", /\b(avant[- ]garde|poster|editorial tech|brutalist)\b|前卫|先锋|海报|技术编辑/i],
  ["void-os", /\b(terminal|operator|cyber|dark console|command)\b|终端|控制台|赛博|监控/i],
  ["bloom", /\b(playful|soft pop|y2k|candy|cute)\b|潮流|活泼|多巴胺|可爱|糖果/i],
];

/** Explicit ids are strict; auto-selection uses the artifact brief. */
export function resolveDesignSystem(id = "auto", { prompt = "" } = {}) {
  if (id && id !== "auto") {
    const selected = DESIGN_SYSTEMS[id];
    if (!selected) throw new Error(`unknown-design-system:${id}`);
    return selected;
  }
  const matching = INTENT_RULES.find(([, pattern]) => pattern.test(prompt));
  return DESIGN_SYSTEMS[matching?.[0] ?? "studio"];
}

export function designSystemColors(system) {
  const { colors } = system.tokens.primitive;
  return Object.fromEntries(
    Object.entries(system.tokens.semantic).map(([role, primitive]) => [
      role,
      colors[primitive],
    ]),
  );
}

/** Reject explicit colors outside the selected token palette before saving. */
export function designSystemColorViolation(html, system) {
  const allowed = new Set(
    Object.values(system.tokens.primitive.colors).map((color) =>
      color.toLowerCase(),
    ),
  );
  const styles = String(html ?? "").matchAll(
    /\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi,
  );
  for (const [, , style] of styles) {
    for (const match of style.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
      const color = match[0].toLowerCase();
      const expanded =
        color.length === 4
          ? `#${[...color.slice(1)].map((digit) => digit + digit).join("")}`
          : color.length === 9
            ? color.slice(0, 7)
            : color;
      if (!allowed.has(expanded)) return `design-system-color:${color}`;
    }
  }
  return null;
}

/** Brief wording per locale. `zh` is the original text and the default. */
const BRIEF_COPY = {
  zh: {
    title: (id) => `【Design System: ${id}】所有页面使用同一套 token。`,
    colors: (palette) => `语义颜色（只使用这些精确色值）：${palette}。`,
    type: (p, t) =>
      `字体：标题 ${p.fonts.heading}，正文 ${p.fonts.body}${p.fonts.label ? `，标签与数字 ${p.fonts.label}` : ""}。字号：展示 ${t.display}px，页面标题 ${t.title}px，正文 ${t.body}px，辅助 ${t.caption}px。`,
    spacing: (spaces, r) =>
      `间距基于 4px：${spaces}px；圆角：控件 ${r.control}px，卡片 ${r.card}px，面板 ${r.panel}px。`,
    components: (v) =>
      `主按钮：${v.buttonHeight}px 高，背景 ${v.buttonBg}，文字 ${v.buttonText}。需要卡片时：背景 ${v.cardBg}，内边距 ${v.cardPadding}px；主视觉区不是卡片，可用深色 text=${v.text} 或 action=${v.action} 做完整明暗分区。底部或顶部导航：${v.navHeight}px 高，选中项 ${v.navActive}。`,
    states:
      "组件的默认、按下、不可用状态保持同一字号、间距和圆角；不可用状态降低对比度，不引入新颜色。HTML 内仍写最终色值，不写 CSS 变量。",
  },
  en: {
    title: (id) => `[Design System: ${id}] Every page uses the same token set.`,
    colors: (palette) =>
      `Semantic colors (use only these exact values): ${palette}.`,
    type: (p, t) =>
      `Fonts: headings ${p.fonts.heading}, body ${p.fonts.body}${p.fonts.label ? `, labels and numerals ${p.fonts.label}` : ""}. Type sizes: display ${t.display}px, page title ${t.title}px, body ${t.body}px, caption ${t.caption}px.`,
    spacing: (spaces, r) =>
      `Spacing on a 4px base: ${spaces}px; radii: control ${r.control}px, card ${r.card}px, panel ${r.panel}px.`,
    components: (v) =>
      `Primary button: ${v.buttonHeight}px tall, background ${v.buttonBg}, text ${v.buttonText}. When a card is needed: background ${v.cardBg}, padding ${v.cardPadding}px; the hero area is not a card and may use dark text=${v.text} or action=${v.action} for a full light/dark band. Bottom or top navigation: ${v.navHeight}px tall, active item ${v.navActive}.`,
    states:
      "Default, pressed and disabled states of a component keep the same type size, spacing and radius; disabled states lower the contrast without introducing new colors. Write final color values in the HTML, never CSS variables.",
  },
};

/**
 * The renderer requires literal values, so resolve aliases before prompting.
 * `locale` picks the brief's language ("zh" by default, so existing callers
 * keep their output); unknown locales fall back to English.
 */
export function buildDesignSystemBrief(
  system,
  { media = "web", locale = "zh" } = {},
) {
  const copy = BRIEF_COPY[locale] ?? BRIEF_COPY.en;
  const { primitive, component } = system.tokens;
  const colors = designSystemColors(system);
  const type =
    media === "mobile" ? primitive.type.mobile : primitive.type.desktop;
  const palette = Object.entries(colors)
    .map(([role, value]) => `${role}=${value}`)
    .join(", ");
  const spaces = Object.values(primitive.spacing).join(" / ");
  const notes = locale === "zh" ? system.briefZh : system.briefEn;
  return [
    copy.title(system.id),
    copy.colors(palette),
    copy.type(primitive, type),
    copy.spacing(spaces, primitive.radius),
    copy.components({
      buttonHeight: component.button.height,
      buttonBg: colors[component.button.background],
      buttonText: colors[component.button.text],
      cardBg: colors[component.card.background],
      cardPadding: primitive.spacing[component.card.padding],
      text: colors.text,
      action: colors.action,
      navHeight: component.navigation.height,
      navActive: colors[component.navigation.active],
    }),
    ...(Array.isArray(notes) ? notes : []),
    copy.states,
  ].join("\n");
}
