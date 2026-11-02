# VOO Signature Design Systems

日期：2026-10-27 · 状态：v1（首批 3 套，AXIOM 为完整规范）
代码：`src/canvas/design_systems.js`（token 与 brief）、`src/canvas/agent/design_system/from-preset.js`（Agent 合约转换）、`src/canvas/components/welcome_dashboard/generation_intent.js`（首页选择 → 生成）、`src/canvas/components/community_templates_data.js`（起始模板）

## 0. 为什么做这一套

Pen 首页自带的设计系统（shadcn / HeroUI / Halo / Lunaris / Nitro）是它产品的默认模板。VOO 不照抄这些名字与风格，而是建立自己的**签名设计系统**：每套有独立的名字、网格、字号与组件规则，而不是同一套模板换颜色。首批提供三种方向：

| 名称 | 方向 | 一句话 | 起始模板 |
| --- | --- | --- | --- |
| **AXIOM** | 前卫 × 技术编辑 | 纸色、可见细网格、海报级大字、单一信号橙 | `axiom-product-landing`（1440×900） |
| **VOID OS** | 科技 × 操作终端 | 近黑、薄荷信号、等宽数据、密集监控界面 | `void-os-observability`（1440×900） |
| **BLOOM** | 潮流 × 软糖消费 | 奶油、覆盆子粉、超大圆角、贴纸徽章 | `bloom-mobile-launch`（393×852） |

三套都已进入：设置 → 设计系统（可预览/复制/应用到画布）、首页 composer（生成时选择）、社区模板（作为起始文档）。

## 1. AXIOM — 完整设计规范（v1）

> 定位：给技术产品做的前卫编辑式系统。像一本工程杂志，不像 SaaS 控制台。**一个大标题、一张网格、一个信号色。**

### 1.1 设计原则

1. **网格可见**：12 栏、1px 细线；版面用 7/5 或 5/7 非对称切分，不用居中对称。
2. **极端层级**：每屏只有一个 92px 级的锚点（超大标题或数字），其余文字缩小到 12–17px。
3. **单一信号**：整页只允许一个橙色行动点；橙色永远不用于装饰。
4. **线框代替卡片**：内容分组用 1px 线，不用填充卡片、阴影、渐变。
5. **编辑感图像**：全出血、黑白或低饱和摄影，叠 8–12% 墨色；不使用圆角图片或贴纸装饰。
6. **等宽标签**：所有标签、编号、图注、数据用等宽大写字母 + 0.08em 字距。

### 1.2 颜色 Token（语义角色）

| 角色 | 值 | 用途 |
| --- | --- | --- |
| `canvas` / 纸色 | `#F1EEE7` | 页面底色 |
| `surface` / 白 | `#FFFFFF` | 需要反白的区块（少用） |
| `surfaceMuted` / 浅纸 | `#E4DFD1` | 分组底、hover、图表底 |
| `text` / 墨 | `#101010` | 标题与正文 |
| `textMuted` / 次级 | `#5F5B52` | 说明、元信息、图注 |
| `action` / 信号橙 | `#FF3D00` | 唯一行动点、关键数据点、当前导航 |
| `actionHover` | `#D93200` | 按下/hover |
| `actionText` / 白 | `#FFFFFF` | 橙底上的文字 |
| `divider` / 细线 | `#CFC8B8` | 1px 网格与分隔 |

规则：**不允许**出现第四种彩色；状态色（成功/警告/错误）用墨色文字 + 文案表达，不新增颜色。

### 1.3 字体与字号

| 角色 | 字体 | 桌面 | 移动 |
| --- | --- | --- | --- |
| Display | Space Grotesk 600 | 92 / 行高 0.92 / 字距 -2 | 48 |
| Title | Space Grotesk 600 | 44 / 1.12 / -1 | 30 |
| Body | Inter 400 | 17 / 1.6 | 16 |
| Caption | Inter 500 | 12 / 1.5 | 12 |
| Label / 数字 | IBM Plex Mono 500 | 11–12，大写，0.08em | 11–12 |

配对不超过两套主字体 + 一套等宽；标题允许两行，第三行必须重新组织内容。

### 1.4 间距与圆角

- 间距基于 4px：4 / 8 / 12 / 16 / 24 / 32；区块间距 64–96，页面边距桌面 120，移动 24。
- 圆角：控件 **2px**、卡片 **4px**、面板 **8px**、胶囊 **999px**（只用于标签）。
- 阴影：**无**。层级只靠线、留白和字重。

### 1.5 栅格与布局

- 桌面 1440：12 栏，栏宽 100，栏距 0（细线落在栏边界上），左右边距 120。
- 常见分栏：Hero 7/5；特性区 3×4 栏；数据区 5/7。
- 移动 393：4 栏，边距 24；标题与正文左对齐。
- 导航高 64，底部一条 1px 线；不吸顶阴影，滚动时只保留线。

### 1.6 组件规则

| 组件 | 规范 |
| --- | --- |
| 主按钮 | 高 44，圆角 2，信号橙底白字，等宽 11–12px 大写；同一屏只有一个 |
| 次级按钮 | 透明底 + 1px 墨线，高 44，文字墨色 |
| 导航 | 高 64，左侧字标，右侧等宽链接；当前项用橙色下划线 2px |
| 卡片 | 只用 1px 线框，内边距 24；不要填充、不要阴影 |
| 输入框 | 高 44，1px 底线（不是四边框），聚焦时底线变橙 |
| 标签/Chip | 全圆角胶囊，1px 线，12px 等宽大写 |
| 数据 | 大数字用 Display；单位/时间戳用等宽 11px muted；右对齐 |
| 图像 | 全出血，直角；黑白/低饱和 + 8–12% 墨色叠层 |

### 1.7 动效与状态

- 动效克制：150–200ms，ease-out；只做透明度与位移，不做弹跳/缩放。
- hover：线变墨色或橙色；按下：位移 1px；disabled：文字降到 40% 墨色，不加新色。
- 加载：1px 进度线或等宽计数器，不用 spinner 贴纸。

### 1.8 内容语气

- 标题短、动词开头（“SYSTEMS FOR THE NEXT DECADE.”）。
- 正文一句话说清价值，不写营销形容词堆叠。
- 数据必须有单位、时间范围与来源。

### 1.9 Do / Don't

| Do | Don't |
| --- | --- |
| 用可见网格与大量留白 | 居中对称的模板式 Hero |
| 每屏一个 92px 锚点 | 满屏 32px 同权重标题 |
| 一个橙色行动点 | 彩色渐变、发光、玻璃拟态 |
| 1px 线框与反白分区 | 圆角卡片墙、阴影堆叠 |
| 等宽标签与编号 | 三套以上字体、装饰性图标堆 |
| 全出血黑白摄影 | 圆角图、贴纸、emoji 装饰 |

## 2. VOID OS（科技/终端方向，v1 摘要）

- 颜色：near-black `#050607` / panel `#0B0E10` / soft `#101617` / ink `#E8F5EF` / muted `#74827C` / signal mint `#7CF7C4` / cyan `#64D8FF` / line `#1D2A26`。
- 字体：Sora（标题）/ Inter（正文）/ JetBrains Mono（全部数字、ID、日志、状态）。
- 字号：桌面 80 / 38 / 15 / 12；移动 44 / 27 / 14 / 12。
- 圆角：控件 6 / 卡片 10 / 面板 16 / 胶囊 999；阴影无，靠 1px 线与状态点。
- 规则：8px 基准密度；40px 表格行；8px 状态点 + 10px 大写标签；图表纯色、网格线 `#1D2A26`；允许 1px 水平 scanline 节奏，不允许噪声贴图和发光文字。

## 3. BLOOM（潮流/软糖方向，v1 摘要）

- 颜色：cream `#FFF6EA` / white `#FFFFFF` / peach `#FFE6D2` / ink `#221407` / muted `#7A5B44` / raspberry `#FF4D8D` / hover `#E33B78` / line `#F0D8C4`。
- 字体：Fraunces（发丝衬线标题，可斜体）/ Manrope（正文与标签）。
- 字号：桌面 84 / 40 / 17 / 13；移动 46 / 28 / 16 / 13。
- 圆角：控件 14 / 卡片 24 / 面板 32 / 胶囊 999；可允许 2–3° 旋转的贴纸。
- 规则：奶油底 + 覆盆子主行动；24px 圆角卡片、无硬边框、柔和 1px 内描边；每屏最多两类装饰（贴纸/星形）；暖调生活摄影裁圆角或拱形；禁止冷灰与蓝紫企业渐变。

## 4. 生成链路如何用到这些系统

1. **首页 composer** 的“设计系统”选择器 → `GenerationIntent.designSystemId` + `designSystemContract`（v1 合约，含 `designMd` brief）。
2. `runAgentTurn` 收到合约后：
   - 工具循环：`designSystem` 直接作为 active 合约注入 system prompt（优先于 style kit 与文档里已有的系统），首写后落盘到 `doc.designSystem`。
   - HTML 管线：`runHtmlPipeline({ designSystem })` 在选方向后用它覆盖 direction 的 designSystem，CSS 变量与提示都走同一份合约。
3. 用户 prompt 里同时拼入该系统的 brief（AXIOM 的六条规则即来自 `brief.zh/en`），保证模型即便走 HTML 管线也遵守网格/字体/用色。
4. 未选择时保持 `auto`：沿用原有 `resolveDesignSystem` 关键词路由（studio/wellness/commerce/editorial/analytics + 三个签名系统的关键词）。

## 5. 模板

| id | 名称 | 尺寸 | 说明 |
| --- | --- | --- | --- |
| `axiom-product-landing` | AXIOM — Avant-garde Product Landing | 1440×900 | 可见 12 栏细网格、海报标题、单一信号橙、三列特性线框 |
| `void-os-observability` | VOID OS — Observability Console | 1440×900 | 侧栏 + KPI + 柱状 + 事件表，全部等宽数据 |
| `bloom-mobile-launch` | BLOOM — Soft-pop Mobile Launch | 393×852 | 覆盆子 Hero、贴纸 chip、圆角商品卡、胶囊底栏 |

均在 欢迎页 → 社区模板 → 设计系统 分类下，使用后写入 `.voo` 文档。

## 6. 已知边界

- 本批只覆盖视觉/组件规范；未包含图标库、插画库与多语言排版细则。
- 三套系统目前共用 `SPACING` 数值（4–32），AXIOM 的 64–96 区块间距写在 brief 中而非 token。
- 设计系统 UI 的预览卡仍是 token 摘要，不是完整组件画板（后续可加组件预览图）。
