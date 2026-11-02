/** Media descriptors used by synchronous canvas geometry. */
export const LAYOUT_MEDIA = {
  poster: {
    labelKey: "node.layout.media.poster",
    width: 1080,
    height: 1440,
    brief:
      "媒介：海报。竖版构图，一眼能读完主题。标题是绝对主角，信息区（时间/地点/主办方或卖点）成组放在下方或角落，克制地使用装饰元素。",
  },
  web: {
    labelKey: "node.layout.media.web",
    width: 1440,
    height: 900,
    brief:
      "媒介：网页首屏。横版 1440×900，模拟浏览器首屏：顶部导航条、主视觉区（大标题 + 行动按钮）、下方 2-3 列内容卡片。层次要像真实网页。",
  },
  mobile: {
    labelKey: "node.layout.media.mobile",
    width: 390,
    height: 844,
    brief:
      "媒介：手机 App 页面。竖版 390×844，包含状态栏、内容区和底部导航；按钮和文字适合手指操作与小屏阅读。",
  },
  banner: {
    labelKey: "node.layout.media.banner",
    width: 1500,
    height: 500,
    brief:
      "媒介：横幅广告。横版超宽构图，信息左右分布：左边标题 + 行动号召，右边主体图形或产品，中间留过渡。不能拥挤。",
  },
  social: {
    labelKey: "node.layout.media.social",
    width: 1080,
    height: 1080,
    brief:
      "媒介：社媒卡片。方形 1080×1080，第一眼能被标题抓住，信息密度低，适合信息流。留出足够的边距，避免内容贴边。",
  },
};

export function layoutMedia(mediaId) {
  return LAYOUT_MEDIA[mediaId] ?? LAYOUT_MEDIA.poster;
}
