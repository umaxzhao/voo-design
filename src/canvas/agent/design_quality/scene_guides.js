/**
 * Scene-specific design guides for the design agent. Each guide is a concrete
 * layout contract for one artifact kind: what to build, at which sizes, with
 * which copy density, and which quality checks apply. The guides are pure data
 * plus pure string helpers (no runtime imports) so they can be appended to the
 * agent system prompt and unit-tested in isolation.
 *
 * Contract: { id, name, whenToUse, structure, typography, layout, content,
 * qualityChecks, pitfalls } — every list holds 4-6 executable rules and the
 * quality checks intentionally use the lint rule names (overlap/overflow/
 * contrast/typeScale/…) so the model can self-correct against lintDesign().
 */

const GUIDE_SECTIONS = [
  ["structure", "Structure"],
  ["typography", "Typography"],
  ["layout", "Layout"],
  ["content", "Content"],
  ["qualityChecks", "Quality checks"],
  ["pitfalls", "Pitfalls"],
];

/** Raw aliases, mixed English / Chinese, normalized at module load. */
const GUIDE_ALIASES = {
  landing: [
    "landing",
    "landing page",
    "landing-page",
    "homepage",
    "home page",
    "marketing page",
    "marketing site",
    "one pager",
    "landing 页",
    "落地页",
    "官网首页",
    "官网",
    "产品介绍页",
    "营销页",
    "首页",
  ],
  mobile: [
    "mobile",
    "mobile app",
    "mobile-app",
    "ios",
    "ios app",
    "android",
    "android app",
    "iphone",
    "app screen",
    "mobile screen",
    "移动应用",
    "移动端",
    "手机应用",
    "手机端",
    "移动 app",
    "app 界面",
    "小程序",
  ],
  web: [
    "web",
    "web app",
    "webapp",
    "web site",
    "website",
    "admin panel",
    "admin app",
    "back office",
    "saas app",
    "web 应用",
    "网页",
    "网站",
    "后台管理",
    "管理后台",
    "后台系统",
  ],
  slides: [
    "slides",
    "slide",
    "slide deck",
    "slidedeck",
    "deck",
    "presentation",
    "keynote",
    "ppt",
    "pptx",
    "powerpoint",
    "演示文稿",
    "幻灯片",
    "演示",
    "汇报",
    "路演",
  ],
  dashboard: [
    "dashboard",
    "admin dashboard",
    "analytics dashboard",
    "analytics",
    "kpi",
    "data dashboard",
    "数据看板",
    "看板",
    "仪表盘",
    "数据仪表盘",
    "数据面板",
    "分析看板",
    "报表",
  ],
  other: [
    "other",
    "others",
    "misc",
    "general",
    "freeform",
    "free form",
    "poster",
    "banner",
    "flyer",
    "social post",
    "social media",
    "cover",
    "其他",
    "其它",
    "海报",
    "宣传单",
    "社媒",
    "社交媒体",
    "朋友圈",
    "封面",
    "自由版式",
  ],
};

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

/** Lowercases, turns separators into spaces and collapses whitespace. */
function normalizeSceneText(input) {
  if (typeof input !== "string") return "";
  return input
    .toLowerCase()
    .replace(/[_\-\/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One matcher per alias. Latin aliases need word boundaries so that "web"
 * does not match "cobweb" and "ios" does not match "scenarios"; CJK aliases
 * are matched as plain substrings.
 */
const SCENE_MATCHERS = Object.entries(GUIDE_ALIASES).flatMap(([id, aliases]) =>
  aliases.map((alias) => {
    const needle = normalizeSceneText(alias);
    return {
      id,
      needle,
      cjk: CJK_RE.test(needle),
      pattern: CJK_RE.test(needle)
        ? null
        : new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`),
    };
  }),
);

export const SCENE_GUIDES = {
  landing: {
    id: "landing",
    name: "Landing Page / 落地页",
    whenToUse:
      "单页营销站、产品发布页、获客落地页；用户提到 landing、官网首页、产品介绍页。",
    structure: [
      "单页：nav 64px → hero 900px → 社会证明 → 3 栏 feature → 证言/FAQ → 页脚，不分页。",
      "hero 只放 1 个主 CTA，次级动作降级为文字链接；首屏按钮不超过 2 个。",
      "社会证明紧跟 hero：4-6 个灰度客户 logo 单行，或 3 个带单位的数字，高 ≤120px。",
      "feature 固定 3 栏：图标或截图 + 12-16 字标题 + ≤40 字说明，三栏结构互不相同。",
      "页脚 ≤4 列 + 版权/法务行，页脚前留 96px 空白。",
    ],
    typography: [
      "1440 画布 H1 56-72px / 700 / 行高 1.1，最多 2 行。",
      "正文 16-18px / 行高 1.6，辅助 14px；全站 1 个 display + 1 个正文字体。",
      "section 标题 32-40px，与正文对比 ≥2 倍；全页字号 ≤5 档（对齐 typeScale）。",
      "CTA 16px / 600，按钮高 48-52px，左右 padding 24-32px。",
      "指标数字用 tabular；logo 墙与脚注最小 12px。",
    ],
    layout: [
      "内容最大宽 1120-1200px 居中，左右留白 ≥80px，section 间距 96-128px。",
      "首屏不对称两栏（左文案 55% / 右视觉 45%），禁止居中堆叠 hero。",
      "hero 主视觉面积 ≥ 同组元素 2 倍，用真实产品截图或简洁几何图形。",
      "间距走 4px 网格：组内 8-16px、组间 32-64px、section 间 96px+。",
      "nav 与 hero 左对齐同轴；feature 三栏等高、gutter 24-32px。",
    ],
    content: [
      "H1 是一句结果导向价值主张（≤18 字），副标题说明为谁解决什么问题。",
      "社会证明写真实姓名/职位/公司 + 具体数字，不用 John Doe。",
      "feature 写用户收益而非功能名，禁止 lorem ipsum 与占位文案。",
      "CTA 文案具体（免费试用 14 天），旁边一行微文案（无需信用卡）。",
      "页脚含公司名、版权、2-4 个真实法律链接。",
    ],
    qualityChecks: [
      "overlap/overflow：卡片、文字、按钮不重叠且都在父 frame 内。",
      "centerStackedHero：首屏不得标题+副标题+按钮居中堆叠。",
      "noFocal/flatHierarchy：每个 section 有 1 个主元素，面积 ≥ 同级 2 倍。",
      "contrast：正文 ≥4.5:1、≥24px 标题 ≥3:1；typeScale 只用 token 字号。",
      "identicalCards/offGrid：避免 3 张完全相同的 feature 卡，间距全为 4 的倍数。",
    ],
    pitfalls: [
      "紫蓝渐变+发光球=模板感，直接判负；强调色只占画面 5-10%。",
      "6 个 feature 硬塞进 3 栏，文字溢出。",
      "Learn more 等无信息 CTA 反复出现。",
      "首屏堆 3 个按钮 + 2 个 badge，用户不知道点哪。",
      "做成多页或无限滚动却无章节分隔。",
    ],
  },

  mobile: {
    id: "mobile",
    name: "Mobile App / 移动应用",
    whenToUse:
      "手机 App 单屏与流程页、iOS/Android 界面；用户提到 mobile app、移动应用、iPhone。",
    structure: [
      "画板固定 393×852（iPhone 15），顶部状态栏 59px、底部 home indicator 34px 必须可见。",
      "顶部 nav bar 44px（返回+标题+操作）；底部 tab bar 49px + 34px 安全区，最多 5 个 tab。",
      "首屏一屏一任务：标题区 → 搜索/筛选 → 列表或卡片流 → 底部 tab。",
      "列表行高 64-72px：头像/图标 40px + 主文案 + 次文案 + 右侧数值/箭头。",
      "空态、加载、错误各设计一屏；空态含图标、1 句说明、1 个主按钮。",
    ],
    typography: [
      "导航标题 17px/600；大标题 28-34px/700；正文 17px/行高 1.4；辅助 15px。",
      "正文不小于 15px，11px 仅限 tab 标签或角标。",
      "单屏字体 ≤2 种、字号 ≤5 档，全部来自 typeScale。",
      "数字用 tabular，金额右对齐；按钮 17px/600。",
    ],
    layout: [
      "左右安全边距 16-20px，内容固定宽 353-361px，禁止横向滚动。",
      "所有可点击区域 ≥44×44px，相邻目标间距 ≥8px。",
      "主操作放拇指区（距底 120px 内），破坏性操作远离主 CTA。",
      "卡片圆角 12-16px、内边距 16px；分隔线 1px hairline，不用重阴影。",
      "滚动内容不被 tab bar 遮挡，底部留出安全区距离。",
    ],
    content: [
      "用真实姓名、头像 initials、时间（14 Mar, 9:41）和具体数字，不用 John Doe。",
      "标题 1 行 ≤20 字，列表项 ≤2 行，超长省略。",
      "空态和错误态给行动按钮，错误说明原因与下一步。",
      "角标数字真实（3、12、99+），不放无意义占位。",
    ],
    qualityChecks: [
      "overflow：所有元素在 393×852 内，底部内容不被 tab bar 压住。",
      "overlap：文字不与图标/头像重叠，列表行之间不互相侵入。",
      "touch target：可点击区域 ≥44×44，tab 图标+标签整体可点。",
      "contrast ≥4.5:1；typeScale 只用 token 字号且 ≤5 档。",
      "misalignment/offGrid：列表左边缘统一，间距是 4 的倍数。",
    ],
    pitfalls: [
      "把桌面布局缩成手机版，字号 12px、点击区 20px。",
      "忽略状态栏和 home indicator，内容被裁或压在手势区。",
      "tab bar 放 6-7 个入口且没有选中态。",
      "所有列表项同尺寸同色，无层级、无空态。",
    ],
  },

  web: {
    id: "web",
    name: "Web App / Web 应用",
    whenToUse:
      "桌面 SaaS、后台管理、B 端网页应用；用户提到 web app、后台、管理系统、设置页。",
    structure: [
      "App shell：左侧栏 240-280px + 顶栏 56-64px + 内容区；登录/设置页可省侧栏。",
      "侧栏：logo 区 64px、导航分组每组 4-8 项、底部用户卡，当前项有选中态。",
      "内容区 12 栏网格，主内容最大宽 1200px；列表页含工具栏、表头、分页。",
      "表格必须有排序表头、行 hover、空态、批量选择，行高 44-56px。",
      "设置页按账户/团队/通知/计费分组；权限页用角色×权限矩阵。",
    ],
    typography: [
      "正文 14px/行高 1.5；页面标题 20-24px，卡片标题 15-16px。",
      "表格 13-14px，数字列右对齐用 tabular；ID/代码用 mono 12-13px。",
      "辅助文字 12-13px，无小于 12px 的正文；全页字号 ≤5 档。",
      "按钮 14px/500，主按钮高 36-40px，表格操作 28-32px。",
    ],
    layout: [
      "最小支持 1280×800；侧栏可折叠到 64px，内容区 ≥720px。",
      "内容边距 24-32px、卡片内边距 16-20px、网格 gutter 16-24px。",
      "顶栏 sticky：标题/面包屑左，主操作右；一页只放 1 个主按钮。",
      "表单标签在上、错误文案在下方 12px，字段间距 16-20px。",
      "删除/转移等破坏性操作独立 danger zone，与保存按钮隔 ≥48px。",
    ],
    content: [
      "表格列名带单位（MRR (USD)、Last active），不留空占位。",
      "空态 = 图标 + 1 句解释 + 1 个主操作，并说明下一步。",
      "权限页写真实角色（Owner/Admin/Member）和可见说明，不只是开关。",
      "设置项有默认值与保存反馈；危险操作二次确认。",
    ],
    qualityChecks: [
      "overflow/overlap：表格、卡片、弹层不溢出容器、不互相覆盖。",
      "misalignment：表头单元格、表单标签与输入框共用左基线。",
      "contrast ≥4.5:1，disabled 态文本也需 ≥3:1 可辨识。",
      "typeScale ≤5 档；offGrid 检查所有间距为 4 的倍数。",
      "identicalCards：避免 3 个以上同尺寸统计卡且无主次。",
    ],
    pitfalls: [
      "只按 1440 宽设计，1280 下侧栏+表格直接溢出。",
      "表格无空态、无加载态，筛选后只剩空白。",
      "每页 4 个同等权重按钮，主操作不明确。",
      "把移动端卡片流照搬到桌面后台，浪费横向空间。",
    ],
  },

  slides: {
    id: "slides",
    name: "Slides / 演示文稿",
    whenToUse:
      "16:9 演示、pitch deck、汇报材料；用户提到 slides、幻灯片、PPT、演示文稿。",
    structure: [
      "画板 1920×1080（16:9）：封面 → 目录 → 内容页 → 结束页，一页一个观点。",
      "页标题就是结论句，正文只放支撑论据。",
      "封面含标题、副标题、日期/讲者；结束页含行动号召与联系方式。",
      "内容页统一：标题 + 正文/图表区 + 页脚（左 logo、右页码）。",
      "章节过渡页只放章节名+编号，用色块或大字区分节奏。",
    ],
    typography: [
      "页标题 64-96px/700，最多 2 行；正文 28-36px，注释 18-20px。",
      "每页字号 ≤3 档，来自同一 typeScale；标题与正文对比 ≥2 倍。",
      "正文每行 ≤16 个汉字，行高 1.3-1.4。",
      "全 deck 最多 2 个字重、1 个字体家族；数据可用 mono。",
    ],
    layout: [
      "四周安全边距 ≥96px；标题基线与页码位置每页一致。",
      "12 栏网格，图文 50/50 或 60/40，图表高 ≤内容区 80%。",
      "一页 ≤3 个视觉块，留白 ≥30%，不用满画布。",
      "页码固定在右下 24px，页脚字号 16-18px，每页都有。",
    ],
    content: [
      "正文每页 ≤3 条要点，每条 ≤3 行；超出就拆页。",
      "每页放具体数字或例子（转化率 12.4%），不写空泛形容词。",
      "图表只标必要刻度，注明单位与时间范围，一页一图。",
      "来源/引用放页脚注释，保持真实可核。",
    ],
    qualityChecks: [
      "overflow：文字和图表不越安全边距、不压页脚页码。",
      "overlap：标题、正文、图表标签互不重叠。",
      "contrast ≥4.5:1；投影场景下正文对比要更高。",
      "typeScale ≤3 档；标题位置统一（misalignment）。",
      "flatHierarchy：每页 1 个明确视觉焦点（标题或图表）。",
    ],
    pitfalls: [
      "一页塞 8 条 bullet，正文 12px 投影看不清。",
      "每页标题位置/字号随机变化，deck 不成体系。",
      "缺页码、缺结束页，讲完直接黑屏。",
      "用低对比灰字和细线图表假装高级感。",
    ],
  },

  dashboard: {
    id: "dashboard",
    name: "Dashboard / 数据看板",
    whenToUse:
      "数据看板、运营/财务/产品分析页；用户提到 dashboard、数据看板、仪表盘、KPI。",
    structure: [
      "结构：顶栏（页面名+日期范围+筛选）→ KPI 行（3-5 卡）→ 主图表区 → 明细表。",
      "KPI 卡：1 张主卡用描边/面积强调，其余等宽；卡内放标签、数值、环比。",
      "图表区 2/3 主图 + 1/3 辅图（Top 5 列表或环形图），每图只回答 1 个问题。",
      "明细表 6-10 行真实记录，含状态、时间、金额、负责人。",
      "每个数据区域都要设计空态、加载骨架、错误重试。",
    ],
    typography: [
      "KPI 数值 32-48px/700/tabular；标签 12-13px、字距 0.04em。",
      "图表轴与图例 11-12px；正文/表格 13-14px。",
      "单位、%、货币符号与数值同字号，tabular 对齐。",
      "全页字号 ≤5 档；标题 20-24px，卡片标题 14-16px。",
    ],
    layout: [
      "12 栏网格，gutter 16-24px，卡片内边距 16-20px，图表高 280-360px。",
      "筛选器统一一行（日期范围+维度+对比开关），sticky 在顶栏下。",
      "同组卡片等宽等高，数值列右对齐，卡片与表格共用左基线。",
      "窄屏降级单列，图表最小高 200px，KPI 卡 2×2。",
    ],
    content: [
      "所有数字带真实单位与日期（$48,230、2026-03-14），禁止随机假数。",
      "每个 KPI 给对比（+12.4% vs 上月）和统计口径。",
      "图表选择：比较用 bar、趋势用 line，占比 2-5 项才用 donut。",
      "空态说明为什么没数据（无权限/无记录），并给下一步。",
    ],
    qualityChecks: [
      "overlap/overflow：KPI 卡、图表、图例不互相遮挡、不溢出。",
      "noFocal：KPI 行要有主卡，避免所有卡片权重相同。",
      "contrast：图表色 ≥3:1、标签 ≥4.5:1，不只靠颜色区分系列。",
      "typeScale ≤5 档；数值列 tabular 右对齐（misalignment）。",
      "offGrid：卡片高度与间距为 4 的倍数。",
    ],
    pitfalls: [
      "编造无单位的数字，图表没有时间范围。",
      "8 色饼图 + 3D 效果，读不出信息。",
      "只有正常态，无空/加载/错误态，筛选后一片空白。",
      "y 轴不从 0 开始夸大增长，折线与面积混用误导。",
    ],
  },

  other: {
    id: "other",
    name: "Other / 自由版式",
    whenToUse:
      "海报、社媒图、封面、Banner 等自由画布；用户提到 other、海报、banner、社媒。",
    structure: [
      "先定画布：海报 1080×1350、方形 1080×1080、Story 1080×1920、Banner 1200×628。",
      "版式只留 3 层：主标题 → 1 句副标题 → 1 个行动/信息块，其余删掉。",
      "元素挂到 8/12 栏网格或明确中轴，不做随机摆放。",
      "必须有 1 个视觉主体（图/大字/图形），面积 ≥ 其余元素之和。",
    ],
    typography: [
      "主标题为画布宽 8-12%（1080 宽约 96-128px），最多 2 行。",
      "正文 ≥24px（社媒）/ ≥32px（海报），最小可见字 16px。",
      "字体 ≤2 家族、字号 ≤4 档；标题与正文对比 ≥2.5 倍。",
      "正文对比 ≥4.5:1，细字不低于 3:1。",
    ],
    layout: [
      "安全边距 ≥画布短边 6%（1080 约 64px），文字离边 ≥32px。",
      "间距走 8px 网格；组内间距 ≤组间距的 1/2。",
      "重要信息放上 1/3 或中心，边缘不放必须阅读的内容。",
      "印刷品留 3mm 出血与 8mm 安全区。",
    ],
    content: [
      "主文案 ≤12 字、副文案 ≤2 行，一眼读完。",
      "含真实信息：品牌名、日期、地点、二维码/链接（若有）。",
      "二维码/网址留 ≥120×120px 可扫面积，并放在安全区内。",
      "不用 lorem ipsum；短文案也要写清对象和利益点。",
    ],
    qualityChecks: [
      "overflow：文字/图形不被裁切；overlap：元素不重叠（刻意叠放除外）。",
      "contrast ≥4.5:1，压缩或投影后仍可读。",
      "flatHierarchy：有明确第一视觉点，不被同权重元素稀释。",
      "decorativeLines：去掉无信息量的线框、光斑、贴纸。",
    ],
    pitfalls: [
      "5 种字体+3 种主色+特效，信息完全失焦。",
      "文字贴边或被裁，社媒裁切后关键信息丢失。",
      "所有元素一样大，没有主次。",
      "用模板水印或占位图标交付。",
    ],
  },
};

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Resolves a scene guide from an id ("landing", "mobile-app"), an English or
 * Chinese alias ("landing page", "移动应用", "演示文稿") or a natural-language
 * request ("帮我做一个数据看板"). Returns null when no scene matches — it never
 * silently falls back to `other`.
 */
export function getSceneGuide(kindOrText) {
  const text = normalizeSceneText(kindOrText);
  if (!text) return null;
  if (hasOwn(SCENE_GUIDES, text)) return SCENE_GUIDES[text];

  let best = null;
  for (const matcher of SCENE_MATCHERS) {
    const index = matcher.cjk
      ? text.indexOf(matcher.needle)
      : (matcher.pattern.exec(text)?.index ?? -1);
    if (index < 0) continue;
    if (
      !best ||
      index < best.index ||
      (index === best.index && matcher.needle.length > best.length)
    ) {
      best = { id: matcher.id, index, length: matcher.needle.length };
    }
  }
  return best ? SCENE_GUIDES[best.id] : null;
}

/**
 * Renders a guide as a compact prompt block that can be appended next to
 * "=== Design quality (follow strictly) ===". Unknown scenes return "" so the
 * caller can concatenate it unconditionally.
 */
export function sceneGuidePromptBlock(kindOrText) {
  const guide = getSceneGuide(kindOrText);
  if (!guide) return "";
  const lines = [
    `=== Scene guide: ${guide.name} ===`,
    `When to use: ${guide.whenToUse}`,
  ];
  for (const [key, label] of GUIDE_SECTIONS) {
    lines.push(`[${label}]`);
    for (const rule of guide[key]) lines.push(`- ${rule}`);
  }
  return lines.join("\n");
}
