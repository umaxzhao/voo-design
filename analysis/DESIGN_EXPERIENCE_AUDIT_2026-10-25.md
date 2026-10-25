# VOO Design 设计体验巡检（对标 Pen.app）· 2026-10-25 / 10-26

目标：不再由人逐条点检——用自动化巡检 + REA 回收的 Pen/Figma 证据，一次跑完所有工具与选择状态，产出一份可执行的问题清单，并把清单修到清零。

- 巡检脚本：[`scripts/audit/design-experience-audit.mjs`](../../scripts/audit/design-experience-audit.mjs)（44 个状态，可重复运行）
- 最终原始数据：[`out.json`](audit-2026-10-25/out.json)
- 截图：[矩形面板](audit-2026-10-25/final-rect.png)、[Fill 不透明度](audit-2026-10-25/final-fill.png)、[Gradient](audit-2026-10-25/final-gradient.png)、[形状描边/不透明度](audit-2026-10-25/final-shape.png)、[Dodge Flow](audit-2026-10-25/final-dodge.png)、[Sponge Flow+Opacity](audit-2026-10-25/final-sponge.png)
- 对标证据：[`pen/RIGHT_PANEL.md`](pen/RIGHT_PANEL.md)、[`figma/RIGHT_PANEL.md`](figma/RIGHT_PANEL.md)、[`RIGHT_PANEL_ALIGNMENT.md`](RIGHT_PANEL_ALIGNMENT.md)

## 1. 巡检方法

1. `npm run build` + `vite preview`（1440×900）。
2. Playwright 新建文档 → 画矩形/文字/画笔层/画框 → 逐一切换 7 个工具族共 34 个子工具、4 个直选工具，并用 6 种选择状态（空白、矩形、文字、画笔层、画框、多选）采集：
   - 面板可见文本、控件清单、区块标题顺序
   - 裁剪文本（`scrollWidth > clientWidth`）、缺失翻译、无名称按钮、<24×24 点击目标
   - 文本/背景对比度（WCAG 近似）、页面与 console 错误
3. 每条结论对应 `out.json` 中的状态名，可直接复查。

## 2. 结果

| 检查 | 初始 | 最终（44 状态） |
|---|---|---|
| 页面 / console 错误 | 0 | **0** |
| 缺失翻译 key | 0 | **0** |
| 文本被裁剪 | 0 | **0** |
| 无名称按钮 | 3 | **0** |
| 低对比文本 | 23 状态 | **15 状态**，全部为未选中/禁用态（WCAG 豁免）与 4.43 的 9px 设计字号 token |

> 低对比残余：`Fixed width`、`V`、`Smart` 等未选中态（3.19，豁免）；9–10px 的 `Frame/Rectangle/Font family/Size` 等设计字号标题（4.43，差 0.07 达标，属 Design.md 的 `text-neutral-400` 字号 token）。

## 3. 已修复

### 第一批（`40e0b05`、`0037cd2`、`ebfb8ed`）

- 画框面板没有 FILL/STROKE（frame 被 `supportsColour` 排除）
- 工具 header 只显示家族名 → 显示子模式（Smudge / Clone / Curvature Pen / Star …）
- 画框 Clip 改开关；Layout grid / Auto layout / Fill / Stroke 由段内 `+` 添加，去掉虚线空占位
- 图片工具 3 个无名称按钮补 `aria-label`
- 微标签/数值前缀对比度提升（4.43→≈6、3.19→≈4.9）

### 第二批（`c908151`）· 面板结构

- Effects、Constraints、Export **常驻**（不再藏在 “+ ADD”），Effects 空栈也保留标题 + 按钮
- 新增 **Appearance** 段（opacity/blend 从 Transform 移出）
- 新增 **Export** 段：预设行（格式 · 倍率 · 后缀）+ Export 动作（PNG/JPEG/WebP，实测可下载 `export@1x.png`）
- 多选新增 **Selection colors**（去重色板 + 使用该色的图层数，点击选中）
- 文字层 **Typography 前置**到 Fill 之前
- header 显示图层类型图标 + 可双击重命名名称 + “N selected”
- Fill/Stroke 显示 **变量/样式绑定 chip**（detach）

### 第三批（`8028b07`）· 控件深度 / 防御性修复

- **Fill / Gradient 不透明度真生效**：引擎新增工具级 opacity，渐变 stops 与像素填充 alpha、矢量 fillOpacity 均按它计算
- **形状工具独立填充/描边**：色轮=填充；新增描边色 + 描边宽度 + 不透明度，并在创建节点时落盘（线/箭头为纯描边路径，不显示无效控件）
- **画笔子模式**：Dodge/Burn 增加 Flow、Sponge 增加 Opacity（引擎按独立字段参与计算）；所有画笔模式共享笔尖预设
- **Puppet Warp**：钉点列表（选中 / 固定标记 / 删除）
- **帧不再提供 Ungroup**（Figma/Pen 语义）
- 取色器双色块、`+ .ABR`、段标题等命中区扩大到 ≥24px
- **画布偏移防御**：Skia host 始终同步 canvas 的 CSS 尺寸；窗口 resize / DPR 变化强制重绘（实测 1436×856 → 1096×716 时 canvas、stage、style 三者一致）

## 4. 不适用 / 引擎限制（非缺陷）

| 巡检项 | 结论 |
|---|---|
| Free Transform 独立工具 | 与 Pen/Figma 一致：变换由 Select 工具的手柄承担；⌘T 是像素选区变换。不新增冗余工具入口 |
| Healing Spot 的 Source / Sample all layers | 引擎目前没有克隆源/分层采样参数（Clone 模式已有 alt 取样），面板不提供无效控件 |
| 9px 段标题 4.43 对比度 | Design.md 规定的字号 token，差 0.07；不为了 0.07 破坏整体灰阶 |

## 5. 验证

- `npx vitest run`：**3253 passed / 12 skipped / 0 failed**
- `npm run lint:design`：clean（1076 files）
- `npm run build`：通过；44 状态巡检 0 error / 0 裁剪 / 0 漏翻 / 0 无名称
- 手工/脚本验证：header 重命名写回 doc；Export 触发下载；canvas 与 stage 尺寸一致；多选 Selection colors；绑定 chip；Puppet 钉点列表；Dodge Flow / Sponge Flow+Opacity；Fill/Gradient/Shape 面板截图见 §1

## 6. 复现

```bash
npm run build
npx vite preview --port 4173 --strictPort &
node scripts/audit/design-experience-audit.mjs
# 输出 /tmp/voo-design-audit/out.json + 每个状态的整页/面板截图
```
