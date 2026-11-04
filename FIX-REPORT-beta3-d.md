# VOO Design beta.3 修复报告（fix/beta3-d）

- 工作树：`/home/umax/projects/voo-wt/d`
- 分支：`fix/beta3-d`
- 基线：`b56a4e7a`
- 本次只处理：第 6、7、10 项；未改标题栏保存按钮，未加新功能，未 push、未部署、未合并到其他分支。

| 问题 | 状态 | 提交 |
| --- | --- | --- |
| 6. Auto Layout 旋转子元素重叠 | 已修复 | `a5f59a4c` |
| 7. Frame 内子对象 X/Y 显示绝对坐标 | 已修复 | `e166c995` |
| 10. 矩形旋转后变 Vector / 属性丢失 | 已修复 | `3c36f816` |

## 6. Auto Layout 旋转子元素重叠 — 已修复

**根因有两点：**

1. `auto-layout-reflow.js` 用子节点的未旋转 `width/height` 计算占位，并用未旋转的 `x/y` 作为槽位左上角。旋转 90° 后视觉包围盒从 100×50 变成 50×100，布局仍只占 100 宽，且把未旋转盒子放进槽位，导致视觉重叠。
2. 拖拽旋转走 preview 路径，`setDoc` 正常路径中的 Auto Layout reflow 被跳过；松手时只提交历史，不重新排布，所以旋转结束后布局仍是旧盒子。

**修复：**

- 布局测量、换行、主轴/交叉轴分配改为使用子节点的视觉 AABB（旋转/斜切时），未旋转节点保持原有几何语义。
- 放置子节点时按其 AABB 左上角对齐槽位，抵消旋转带来的外扩。
- 变换手势结束时，在写历史前用非 preview 的 `setDoc` 重新结算文档，让 Auto Layout 按最终旋转角度 reflow。

**测试/实测：**

- 新增 `tests/unit/auto_layout_reflow.test.js` 两个用例：旋转子节点的 hug 宽度/高度、旋转后的换行。
- 新增 `tests/unit/editor-module-audit-regressions.test.js` 两个用例：preview 变换提交前先结算 Auto Layout；无 Auto Layout 文档不做多余结算。
- 本地真实浏览器实测：Auto Layout 内旋转子节点 90°，松手后 Frame 从 230×70 reflow 为 180×120，子节点视觉包围盒对齐槽位，无重叠。

## 7. Frame 内相对坐标 — 已修复

**根因：** VOO 文档模型保存绝对坐标，Inspector 直接显示 `anchorDocPoint`，因此拖入 Frame 的子对象仍显示页面绝对 X/Y。

**修复：**

- 直属于 Frame 的子对象，Inspector 的 X/Y 改为相对该 Frame 的本地坐标显示。
- 输入 X/Y 时先转回文档坐标再复用原有锚点/旋转数学；旋转的父 Frame 也能正确处理（本地单轴修改可能同时移动文档 x/y）。
- 锚点选择器、旋转子对象、多选共同值继续工作；当多选对象来自不同父级时不借用某个 Frame 的原点，而是显示 mixed（`—`），避免误导。

**测试/实测：**

- `tests/unit/transform-field-patches.test.js`：本地坐标显示、本地输入回写、旋转 Frame 的双轴换算、输入不变式。
- `tests/unit/transform-default-values.test.jsx`：Frame 子对象渲染相对 X/Y；不同父级多选不误用原点。
- 本地真实浏览器实测：Frame 内子对象显示 X=100 / Y=70，把 X 改为 150 后文档 x 从 200 变为 250，Y 保持 150。

## 10. 矩形旋转后变 Vector — 已修复

**根因：** 旋转 API 本身只写 `rotation`，不会改 `kind`；真正把矩形变成 Vector 的是两条“矩形→路径”的路径：

1. SVG 导入遇到带 `rotate/skew` 的 `<rect>` 时会降级为四角路径，图层名变成 Vector，圆角被丢弃（agent 导入明确写了 “corner radius ignored”）。
2. 双击落在变换手柄附近时，仍会命中形状并触发“转为路径 / 进入矢量编辑”，旋转后调整手柄时容易误触，随后图层变成 Vector。

**修复：**

- SVG 导入（`editor_svg_import.js`、`svg_to_nodes.js`）把带旋转/斜切的 `<rect>` 分解回场景模型的 `rotation + shear + scale` 盒变换，保留 rect kind、图层名和 `cornerRadius`（按变换缩放）。
- Agent 矢量资产落图时应用解析出的 `rotation/shear/flipV`；图标路径也按同一盒变换展开，避免旋转矩形被画正。
- `handleEditorDoubleClick` 在检测到变换手柄时不再触发形状转路径；普通双击形状主体进入矢量编辑的既有行为保留。
- 增加回归测试：旋转 90°/再次旋转仍保持 `kind:"rect"`、名称和圆角；旋转 SVG rect 仍为 rect；skew rect 仍为 rect；手柄双击不转换。

**测试：**

- `tests/unit/rotation-preserves-rect.test.js`：旋转按钮/连续旋转不改变 rect 身份、名称、圆角。
- `tests/unit/svg_to_nodes.test.js`：旋转 rect、skew rect、缩放后圆角仍为 rect。
- `tests/unit/svg_defs_import.test.js`：编辑器 SVG 导入旋转 rect / skew rect 保持 rect。
- `tests/unit/frame_fit_to_content.test.js`：变换手柄上的双击不触发转路径。

## 验证结果

- `npx vitest run --no-cache`（分支 HEAD）：**624 个测试文件通过，5226 个用例通过，4 个跳过，0 失败**。
- 相关定向套件全部通过（Auto Layout、SVG 导入、Transform 面板、build-layout 图标、module import integrity 等）。
- `npm run lint:design`：clean，1479 个文件符合 Design.md。
- `node scripts/editor-checks.mjs --changed --json`：退出码 0；模块 checks 执行覆盖为 partial，未运行的原生/网络/FPS 场景未标记通过。
- 浏览器验收使用本地 Chromium + 临时 fixture（未提交）：Auto Layout 旋转松手后 reflow、Frame 内相对 X/Y 显示与回写均通过。

说明：本机环境存在缺失 `GIT_CONFIG_KEY_0` 的 `GIT_CONFIG_*` 变量；全量测试和 git 命令在该环境变量下会报错，去掉该变量后测试全绿。这是运行环境问题，不是本次代码失败。
