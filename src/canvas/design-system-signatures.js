/** Curated artifact presets, isolated from registry and resolution logic. */
export function createSignatureDesignSystems(defineSystem) {
  return {
  /**
   * VOO signature collection. These replace the generic defaults in spirit:
   * each one is a distinct art direction with its own grid, type scale and
   * component rules, not a recolour of the same template.
   */
  axiom: defineSystem(
    "axiom",
    "designSystem.axiom",
    "designSystem.axiomDescription",
    {
      paper: "#F1EEE7",
      white: "#FFFFFF",
      soft: "#E4DFD1",
      ink: "#101010",
      secondary: "#5F5B52",
      brand: "#FF3D00",
      brandHover: "#D93200",
      brandInk: "#FFFFFF",
      line: "#CFC8B8",
    },
    { heading: "Space Grotesk", body: "Inter" },
    {
      desktop: { display: 92, title: 44, body: 17, caption: 12 },
      mobile: { display: 48, title: 30, body: 16, caption: 12 },
    },
    ["axiom", "avant-garde", "editorial tech", "poster", "前卫", "先锋", "技术编辑", "海报"],
    {
      fontsLabel: "IBM Plex Mono",
      radius: { control: 2, card: 4, panel: 8, pill: 999 },
      brief: {
        zh: [
          "网格：12 栏可见的 1px hairline 网格；版面按 7/5 或 5/7 非对称分割，留白极大。",
          "字体：display 使用 Space Grotesk 超大字（桌面 92px/行高 0.92），正文 Inter 17px；所有标签、数字、图注使用 IBM Plex Mono 11-12px 大写字母 + 0.08em 字距。",
          "用色：纸色底 + 单一信号橙 #FF3D00，橙色只出现在一个主行动或一个数据点；禁止渐变、发光、重阴影。",
          "组件：卡片只用 1px 线框，不用填充；按钮直角 2px 圆角，高度 44px；导航 64px 高，只用一条底线。",
          "图像：全出血黑白或低饱和摄影，叠 8-12% 墨色；不要圆角图片，不要贴纸感装饰。",
          "节奏：每屏一个超大数字/标题作为锚点，其余元素缩小到 12-17px 形成极端层级对比。",
        ],
        en: [
          "Grid: a visible 12-column hairline grid; split the page 7/5 or 5/7 asymmetrically with very generous margins.",
          "Type: Space Grotesk display at poster scale (92px desktop, 0.92 line-height), Inter 17px body, and IBM Plex Mono 11-12px uppercase labels with 0.08em tracking.",
          "Colour: warm paper + one signal orange #FF3D00 used on exactly one action or data point; no gradients, glow or heavy shadows.",
          "Components: cards are 1px outlines with no fill; buttons are 2px radius and 44px tall; the navigation is 64px tall with a single bottom rule.",
          "Imagery: full-bleed black-and-white or low-saturation photography with an 8-12% ink overlay; no rounded image corners, no sticker decoration.",
          "Rhythm: every screen has one oversized number or headline anchor; everything else drops to 12-17px for extreme hierarchy contrast.",
        ],
      },
    },
  ),
  "void-os": defineSystem(
    "void-os",
    "designSystem.voidOs",
    "designSystem.voidOsDescription",
    {
      paper: "#050607",
      white: "#0B0E10",
      soft: "#101617",
      ink: "#E8F5EF",
      secondary: "#74827C",
      brand: "#7CF7C4",
      brandHover: "#4FE3A9",
      brandInk: "#03120B",
      line: "#1D2A26",
    },
    { heading: "Sora", body: "Inter" },
    {
      desktop: { display: 80, title: 38, body: 15, caption: 12 },
      mobile: { display: 44, title: 27, body: 14, caption: 12 },
    },
    ["void", "terminal", "operator", "cyber", "dark console", "终端", "控制台", "赛博", "数据终端"],
    {
      fontsLabel: "JetBrains Mono",
      radius: { control: 6, card: 10, panel: 16, pill: 999 },
      brief: {
        zh: [
          "定位：深色操作台/监控终端，信息密度高但不能脏；网格以 8px 为单位，桌面内容加宽到 12 栏。",
          "字体：标题 Sora 38px；正文 Inter 15px；所有数字、ID、状态、日志使用 JetBrains Mono 12px，等宽对齐。",
          "用色：近黑底 + 薄荷绿 #7CF7C4 信号色，青色 #64D8FF 只用于次要状态；禁止大面积霓虹渐变与光斑。",
          "组件：1px 半透明分隔线、状态点（8px）+ 大写 10px 标签；表格行高 40px；输入框 40px 高、6px 圆角。",
          "图表：只用纯色折线/柱状，网格线 #1D2A26；数值右对齐，单位和时间戳用 muted 色。",
          "装饰：允许 scanline 式的 1px 水平线节奏，但不要噪点贴图、不要发光文字。",
        ],
        en: [
          "Positioning: a dark operator console; dense information, never dirty. Use an 8px base and a 12-column desktop grid.",
          "Type: Sora 38px headings, Inter 15px body, JetBrains Mono 12px for every number, ID, status or log line, tabular-aligned.",
          "Colour: near-black ground with mint #7CF7C4 as the signal colour; cyan #64D8FF only for secondary states; no large neon gradients or glow blobs.",
          "Components: 1px translucent dividers, 8px status dots with 10px uppercase labels, 40px table rows, 40px inputs with 6px radius.",
          "Charts: flat line/bar marks on #1D2A26 grid lines; numbers right-aligned, units and timestamps in the muted colour.",
          "Decoration: a scanline rhythm of 1px horizontal rules is allowed; no noise textures and no glowing text.",
        ],
      },
    },
  ),
  bloom: defineSystem(
    "bloom",
    "designSystem.bloom",
    "designSystem.bloomDescription",
    {
      paper: "#FFF6EA",
      white: "#FFFFFF",
      soft: "#FFE6D2",
      ink: "#221407",
      secondary: "#7A5B44",
      brand: "#FF4D8D",
      brandHover: "#E33B78",
      brandInk: "#FFFFFF",
      line: "#F0D8C4",
    },
    { heading: "Fraunces", body: "Manrope" },
    {
      desktop: { display: 84, title: 40, body: 17, caption: 13 },
      mobile: { display: 46, title: 28, body: 16, caption: 13 },
    },
    ["bloom", "playful", "soft pop", "y2k", "candy", "潮流", "活泼", "多巴胺", "糖果", "可爱"],
    {
      radius: { control: 14, card: 24, panel: 32, pill: 999 },
      brief: {
        zh: [
          "定位：软糖质感的潮流消费品牌；奶油纸底 + 覆盆子粉，形状大而圆，允许贴纸/徽章式装饰。",
          "字体：发丝衬线 Fraunces 40-84px 标题（可斜体强调），Manrope 17px 正文；标签 11px 大写圆体。",
          "用色：奶油 #FFF6EA 底 + 覆盆子 #FF4D8D 主色，浅橙 #FFE6D2 做分组面；禁止冷灰与蓝紫企业渐变。",
          "组件：卡片 24px 圆角、无边框、柔和 1px 内描边；按钮 14px 圆角、48px 高；chip 为全圆角胶囊并允许 2-3 度旋转。",
          "装饰：小贴纸、星形/花瓣几何、手写感短线；每屏最多 2 种装饰元素，避免堆满。",
          "图像：暖调生活摄影裁成圆角卡片或拱形；不要黑白、不要硬边直角。",
        ],
        en: [
          "Positioning: a soft-pop consumer brand. Cream paper with raspberry pink, large rounded shapes, sticker and badge decoration allowed.",
          "Type: Fraunces hairline serif 40-84px headlines (italics for emphasis), Manrope 17px body, 11px uppercase rounded labels.",
          "Colour: #FFF6EA cream ground, #FF4D8D raspberry as the action colour, #FFE6D2 soft peach for grouping; no cold grays or corporate blue-violet gradients.",
          "Components: 24px-radius cards with a soft 1px inner outline and no hard border, 48px buttons at 14px radius, fully rounded chips that may rotate 2-3 degrees.",
          "Decoration: small stickers, star/petal geometry and hand-drawn short strokes; at most two decoration families per screen.",
          "Imagery: warm lifestyle photography cropped into rounded cards or arches; no black-and-white, no sharp square corners.",
        ],
      },
    },
  ),
  };
}
