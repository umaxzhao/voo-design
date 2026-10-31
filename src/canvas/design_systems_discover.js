/** DesignMD-inspired presets with a representative source-page cover. */
const SPACING = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
});

const DEFAULT_TYPE = Object.freeze({
  desktop: { display: 64, title: 36, body: 16, caption: 13 },
  mobile: { display: 40, title: 28, body: 15, caption: 12 },
});

const REFERENCES = [
  {
    id: "stripe",
    nameKey: "designSystem.stripe",
    descriptionKey: "designSystem.stripeDescription",
    sourceName: "Stripe",
    coverImage:
      "https://designmd-production-assets.s3.ca-central-1.amazonaws.com/screenshots/a59178aa-71f3-4771-b756-ecbb557550c3/0-0.jpg",
    sourceUrl: "https://designmd.me/discover/stripe",
    keywords: ["stripe", "payments", "finance", "payments platform", "支付", "金融"],
    colors: {
      paper: "#F6F9FC",
      white: "#FFFFFF",
      soft: "#E5EDF5",
      ink: "#0A2540",
      secondary: "#425466",
      brand: "#533AFD",
      brandHover: "#4329E8",
      brandInk: "#FFFFFF",
      line: "#D7E1EB",
    },
    fonts: { heading: "Inter", body: "Inter" },
    brief: {
      zh: [
        "方向参考 Stripe：以冷白留白、深海军蓝文字和克制的蓝紫行动色建立金融科技的清晰感。",
        "采用整洁的分栏、紧凑信息卡与明确的产品截图；不要叠加无关线描、光晕或装饰渐变。",
      ],
      en: [
        "Stripe-inspired direction: cool white space, deep navy type and restrained violet-blue actions keep financial technology clear.",
        "Use orderly columns, compact information cards and purposeful product screenshots; avoid unrelated line art, halos or decorative gradients.",
      ],
    },
  },
  {
    id: "linear",
    nameKey: "designSystem.linear",
    descriptionKey: "designSystem.linearDescription",
    sourceName: "Linear",
    coverImage:
      "https://designmd-production-assets.s3.ca-central-1.amazonaws.com/screenshots/e6683356-2b26-4bea-8279-8fae94ee175e/0-0.jpg",
    sourceUrl: "https://designmd.me/discover/linear",
    keywords: ["linear", "issue tracker", "product development", "roadmap", "项目管理", "产品研发"],
    colors: {
      paper: "#08090A",
      white: "#0F1011",
      soft: "#18191A",
      ink: "#F7F8F8",
      secondary: "#8A8F98",
      brand: "#F91880",
      brandHover: "#D91470",
      brandInk: "#FFFFFF",
      line: "#3E3E44",
    },
    fonts: { heading: "Inter", body: "Inter" },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
    radius: { control: 6, card: 10, panel: 16, pill: 999 },
    brief: {
      zh: [
        "方向参考 Linear：近黑画布、细微灰阶层次、紧凑但清楚的产品信息，以少量粉色或绿色作为状态信号。",
        "保留精细排版和轻量分隔；不要额外画线、光晕、噪点或大面积霓虹色。",
      ],
      en: [
        "Linear-inspired direction: near-black canvas, subtle neutral layers and compact yet clear product information, with small pink or green status accents.",
        "Keep typography precise and dividers quiet; do not invent line art, halos, noise or large neon areas.",
      ],
    },
  },
  {
    id: "vercel",
    nameKey: "designSystem.vercel",
    descriptionKey: "designSystem.vercelDescription",
    sourceName: "Vercel",
    coverImage:
      "https://designmd-production-assets.s3.ca-central-1.amazonaws.com/screenshots/055bbcc1-9a92-433d-8518-3da16caee514/0-0.jpg",
    sourceUrl: "https://designmd.me/discover/vercel",
    keywords: ["vercel", "deployment", "developer platform", "hosting", "开发者平台", "部署"],
    colors: {
      paper: "#FAFAFA",
      white: "#FFFFFF",
      soft: "#EBEBEB",
      ink: "#171717",
      secondary: "#4D4D4D",
      brand: "#0070F3",
      brandHover: "#005FCC",
      brandInk: "#FFFFFF",
      line: "#D8D8D8",
    },
    fonts: { heading: "Geist", body: "Geist" },
    radius: { control: 6, card: 10, panel: 14, pill: 999 },
    brief: {
      zh: [
        "方向参考 Vercel：黑白灰为主，几何无衬线字体和直截了当的开发者信息，只保留一处蓝色作为主要行动。",
        "边框与留白承担层级；避免装饰性渐变、发光和无依据的线描。",
      ],
      en: [
        "Vercel-inspired direction: black, white and gray lead, with geometric sans typography and direct developer-focused information. Reserve blue for the primary action.",
        "Use borders and whitespace for hierarchy; avoid decorative gradients, glow and unsupported line art.",
      ],
    },
  },
  {
    id: "anthropic",
    nameKey: "designSystem.anthropic",
    descriptionKey: "designSystem.anthropicDescription",
    sourceName: "Anthropic",
    coverImage:
      "https://designmd-production-assets.s3.ca-central-1.amazonaws.com/screenshots/9ac8c1b5-1abf-4e17-b944-0d6d2bffed54/0-0.jpg",
    sourceUrl: "https://designmd.me/discover/anthropic",
    keywords: ["anthropic", "research", "ai safety", "trustworthy ai", "研究", "人工智能安全"],
    colors: {
      paper: "#FAF9F5",
      white: "#FFFFFF",
      soft: "#E3DACC",
      ink: "#141413",
      secondary: "#73726C",
      brand: "#D97757",
      brandHover: "#C6613F",
      brandInk: "#FFFFFF",
      line: "#D8D4CB",
    },
    fonts: { heading: "Lora", body: "Inter" },
    brief: {
      zh: [
        "方向参考 Anthropic：暖纸白、深墨文字与陶土橙，辅以低饱和自然色，呈现安静、可信的研究气质。",
        "标题保持编辑式节奏，正文舒展易读；不要加入无关线描、光晕或科技霓虹。",
      ],
      en: [
        "Anthropic-inspired direction: warm paper, dark ink and terracotta orange, with muted natural accents for a calm, trustworthy research tone.",
        "Use editorial headline rhythm and comfortable body copy; avoid unrelated line art, halos or neon effects.",
      ],
    },
  },
  {
    id: "notion",
    nameKey: "designSystem.notion",
    descriptionKey: "designSystem.notionDescription",
    sourceName: "Notion",
    coverImage:
      "https://designmd-production-assets.s3.ca-central-1.amazonaws.com/screenshots/b097f29d-f205-418d-a1f1-81ba6120aa5f/0-0.jpg",
    sourceUrl: "https://designmd.me/discover/notion",
    keywords: ["notion", "workspace", "knowledge base", "documents", "知识库", "工作空间", "文档"],
    colors: {
      paper: "#FFFFFF",
      white: "#FFFFFF",
      soft: "#F6F5F4",
      ink: "#31302E",
      secondary: "#615D59",
      brand: "#0075DE",
      brandHover: "#005BAB",
      brandInk: "#FFFFFF",
      line: "#E8E6E4",
    },
    fonts: { heading: "Inter", body: "Inter" },
    brief: {
      zh: [
        "方向参考 Notion：近白底色、暖灰层级和轻边界，蓝色只负责可发现的主操作，内容保持友好、可扫描。",
        "用简洁的标题、列表和真实内容组织工作空间；不要加装饰线、浮夸阴影或多余图标。",
      ],
      en: [
        "Notion-inspired direction: near-white surfaces, warm gray layers and light borders. Blue is reserved for discoverable primary actions; content stays friendly and scannable.",
        "Organize workspace content with clear headings, lists and real content; avoid ornamental lines, heavy shadows or excess icons.",
      ],
    },
  },
  {
    id: "figma",
    nameKey: "designSystem.figma",
    descriptionKey: "designSystem.figmaDescription",
    sourceName: "Figma",
    coverImage:
      "https://designmd-production-assets.s3.ca-central-1.amazonaws.com/screenshots/7a640018-1412-4507-a86c-e183b986aadd/0-0.jpg",
    sourceUrl: "https://designmd.me/discover/figma",
    keywords: ["figma", "design tool", "creative canvas", "collaboration", "设计工具", "创作画布"],
    colors: {
      paper: "#FFF8F7",
      white: "#FFFFFF",
      soft: "#FFE9E6",
      ink: "#201918",
      secondary: "#6B5754",
      brand: "#972121",
      brandHover: "#7D1B1B",
      brandInk: "#FFFFFF",
      line: "#F0D7D3",
    },
    fonts: { heading: "DM Sans", body: "Inter" },
    radius: { control: 8, card: 14, panel: 20, pill: 999 },
    brief: {
      zh: [
        "方向参考 Figma：轻盈的白与淡珊瑚底色，深红作少量强调，表现协作和创作工具的开放感。",
        "让产品界面本身成为视觉重点；只有参考图中确实出现时才使用线描、渐变或装饰图形。",
      ],
      en: [
        "Figma-inspired direction: light white and pale coral surfaces with restrained deep red accents, conveying an open creative collaboration tool.",
        "Keep the product interface as the visual focus; use line art, gradients or decorative shapes only when they are present in the reference.",
      ],
    },
  },
];

export function createDiscoverDesignSystems(defineSystem) {
  return Object.fromEntries(
    REFERENCES.map((reference) => {
      const {
        id,
        nameKey,
        descriptionKey,
        sourceName,
        coverImage,
        sourceUrl,
        keywords,
        colors,
        fonts,
        brief,
        ...options
      } = reference;
      return [
        id,
        defineSystem(
          id,
          nameKey,
          descriptionKey,
          colors,
          fonts,
          options.type ?? DEFAULT_TYPE,
          keywords,
          { ...options, brief, coverImage, sourceName, sourceUrl, spacing: SPACING },
        ),
      ];
    }),
  );
}
