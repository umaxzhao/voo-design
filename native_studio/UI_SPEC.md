# VOO Design Native — UI 间距 / 边距 / Icon 对齐规范

数据来源：
- 浏览器实测（1440×900，`/tmp/voo_pw/spec2.mjs` → `/tmp/voo_spec2.json`）
- Web 源码 Tailwind 类（`src/canvas/components/`）
- Web 截图：`.agents/teamwork/lead_refs/web_editor_rect2.png`、`web_dashboard_full.png`、`web_onboarding*`、`web_settings.png`

单位均为 px。所有目标值以 Web 渲染结果为准，允许 ±1px。

---

## 0. 全局

| 项 | Web | 说明 |
|---|---|---|
| 字体 | mono 11/12/13，正文 12 | 卡片类统一 mono（SF Mono / monospace），按钮 12 medium |
| 卡片圆角 | 24（大卡）、16（中卡）、12（pill/按钮）、8（小按钮） | |
| 边框 | 1px white/8 ~ white/10 | |
| 卡片底色 | 黑 95%（`bg-black/95`）、raised `#171717/#1a1a1a` | |
| Icon | 13 / 14 / 16 / 20（按位置），stroke 1.5（细）/2（常规） | 不使用彩色 emoji |

## 1. 标题栏（AppTitleBar）

| 元素 | Web | 原生目标 |
|---|---|---|
| 标题栏 | h40，左右 padding 16 | 已 40；内容左右 16 |
| 品牌按钮 | h28、padding 0 6、gap6、圆角8、icon 20、文字 12/500 | icon 20（原 18）、高 28、gap6 |
| 文档 Tab 药丸 | h28、圆角 full、padding-left 12 / right 6、gap6、文字 12/500 tracking .3 | h28；close 16、plus 24 |
| 关闭按钮 | 16×16 | 16（原 18） |
| 新建 + | 24×24 圆 | 24 |
| 右侧 保存 | h28、padding 6 12、圆角12、文字 12/500 白底 | h28（原 24）、宽自适应 |
| 打开 | h28、padding 6 12、圆角12、文字 12/500 | h28 |
| 设置 ⚡ | 20×20 | 20 |

## 2. 欢迎工作台（WelcomeDashboardView）

| 元素 | Web | 原生目标 |
|---|---|---|
| 侧栏 | x2 y42 w240 h856、padding 12 8、radius 24（左） | w240、水平 padding 8、垂直 12、右侧无圆角 |
| 搜索框 | x10（相对 8） w224 h32、radius12、padding-left 32 / right 28 | h32、左右 8/28 |
| 导航行 | w224 h28、padding 6 10、gap10、radius12；行间距 2 | 行距 2 |
| 导航 icon | 14×14 | 14 |
| 分区标题 | 11px、letter-spacing 宽、muted | 11 |
| 工作区栏 | 高 ~48，按钮 h28 | 保持 y56 对齐 |
| Open 按钮 | h28、padding 6 12、radius12、icon13 | 28/12 |
| + New | h28、padding 6 14、radius12、icon14、12/600 | 28 |
| 分类 Pill | h28、padding 6 12、gap6、radius12、间距 8 | 高 28、间距 8 |
| Prompt 卡 | x296 y190 w1088 h124、padding16、radius24、上边距 32 | 16 / 24 / margin-top 32 |
| Prompt 内 icon | 14 / 16 | 14/16 |
| 导入卡 | h48、padding16、gap10、radius16、卡间距12、icon16 | 高 48、间距 12 |
| Recents 标题行 | 与 sort 按钮同基线，行高 28 | |
| 排序按钮 | h28、padding 6 10、radius12 | 28 |
| 视图切换 | 21×21、padding4、radius8 | 21 |
| 工程卡 | 220×190、radius16、缩略图上下内边距 8 | 保持 |

## 3. 编辑器外壳 & 工具轨

| 元素 | Web | 原生目标 |
|---|---|---|
| editor shell | x0 y40 w1440 h860、radius16 | 去掉 2px 内缩；radius 16（原 14） |
| 工具轨药丸 | y56（shell+16）、h48、padding 6 12 6 6、gap4、radius full | 高 48（原 52）、顶部 16（原 14） |
| 工具按钮 | 36×36、padding10、icon16、active 白圆 | 36（原 34）、active 圆 36、icon16 |
| 工具轨总宽 | ~592（14 个按钮；原生 12 个按钮约 510） | 12 个按钮 → 约 512 |
| 工具 icon | 16 / 7（小徽标） | 16 |
| 分隔线 | 1×20 white/12 | 保持，gap6 |

## 4. 图层面板（LayersPanelView）

| 元素 | Web | 原生目标 |
|---|---|---|
| 卡片 | left16、w256、p12、radius24、bg black/95 | 宽 256（原 260）、padding 12、radius 24 |
| 标题行 | px8、pt4、pb6、mb8；标题 11 uppercase tracking wide muted | 同 |
| 搜索/排序 icon | 13、按钮 p4 radius8、gap4 | 13 |
| 透明度/混合行 | 两列 gap6、mb8；每 pill h28、px10、radius12、icon12、文字10 | h28、gap6 |
| 行列表 | 行间距 4 | space 4 |
| 图层行 | 高约 32（py6）、左右 padding 右8 左8+depth14、gap8、radius12 | py6、gap8、radius12 |
| 可见性 | 16 复选/眼睛 icon14、按钮 p2 | 16 |
| 类型 icon | 28×28 容器，icon14 | 28/14 |
| 行文字 | 11；选中 mint 文字 + mint/10 底 | 11、选中 mint |
| 底部工具条 | 上边框 white/10、pt10、mt8、px4；按钮 24×24、radius8、icon14、gap4 | 24/14 |
| 删除按钮 | 右对齐 24×24、hover rose | 同 |

## 5. 属性面板（Inspector / PropertiesPanelView）

| 元素 | Web | 原生目标 |
|---|---|---|
| 卡片 | right16、w256、p12、radius24、bg black/95、max-h75vh | w256（原252）、p12、radius24、高 368 |
| 头部 | px8、pt4、pb10、border-b white/10、mb8；标题 11 uppercase tracking wide | 同 |
| 头部 icon | 13、按钮 p4 radius full、gap4 | 13 |
| 分区标题 | 10–11 uppercase muted | 10 |
| 色轮 | 140×140 | 140 |
| 色块 | 30×30 radius8 | 30 |
| Hex pill | h24、px8、radius8、文字10 mono | h24 |
| Shape/Transform pill | h26–28、radius8、px8、文字10 | 26 |
| 分区之间 | 约 12–16 间距，分隔线 white/8 | 同 |

## 6. 底部 Chrome（EditorChrome）

| 元素 | Web | 原生目标 |
|---|---|---|
| 页码胶囊 | x16、h36、padding 横向 ~10、radius full、文字 11 mono、间距8 | h36（原32）、宽自适应 |
| 缩放条 | w232 h32、padding 2 4、gap2、radius12、icon13、按钮 28×28 | h32、radius12、icon13 |
| Island Bar | h32、radius16、padding 4 8、gap4、icon13、prompt pill h24、chip h24 px10 | 高 32（原36）、radius16 |
| AI FAB | 44×44、右下 16 | 44 |
| Agent 面板 | 列宽 376，卡片 x1064 w364（右侧留 12）；shell 与面板无间隙 | 面板 width364、trailing12、与 shell 间距 0 |

## 7. Agent 面板（AgentPanelView）

| 元素 | Web | 原生目标 |
|---|---|---|
| 卡片 | w364、padding 12 12 12 0（卡内左右 16） | 364 宽、内容左右 16 |
| Header | 高 ~50、padding 横向 16、avatar 28、状态 pill h20、icon16 | 16 padding、icon16 |
| 建议 chips | 332×38、padding 10 14、radius12、间距8、文字12 | 332/38/间距8 |
| Hint 文案 | 11–12 mono muted | 12 |
| Composer | 外距 12、w340、h≈130、padding12、radius16、send 32 | 12/340/130 |

## 8. 引导（OnboardingGuideView）

| 元素 | Web | 原生目标 |
|---|---|---|
| 遮罩 | p16、black/70 | 0.7 黑 |
| 弹窗 | 960×656、radius24、bg #161616 | 960×656、radius24 |
| 封面 | w=1/3（320）、bg #1c1c1c；logo 距底24右32、h28 + 文字15/600 | 320（原315） |
| 头部 | px24 pt20 pb16 gap12；进度段 4×（16×4）gap6、圆角 full；计数 10 tabular | 16×4 gap6 |
| 关闭按钮 | 32×32 radius8 bg white/4 | 32 |
| 内容 | px24 pb24 pt8 | 24 |
| 卡片 | radius12–16、padding14–16、卡间距10 | 12/14 |
| Footer | bg #121212、px24 py16；跳过 px12 py8；次按钮 px16 py8；主按钮 px20 py8、bg #a7ffd4 | 同 |
| 主按钮文字 | 12/500 黑 | 12 |

## 9. 设置（SettingsDrawerView）

| 元素 | Web | 原生目标 |
|---|---|---|
| 遮罩 | p12–24、black/70 + blur | 0.7 |
| 弹窗 | max-w1040、h min(760,90vh)、radius24、border white/10、bg neutral-950 | 1040×760、radius24 |
| Header | px20 py12、border-b；标题 12 uppercase tracking .14em；关闭 48×48 radius8 bg white/4 | 关闭 48 |
| 侧栏 | w208、p12、gap8、bg neutral-900 | 208 |
| Tab | min-h48、px12 py12、radius12、gap8、icon15、文字11 | 48/15 |
| 内容 | p24、纵向 gap20；h2 12 | 24/20 |

---

## 验收方式

1. 每个文件改完后运行全量 `./tests/run_tests.sh`（308 条必须全绿；如断言了旧常量的测试，同步更新断言而不是放宽）。
2. Lead 用 `VOO_SKIP_ONBOARDING=1` + 各 snapshot hook 截取 1440×900 图，与 Web 截图逐区对比（允许 ±1px / 字体渲染差异）。
3. 图标统一使用现成 `VooIconFactory` / 自绘路径，尺寸严格按上表；不要新增彩色图标。
