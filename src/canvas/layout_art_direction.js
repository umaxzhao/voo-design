/** Composition guidance for generated artifacts, separate from color tokens. */
const ART_DIRECTIONS = Object.freeze({
  wellness: {
    mobile: {
      name: "Kinetic editorial",
      concept:
        "把训练计划设计成一本运动杂志的当天内页：运动感来自鲜明的明暗分区、巨大字形与被裁切的动作轨迹，而非圆角卡片。",
      composition:
        "顶部用 14px 的日期与品牌形成细小编辑行；下一组用 48-60px 的短标题形成第一视觉重心。中部采用一块深墨色或品牌绿色的满宽主视觉区域，占屏幕高度约 30-38%，可有明显裁切的巨大训练数字或字形、一条运动轨迹和唯一主行动；这块区域应像版面而非圆角卡。下半屏回到纸色，用开放式周计划日期轨道和一条训练建议组织信息，不能再出现第二张主卡。底部导航独立。",
      signature:
        "把跑道弧线、计时刻度或动作轨迹中的一种做成可编辑几何层；主视觉区域中明显出现一次，小数据区最多呼应一次。让图形穿过或贴近巨大的数字，形成运动张力。",
      avoid:
        "不要浅绿色圆角大卡套进度圆环的健康应用模板；不要把欢迎语、今日训练、进度和推荐做成同尺寸卡片；不要用四个文字标签冒充完整的底部导航。",
    },
    mobilePlan: {
      name: "Training map",
      concept: "把训练计划画成一张可行动的路线图，突出下一步与一周节奏。",
      composition:
        "顶部保留与首页一致的品牌、日期和大字标题。中部以一条清晰的纵向轨迹连接本周训练日；当天任务使用深墨色或品牌绿色的完整区块，休息日和后续任务以开放式行呈现，不做重复卡片。底部导航独立，并选中计划。",
      signature:
        "延续首页的跑道线或计时刻度，让路线穿过训练节点；一处放大、一处缩小。",
      avoid: "不要把七天做成七张相同卡片，也不要在没有用户数据时写完成率。",
    },
    mobileProgress: {
      name: "Progress chronicle",
      concept: "把进步呈现为可读的训练日志，而非拼装的统计仪表盘。",
      composition:
        "顶部沿用品牌和大字标题。一个巨大的周期目标成为视觉焦点；尚无训练记录时，下方显示清楚的空状态和四周计划里程碑，不画看起来像已完成数据的折线。指标以开放式两列文字排列，底部导航独立并选中进度。",
      signature:
        "将首页的运动轨迹转译为四个等间距的计划节点，使用相同的线宽和品牌绿色；节点必须明确标注为计划。",
      avoid:
        "不要四张等宽 KPI 卡、环形图堆叠，也不要编造已完成训练数据或暗示已完成的趋势线。",
    },
    web: {
      name: "Performance journal",
      concept: "把健身产品做成有节奏的训练日志，而不是通用 SaaS 落地页。",
      composition:
        "导航只占一行；大标题与训练照片或可编辑动作图形形成明显不对称。一个主训练区比其他模块大至少两倍，辅助指标沿一条水平基线排开。",
      signature:
        "用计时、步频或路径形成一处可编辑运动图形，并与标题的字重形成对比。",
      avoid: "不要三张等宽功能卡，也不要 Hero 后立即接模板式功能列表。",
    },
  },
  commerce: {
    mobile: {
      name: "Curated catalog",
      concept: "像有编辑品味的选物店，以产品本身主导画面。",
      composition:
        "一个有完整留白的主推商品占上半屏；价格、材质和购买操作组成紧凑信息组；次要商品做水平预览而非重复网格卡片。",
      signature: "用明确的商品编号、裁切方式和排版基线建立品牌感。",
      avoid: "不要重复三张相同商品卡，不要让折扣标签压过商品。",
    },
  },
  editorial: {
    mobile: {
      name: "Pocket journal",
      concept: "手机里的独立杂志，靠字形、留白和图像建立气质。",
      composition:
        "刊名和期号是小尺寸元信息，主文章标题与封面图形成一处大比例对比；目录以开放式列表与细分隔呈现。",
      signature: "用一个超大章节数字或竖向侧标统一视觉语言。",
      avoid: "不要把每篇文章做成同一张圆角白卡。",
    },
  },
  analytics: {
    mobile: {
      name: "Signal first",
      concept: "将最重要的变化作为视觉中心，数据密度服务于阅读顺序。",
      composition:
        "先展示一个主指标和清晰时间范围，再用一块宽图表解释变化；其余指标压缩为两列无边框数据行。",
      signature: "使用一致的数值字体和一条重点趋势线，图表标签直接贴近数据。",
      avoid: "不要均匀铺满 KPI 卡片，不要编造无法解释的数值。",
    },
  },
  studio: {
    poster: {
      name: "Typographic statement",
      concept: "像一张有编辑判断的正式海报，让主题在远处仍能被认出。",
      composition:
        "主标题与主体图形争取画面主要面积，次要信息收在一条清晰的边线或角部；用尺度差而非装饰数量制造张力。",
      signature: "提炼主题中的一个形状或符号，用一次大比例出现。",
      avoid: "不要把信息均匀分散，也不要使用无关的几何碎片填满空白。",
    },
    banner: {
      name: "Single message",
      concept: "横幅在短暂浏览中只传达一个明确动作。",
      composition:
        "一侧放完整标题与行动，另一侧留给主体图像或图形；两者之间保留清晰过渡空间。",
      signature: "从产品或活动提取一处大比例图形线索。",
      avoid: "不要把正文、按钮和装饰平均铺满整条横幅。",
    },
    social: {
      name: "Feed cover",
      concept: "信息流里一眼能读到主题的封面。",
      composition: "一个短标题先被看见，主体图形承担情绪，辅助信息沿底部收口。",
      signature: "让标题中的关键词与一个可编辑图形发生视觉关系。",
      avoid: "不要堆放多个同样响亮的标题。",
    },
    mobile: {
      name: "Product editorial",
      concept: "有明确品牌观点的产品界面，一屏只突出一个核心任务。",
      composition:
        "标题和核心操作构成第一视觉组；一个占比显著的主内容区承担页面任务；次要信息用开放式列表、横向轨道或分隔线组织。",
      signature: "从产品主题提取一个可编辑的几何符号，而不是添加通用装饰。",
      avoid: "不要欢迎语加三张等高卡片的通用应用首页。",
    },
    web: {
      name: "Editorial product",
      concept: "将产品价值转译成一眼可识别的视觉观点。",
      composition:
        "首屏保留一个超大主张和一个强主视觉，导航与辅助信息在同一基线上；用非对称留白拉开层级。",
      signature: "把产品核心动作转成一处可编辑的图形或真实界面局部。",
      avoid: "不要默认的居中标题、渐变按钮和三栏功能卡组合。",
    },
  },
});

const STYLE_MOODS = Object.freeze({
  minimal: "以留白和明确的尺寸对比建立秩序，去掉无功能装饰。",
  editorial: "使用杂志式短标题、期号或日期微排版、偏置对齐与鲜明的大小字对比。",
  bold: "使用可被边界裁切的超大字形和整块明暗对比，保持辅助信息极少。",
  memphis: "通过少量模块错位和几何节奏表达活力，避免把每处都做成贴纸。",
  cyberpunk: "以精密刻度、紧凑数据和局部等宽字体表达技术感，避免霓虹堆叠。",
  chinese: "借用留白、题签与纵向节奏建立东方编辑感，避免装饰符号滥用。",
  gradient: "用微妙的明度过渡衬托主体，页面结构仍以真实内容为中心。",
  flat: "用清晰色块和简化的可编辑图形表达主题，保持字级和间距严格统一。",
});

/** Resolve a repeatable composition archetype for one artifact page. */
export function resolveArtDirection({
  media,
  designSystem,
  content = "",
} = {}) {
  const systemId = designSystem?.id ?? designSystem ?? "studio";
  const wellnessScreen =
    systemId === "wellness" && media === "mobile"
      ? /(?:进度页面|成果页面|progress screen)/i.test(content)
        ? "mobileProgress"
        : /(?:计划页面|课表页面|plan screen)/i.test(content)
          ? "mobilePlan"
          : /(?:home|首页|今天|今日训练)/i.test(content)
            ? media
            : /(?:progress|进度|成果|统计|记录)/i.test(content)
              ? "mobileProgress"
              : /(?:plan|计划|课表|日程)/i.test(content)
                ? "mobilePlan"
                : media
      : media;
  return (
    ART_DIRECTIONS[systemId]?.[wellnessScreen] ??
    ART_DIRECTIONS.studio[media] ??
    ART_DIRECTIONS.studio.web
  );
}

/** Build a Design.md-like visual brief without overriding system tokens. */
export function buildArtDirectionBrief({
  media,
  designSystem,
  style,
  content = "",
} = {}) {
  const systemId = designSystem?.id ?? designSystem ?? "studio";
  const preset = resolveArtDirection({ media, designSystem, content });
  const styleNote = `风格表达：${STYLE_MOODS[style] ?? STYLE_MOODS.minimal}色值和字体家族仍以 Design System 为准。`;
  return [
    `【艺术指导：${preset.name}】${preset.concept}`,
    `构图：${preset.composition}`,
    `视觉母题：${preset.signature}`,
    `避免：${preset.avoid}`,
    systemId === "wellness" && media === "mobile"
      ? "跨页一致性：同一健身 App 的固定底部导航始终四项，顺序与标签严格统一为「今日 / 计划 / 进度 / 我的」；每项有独立的可编辑图标层和文字层，只高亮当前页面。"
      : "",
    styleNote,
    "页面必须具有可识别的视觉重心、至少两种明显不同的信息密度，以及一个从内容本身生长出来的图形细节。先设计整体构图，再落地组件。所有主要元素都要作为独立或分组的可编辑层。",
  ].join("\n");
}
