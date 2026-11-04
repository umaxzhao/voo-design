# VOO Design beta.3 Linux 冒烟问题修复报告（fix/beta3-e）

- **工作树**：`/home/umax/projects/voo-wt/e`
- **分支**：`fix/beta3-e`
- **基线**：`b56a4e7a`（开始前工作区干净，无上一任务遗留提交或未提交改动）
- **最终提交**：`f8823705`（文档/模块登记），功能提交见下
- **范围**：仅第 11、12、15 项；其他并行问题未触碰
- **发布状态**：按用户要求全部为本地提交，**未 push、未部署、未合并到其他分支**

## 第 11 项 渐变预设偏红 —— 已修复

**提交**：`ef1f35b1 fix(gradient): keep preset stop colours exact and geometry finite`

**根因**：
1. `hexToHsv` 把 H/S/V 四舍五入成整数，预设色在后续 HSV→HEX 转换时会漂移；例如 `#EF4444` 变成 `#F04343`、`#10B981` 变成 `#11BA82`，红色系会明显偏红，与所选预设不一致。
2. `hsvToHex` 未归一化 360° 色相，整圈拖拽会落进红色分支。
3. 从纯色切换到渐变时几何为空，`formatGradient` 会写出 `NaN%` 中心/半径，使渐变字符串不合法且不易发现。
4. 活动色标索引缺少夹紧；外部替换色标列表后，点击预设可能落不到当前高亮色标。

**修复**：
- `color_math.js`：保留精确 HSV；`hsvToHex` 归一化色相并夹紧 S/V。
- `use_fill_picker.js`：新增 `applyGradientStopColor`，把预设 HEX 直接写入被夹紧的活动色标；活动索引统一夹紧；纯色转渐变使用完整默认几何。
- `gradient_fill.js`：所有几何字段做有限值兜底，端点/中心/半径不再产生 `NaN`。
- `SwatchGrid.jsx`：导出 `DEFAULT_SWATCHES` 供回归测试复用真实色板。

**测试**：
- 新增 `tests/unit/color_presets_gradient.test.js`：18 个色板预设逐个断言 HSV 往返精确、预设写入目标色标不变、linear/radial/angular 渐变 format/parse 后色标仍精确且无 `NaN`。
- 真实 Electron UI 复测：逐个点击 18 个预设，节点 fill 中的 stop 均与预设 HEX 完全一致，且不再出现 `NaN%`。

## 第 12 项 切标签视口不恢复 —— 已修复

**提交**：`0c15cfd1 fix(tabs): restore each document's camera on tab switch`

**根因**：
`switchDocument` 已经把目标标签的 `editorCamera` 写回 store，但画布首次就绪的 `fitAll` 会在下一次渲染时覆盖它；因此切回标签时总是回到全页适配位置，而不是该标签原来的平移/缩放。

**修复**：
- `design_store.js`：新增 `pendingEditorCameraRestore`；`switchDocument` 恢复相机后置位，`beginDocument`/关闭最后一个标签时清除，避免泄漏到新文档。
- 新增 `editor_camera_restore.js` 的 `cameraFitDecision`：先消费“恢复相机”，已拟合过的页面集合跳过 fit，其余首次打开才 fit。
- `use_editor_shared_camera.js`：在 `fitAll` 之前消费该标记，并把当前页面集合记为已拟合。

**测试**：
- 新增 `tests/unit/document_tab_camera_restore.test.js`：验证 A/B 标签相机互相独立、切换后恢复并置位、打开新文档不继承恢复标记，以及决策函数三条分支。
- 真实 Electron UI 复测（两条标签分别平移）：
  - A 标签视口为 `translate3d(332px, -125.167px, 0px)`
  - B 标签视口为 `translate3d(332px, 624.833px, 0px)`
  - 切回 A、再切回 B，两个视口均逐像素恢复，不再回到 `(332px, 174.833px)` 的全页 fit 位置。

## 第 15 项 引导弹窗重复弹出 —— 已修复

**提交**：`ed92b66f fix(onboarding): keep the first-run guide dismissed`

**根因**：
`shouldShowFirstRun` 无视持久化状态，除 webdriver 和 `?firstRun=1` 外始终返回 `true`；Skip/完成写入的 `voo.firstRun.status` 从未被读取，所以每次启动都会再弹。

**修复**：
- `first_run_state.js` 读取 `voo.firstRun.status`，`completed` 或 `dismissed` 时不再显示。
- 保留 `?firstRun=1` 的强制打开和 webdriver 自动化静默。
- 测试同步更新：完成、跳过后均为 `false`；`?firstRun=1` 仍可强制打开；现有 workspace-guide 用户未设置 first-run 状态时仍会看到一次引导。

**测试**：
- `tests/unit/first_run_onboarding.test.jsx`：38 个用例通过。
- 真实 Electron UI 复测：首次启动出现引导；点击 Skip 后 `localStorage["voo.firstRun.status"]="dismissed"`；reload 后引导弹窗数量为 0。

## 验证记录

- **全量单元/集成测试**：`625` 个测试文件通过、`3` 个跳过；`5216` 个用例通过、`4` 个跳过、`0` 失败（`vitest run`，全量）。
  - 首次全量运行有两个环境性失败：缺少 `dist/` 构建产物、宿主机 `GIT_CONFIG_KEY_0` 缺失导致子进程 git 失败。补齐构建并在干净 git 环境重跑后全部通过；未跳过或弱化断言。
- **设计规范**：`node scripts/check-design.mjs` 通过，`1480` 个文件符合 `Design.md`。
- **模块登记**：`editor-checks --check` 有效（12 模块、115 能力、114 浏览器套件）。`editor-checks --changed --base b56a4e7a --json` 为 `unmapped: []`、`fullReleaseRequired: false`。
- **新增测试**：
  - `tests/unit/color_presets_gradient.test.js`
  - `tests/unit/document_tab_camera_restore.test.js`
  - `tests/unit/first_run_onboarding.test.jsx`（更新既有断言）

## 保留项 / 未验证

- 未在真实 Linux AppImage/打包产物中重跑整轮浏览器套件；真实 Electron 开发构建已做上述交互复测。
- 第 11 项未做显示器级色彩管理/宽色域比对；已验证的是编辑器内部 fill 字符串与 stop HEX 的精确一致。
- 按用户要求未 push、未部署、未合并，也未创建标签/Release。
