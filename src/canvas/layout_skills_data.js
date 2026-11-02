/**
 * Design-skill presets and rule tables for the Design node's AI layout generation.
 * OpenDesign-derived guidance below is adapted under Apache-2.0; see NOTICE
 * and scripts/license-texts/opendesign.txt. VOO condensed the guidance and
 * added its own examples, dimensions and constraints. Original import revision
 * was not recorded; the independently reviewed upstream revision is in NOTICE.
 */

export { LAYOUT_MEDIA, layoutMedia } from "./layout-media-presets.js";

export const LAYOUT_STYLES = {
  minimal: {
    labelKey: "node.layout.style.minimal",
    brief:
      "风格：极简主义。大量留白；无衬线字体；用细线、间距和对齐制造秩序；元素数 ≤6，不用装饰性元素；点缀色全页 ≤2 处。",
    palette: [
      { role: "背景", hex: "#FAFAF8" },
      { role: "主文字（墨色）", hex: "#1A1A1A" },
      { role: "次要文字", hex: "#8A8A85" },
      { role: "点缀强调（唯一彩色，≤2 处）", hex: "#D94F3D" },
    ],
  },
  editorial: {
    labelKey: "node.layout.style.editorial",
    brief:
      "风格：杂志编辑风。衬线大标题（Georgia / 宋体）+ 醒目期号/日期数字；文字错落有层次；构图偏置不对称；编辑感。",
    palette: [
      { role: "纸面背景", hex: "#F5F1E8" },
      { role: "墨色文字", hex: "#1F1B16" },
      { role: "副墨（次要文字/线）", hex: "#6B6459" },
      { role: "编辑红点缀", hex: "#B3261E" },
    ],
  },
  memphis: {
    labelKey: "node.layout.style.memphis",
    brief:
      "风格：孟菲斯。明快撞色几何拼贴（圆/三角/半圆/条纹/波点），粗黑描边，俏皮活泼，不要精致感；装饰散落但克制（≤5 处）。",
    palette: [
      { role: "底色", hex: "#FFF3E0" },
      { role: "暖黄", hex: "#FFC24B" },
      { role: "青绿", hex: "#2EC4B6" },
      { role: "珊瑚红", hex: "#FF6B6B" },
      { role: "蓝紫", hex: "#3A6EA5" },
      { role: "描边/主文字墨色", hex: "#1A1A1A" },
    ],
  },
  cyberpunk: {
    labelKey: "node.layout.style.cyberpunk",
    brief:
      "风格：赛博朋克。深底霓虹，等宽字体，网格线/扫描线装饰（≤3 处），少量故障错位；科技感。",
    palette: [
      { role: "深底背景", hex: "#0B0E17" },
      { role: "霓虹青", hex: "#00F0FF" },
      { role: "霓虹品红", hex: "#FF2E88" },
      { role: "电光紫", hex: "#7B5CFF" },
      { role: "主文字", hex: "#E8F6FF" },
    ],
  },
  chinese: {
    labelKey: "node.layout.style.chinese",
    brief:
      "风格：新中式。宣纸底墨字，宋体/楷体字重，留白讲究，气韵大于信息量；可用竖向排版标题或落款；印章点缀 ≤1 处。",
    palette: [
      { role: "宣纸背景", hex: "#F7F1E3" },
      { role: "墨色文字", hex: "#2B2B2B" },
      { role: "淡墨（次要）", hex: "#6E6759" },
      { role: "印章红（≤1 处）", hex: "#C0392B" },
    ],
  },
  bold: {
    labelKey: "node.layout.style.bold",
    brief:
      "风格：大字报。一个超大主标题占据画面主要面积，文字即图形；背景 1-2 个大色块几何分割；粗黑体；高对比。",
    palette: [
      { role: "主背景（黄）", hex: "#FFD400" },
      { role: "墨色文字/色块", hex: "#111111" },
      { role: "反色白（可作副背景）", hex: "#FFFFFF" },
      { role: "警示红（可选点缀）", hex: "#E63946" },
    ],
  },
  gradient: {
    labelKey: "node.layout.style.gradient",
    brief:
      "风格：柔和渐变。莫兰迪/奶咖渐变背景（禁止默认紫蓝），圆角卡片，现代 SaaS 感，无衬线，层次干净；渐变 ≤2 处。",
    palette: [
      { role: "背景渐变起点", hex: "#F7E8DC" },
      { role: "背景渐变终点", hex: "#E8D9E8" },
      { role: "主文字", hex: "#2D2A32" },
      { role: "次要文字", hex: "#8A8490" },
      { role: "强调紫", hex: "#B07AA8" },
      { role: "卡片白", hex: "#FFFFFF" },
    ],
  },
  flat: {
    labelKey: "node.layout.style.flat",
    brief:
      "风格：扁平插画感。纯色块 + 圆角几何装饰（圆/圆角矩形/点），明亮协调，无渐变无阴影，轻松友好；装饰 ≤4 处。",
    palette: [
      { role: "背景", hex: "#FFFFFF" },
      { role: "亮蓝", hex: "#4A90D9" },
      { role: "暖黄", hex: "#F5A623" },
      { role: "粉", hex: "#F2726F" },
      { role: "绿", hex: "#50B5A9" },
      { role: "主文字墨色", hex: "#333333" },
    ],
  },
};

export const LAYOUT_DIRECTIONS = {
  centered: {
    labelKey: "node.layout.direction.centered",
    brief:
      "构图：居中主视觉。主标题与核心图形沿中轴对称；信息区在下部对称分布；整体平衡、庄重。",
  },
  grid: {
    labelKey: "node.layout.direction.grid",
    brief:
      "构图：网格对称。画面按 2-4 列等分网格排布内容（标题、正文、卡片各占一格）；秩序感强；适合信息多的版式。",
  },
  asymmetric: {
    labelKey: "node.layout.direction.asymmetric",
    brief:
      "构图：不对称。大标题偏置（靠左或靠上角），一侧重一侧轻，用大块留白对冲；有动感和张力；避免任何元素居中。",
  },
  fullbleed: {
    labelKey: "node.layout.direction.fullbleed",
    brief:
      "构图：满版。背景色块或大图形铺满整个画布，文字和元素叠加其上；信息直接压在色块/图形上，边距可以小，视觉冲击强。",
  },
};

export { ANTI_SLOP_RULES } from "./layout-design-rules.js";

/**
 * The hard HTML contract every generated layout must obey. Kept as one string
 * so the parser (`html_import.js`) and the prompt can never drift apart.
 */
export const HTML_CONTRACT = [
  "你是专业平面设计师，任务是把下面要求做成一个版式设计，输出【单个 HTML 文件】。",
  "硬性规范（违反任何一条都算失败）：",
  "1. 画布固定为 {width}×{height}px：最外层一个 <div> 容器，width 与 height 固定为该尺寸，overflow:hidden，background 为页面底色。",
  "2. 最外层画布使用 position:relative 或 position:absolute；页面主要区块可用 position:absolute 和 px 精确定位，区块内部优先用 display:flex 或 display:grid、gap、padding 组织可编辑子层。不要给 flex/grid 子元素同时写互相冲突的绝对坐标；禁止 float、媒体查询、动画、transition、CSS 变量。",
  "3. 只允许使用这些 HTML 标签：div、section、header、main、footer、nav、h1-h6、p、span、strong、em、a、ul、li、button、img、hr、br；可使用内嵌 svg/g/path/rect/circle/ellipse/line/polyline/polygon 绘制可编辑矢量装饰。",
  "4. 样式全部写在元素的 style 内联属性里；颜色用 #rrggbb 或 rgba()；字体写具体字体族名（如 Arial Black、Georgia、SimHei、monospace、serif），字号用 px。",
  "5. 图片一律用 <img> 标签 + src 属性（占位图只允许 https://picsum.photos/seed/{seed}/200/200 这类，禁止 unsplash、placehold 等其他图床），禁止用 background-image。",
  "6. 文字必须可读，字号分级必须明确：主视觉标题（海报主标题，或网页首屏的大标题）必须是画面中最大的元素——海报 88-140px，网页首屏 72-120px，低于 64px 一律算失败；副标题 28-52px；正文 16-26px。每个文字元素显式设置 font-size 与 line-height（px），多行文字给足高度和下方间距，文字不越出画布。",
  "7. 每个元素必须有明确的尺寸或由父级 flex/grid 布局确定位置，元素之间不许重叠到不可读；文字元素的 width 请根据文字实际长短设定合适包裹宽度，不要无故设置撑满全画布的大宽度。",
  "8. 输出直接以 <!DOCTYPE html> 或 <div> 开头，不要任何解释文字，不要 Markdown 代码块围栏。",
].join("\n");

/**
 * Design capabilities offered by the layout generator, ardot-platform style:
 * each skill is an entry point (poster / UI / social / banner) that pins the
 * canvas media preset; style and composition stay independent refinements.
 * `icon` is a string key the UI maps onto an icon component (this module is
 * React-free), `labelKey`/`descKey` are UI copy and must exist in zh/en.
 */
export const LAYOUT_SKILLS = {
  poster: {
    labelKey: "node.layout.skill.poster",
    descKey: "node.layout.skill.posterDesc",
    icon: "layout",
    media: "poster",
    layout:
      "【版式结构 — 海报】L01 Hero 封面：巨大主标题（画面最大元素）+ 副标题/kicker + 1-2 行引言 + 底部信息区（日期/地点/主办，成组不散落）；L02 信息分层：主标题区占上部 50-60%，中部主体图形或留白，下部信息区 2-3 行分组排列；装饰元素克制（≤3 处），不干扰文字层级。",
    reference: `<div style="position:absolute;left:0;top:0;width:1080px;height:1440px;background:#FFF3E0;overflow:hidden">
  <div style="position:absolute;left:80px;top:70px;width:120px;height:120px;border-radius:50%;background:#FFC24B"></div>
  <div style="position:absolute;left:820px;top:60px;width:160px;height:90px;background:#2EC4B6;transform:rotate(6deg)"></div>
  <div style="position:absolute;left:70px;top:260px;width:940px;height:180px;font-size:120px;font-weight:700;color:#1A1A1A;font-family:'Archivo Black'">SUMMER FEST</div>
  <div style="position:absolute;left:70px;top:470px;width:940px;height:60px;font-size:36px;color:#3A6EA5;text-align:center">2026 · BEIJING</div>
  <div style="position:absolute;left:90px;top:700px;width:900px;height:420px;background:#1A1A1A;border-radius:24px">
    <div style="position:absolute;left:40px;top:40px;width:220px;height:220px;border-radius:50%;background:#FF6B6B"></div>
    <div style="position:absolute;left:320px;top:50px;width:520px;height:52px;font-size:40px;color:#FFFFFF">8.20 落日飞车</div>
    <div style="position:absolute;left:320px;top:120px;width:520px;height:52px;font-size:40px;color:#FFFFFF">8.21 MONO</div>
    <div style="position:absolute;left:320px;top:200px;width:480px;height:40px;font-size:26px;color:#FFC24B">早鸟票 299 元</div>
  </div>
  <div style="position:absolute;left:70px;top:1200px;width:940px;height:3px;background:#1A1A1A"></div>
  <div style="position:absolute;left:70px;top:1240px;width:940px;height:50px;font-size:28px;color:#1A1A1A;text-align:center">@summerfest2026</div>
</div>`,
  },
  ui: {
    labelKey: "node.layout.skill.ui",
    descKey: "node.layout.skill.uiDesc",
    icon: "layers",
    media: "web",
    layout:
      "【版式结构 — 网页首屏】L01 顶栏：logo + 3-5 个导航项 + 右侧行动按钮；L02 Hero 主视觉：大标题（≥72px）+ 副标题 + 1 个主按钮（+1 个次链接）+ 主视觉图形/产品图；L03 内容区：2-4 列卡片（图标/标题/描述），卡片间距与圆角一致；禁止 Hero→Features→Pricing→FAQ 连排的默认骨架，至少一个非常规区块。",
    reference: `<div style="position:absolute;left:0;top:0;width:1440px;height:900px;background:#F7E8DC;overflow:hidden">
  <div style="position:absolute;left:60px;top:34px;width:220px;height:32px;font-size:24px;font-weight:700;color:#2D2A32">Flowboard</div>
  <div style="position:absolute;left:420px;top:40px;width:520px;height:24px;font-size:18px;color:#8A8490;text-align:center">Product · Pricing · Docs · Blog</div>
  <div style="position:absolute;left:1240px;top:34px;width:140px;height:40px;border-radius:999px;background:#B07AA8;color:#FFFFFF;font-size:18px;text-align:center;line-height:40px">Sign up</div>
  <div style="position:absolute;left:100px;top:220px;width:1240px;height:130px;font-size:96px;font-weight:700;color:#2D2A32">Plan less.<br/>Ship more.</div>
  <div style="position:absolute;left:100px;top:400px;width:560px;height:60px;font-size:24px;color:#8A8490">The workspace where ideas become releases.</div>
  <div style="position:absolute;left:100px;top:500px;width:200px;height:60px;border-radius:14px;background:#2D2A32;color:#FFFFFF;font-size:22px;text-align:center;line-height:60px">Get started</div>
  <div style="position:absolute;left:330px;top:500px;width:140px;height:60px;font-size:22px;color:#2D2A32;line-height:60px">Watch demo →</div>
  <div style="position:absolute;left:780px;top:200px;width:560px;height:560px;border-radius:32px;background:#FFFFFF;box-shadow:0 24px 60px -20px rgba(0,0,0,0.18)"></div>
</div>`,
  },
  mobile: {
    labelKey: "node.layout.skill.mobile",
    descKey: "node.layout.skill.mobileDesc",
    icon: "layers",
    media: "mobile",
    layout:
      "【版式结构 — 手机应用】390×844 竖屏：状态栏、顶部身份/页面信息、一个主任务区、支撑信息区、底部固定导航。左右安全边距 20-24px，区块之间有 24-32px 的节奏；可用开放式列表、日期轨道、图像裁切或可编辑图形，不能机械重复卡片。每屏只强调一个行动，按钮触控区域至少 44px，正文至少 16px。底部导航需有独立项目与选中态，不要把多个文字塞进一个文本层。禁止网页横版导航和桌面多列布局。",
    reference: `<div style="position:absolute;left:0;top:0;width:390px;height:844px;background:#FAFAF8;overflow:hidden">
  <div style="position:absolute;left:24px;top:24px;width:342px;height:20px;font-size:15px;color:#1A1A1A">9:41</div>
  <div style="position:absolute;left:24px;top:84px;width:342px;height:48px;font-size:32px;color:#1A1A1A">Today</div>
  <div style="position:absolute;left:24px;top:160px;width:342px;height:190px;border-radius:16px;background:#E7EFE9"></div>
  <div style="position:absolute;left:44px;top:188px;width:300px;height:40px;font-size:25px;color:#1A1A1A">Your next step</div>
  <div style="position:absolute;left:24px;top:390px;width:342px;height:82px;border-radius:12px;background:#FFFFFF"></div>
  <div style="position:absolute;left:44px;top:412px;width:294px;height:40px;font-size:18px;color:#1A1A1A">Keep your progress going</div>
  <div style="position:absolute;left:0;top:760px;width:390px;height:84px;background:#FFFFFF"></div>
  <div style="position:absolute;left:32px;top:786px;width:326px;height:36px;font-size:16px;color:#1A1A1A;text-align:center">Today    Plan    Learn    Profile</div>
</div>`,
  },
  social: {
    labelKey: "node.layout.skill.social",
    descKey: "node.layout.skill.socialDesc",
    icon: "share",
    media: "social",
    layout:
      "【版式结构 — 社媒卡片】方形 1:1：大标题占上部 40-50% 且一眼可读；中部主体图形/图片或留白；底部 1-2 行行动号召或品牌行；边距 ≥8%，信息密度低；标题字号 ≥72px。",
  },
  banner: {
    labelKey: "node.layout.skill.banner",
    descKey: "node.layout.skill.bannerDesc",
    icon: "image",
    media: "banner",
    layout:
      "【版式结构 — 超宽横幅】信息左右分布：左侧标题（≥64px）+ 副标题/行动号召，右侧主体图形或产品图，中间留过渡留白；或居中标题 + 两侧图形对称；禁止左右两端挤满文字；垂直方向留足上下边距。",
  },
  // Adapted from OpenDesign's card-xiaohongshu skill: a vertical 3:4 card
  // tuned for feed reading — bold type, generous spacing, one idea per card.
  xiaohongshu: {
    labelKey: "node.layout.skill.xiaohongshu",
    descKey: "node.layout.skill.xiaohongshuDesc",
    icon: "image",
    media: "poster",
    layout:
      "【版式结构 — 竖版知识卡片】单张 3:4：顶部大标题（≥88px，一句话核心观点）+ 1 行副标题；中部分条列出要点（每条：序号或圆点 + 短句 + 1 行例子），条目间距宽；底部行动号召 + 小字水印（作者/日期）；大量留白，元素圆润，字号大、行距宽。",
    reference: `<div style="position:absolute;left:0;top:0;width:1080px;height:1440px;background:#FAFAF8;overflow:hidden">
  <div style="position:absolute;left:80px;top:70px;width:200px;height:44px;border-radius:999px;background:#F0EFEA;font-size:22px;color:#1A1A1A;text-align:center;line-height:44px">AI 生产力系列 · 01</div>
  <div style="position:absolute;left:80px;top:180px;width:920px;height:200px;font-size:100px;font-weight:700;color:#1A1A1A">放弃完美<br/>prompt</div>
  <div style="position:absolute;left:80px;top:560px;width:860px;height:140px;font-size:34px;line-height:1.5;color:#8A8A85">你写的 prompt 不可能一次完美，把它当对话，不是 SQL。</div>
  <div style="position:absolute;left:80px;top:860px;width:160px;height:160px;border-radius:50%;background:#D94F3D"></div>
  <div style="position:absolute;left:80px;top:1080px;width:860px;height:2px;background:#E4E3DE"></div>
  <div style="position:absolute;left:80px;top:1120px;width:860px;height:40px;font-size:24px;color:#8A8A85">@AI工具党 · 建议收藏</div>
</div>`,
  },
  // Further artifact types borrowed from OpenDesign's skills/templates.
  dashboard: {
    labelKey: "node.layout.skill.dashboard",
    descKey: "node.layout.skill.dashboardDesc",
    icon: "box3",
    media: "web",
    layout:
      "【版式结构 — 数据看板】L01 顶栏：标题 + 日期/筛选标签；L02 KPI 行：3-4 个大数字卡（label/大数字/趋势）；L03 图表区：1 大 2 小布局或 2×2 卡片（每卡：标题 + 图表/表格 + 注释）；数据必须使用真实用户提供的数据或明确占位（禁止编造指标）；卡片间距一致，禁止彩色左边框卡片。",
  },
  album: {
    labelKey: "node.layout.skill.album",
    descKey: "node.layout.skill.albumDesc",
    icon: "circle",
    media: "social",
    layout:
      "【版式结构 — 专辑封面】方形：主体图形/照片占画面 60-80%，专辑名小字（≤24px）与艺人名收进角部或底部；或极简大字标题 + 单一图形；强图形感、弱文字；禁止把文字堆满画面。",
  },
  magazine: {
    labelKey: "node.layout.skill.magazine",
    descKey: "node.layout.skill.magazineDesc",
    icon: "text",
    media: "poster",
    layout:
      "【版式结构 — 杂志封面】竖版：顶部刊名 banner（衬线大字）+ 期号/日期小字；中部主封面故事标题（72-120px 衬线）+ 1-2 行副题；底部 1-2 条次要内容预告；构图偏置不对称，留白克制；编辑感（错落层次、醒目数字/日期）。",
  },
  deck: {
    labelKey: "node.layout.skill.deck",
    descKey: "node.layout.skill.deckDesc",
    icon: "play",
    media: "web",
    layout:
      "【版式结构 — 演示封面/章节页】横版：居中或偏置的章节大标题（≥88px）+ kicker（章节号/标签）+ 1 句引言；底部元数据行（日期/作者）；单页只传达一个信息；封面可整页反色或大色块底。",
  },
  email: {
    labelKey: "node.layout.skill.email",
    descKey: "node.layout.skill.emailDesc",
    icon: "file",
    media: "banner",
    layout:
      "【版式结构 — 邮件横幅】超宽横版：顶部品牌行（logo + 名称）；中部大标题（≥56px）+ 1 行副标题 + 1 个行动按钮；底部退订/地址小字；配色简单（≤4 色），大按钮（高度 ≥48px）易点击；内容居中有呼吸感。",
  },
};

/** Resolves a skill id, defaulting to the poster skill. */
export function layoutSkill(skillId) {
  return LAYOUT_SKILLS[skillId] ?? LAYOUT_SKILLS.poster;
}

/** The skill that owns a media preset (for nodes saved without a skill). */
export function skillForMedia(mediaId) {
  return (
    Object.entries(LAYOUT_SKILLS).find(
      ([, skill]) => skill.media === mediaId,
    )?.[0] ?? "poster"
  );
}

/** Resolves a style id to its preset, defaulting to minimal. */
export function layoutStyle(styleId) {
  return LAYOUT_STYLES[styleId] ?? LAYOUT_STYLES.minimal;
}

/** Resolves a composition id to its preset, defaulting to centered. */
export function layoutDirection(directionId) {
  return LAYOUT_DIRECTIONS[directionId] ?? LAYOUT_DIRECTIONS.centered;
}
