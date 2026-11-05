# VOO Design beta.3 Linux QA 修复报告（fix/beta3-b）

日期：2026-11-05  
范围：只处理问题清单第 2、8、9 项；未触碰其他问题，未新增功能，标题栏未加保存按钮。  
分支：`fix/beta3-b`（基于 `b56a4e7a`）  
状态：三项均已修复并补回归测试；未 push、未部署、未合并到其他分支。

## 逐项状态

### 第 2 项：Frame 工具拖动错误 — 已修复

- **现象**：Frame 工具激活且已选中 Frame 时，在空白/标题区域拖动会移动已选中的 Frame，而不是画新 Frame；Ctrl+Z 撤销的是上一步锁定状态，Frame 位置不回退。
- **根因**：artboard 标题栏的拖动只写 `editorArtboardLayouts`（视图布局），不写文档历史。`onTitlePointerDown` 没有按当前工具门控，Frame 工具下仍会启动 artboard 拖动；因此 Frame 被移走而 Undo 找不到这次移动。
- **修复**：标题栏/正文拖动改为读取 live engine 的当前工具，只有 `Select` 才允许移动 artboard；`Hand` 走画布平移；绘制工具下标题/名称 chrome 让出指针。Frame 工具在标题栏、空白处、另一页都创建新 Frame，并作为一条文档历史记录。
- **提交**：`02b97484` `fix(layers): Frame tool drag must create a Frame`
- **测试**：`tests/e2e/frame-tool-first-gesture.e2e.mjs`
  - 标题栏拖动：新 Frame 产生、selected Frame 几何不变、artboard layout 不变、一步 undo/redo。
  - 空白拖动：同上，selected root Frame 不动。
  - 跨页：按下页收到 Frame 工具，在目标页创建 Frame，保留该页 selected Frame/layout，一步 undo 移除。

### 第 8 项：钢笔首击选中已有 Frame — 已修复

- **现象**：钢笔第一次点击有时选中已有 Frame，而不是落第一个锚点。
- **根因**：Frame 名称标签是 Select 专用按钮 chrome；钢笔按在标签上时按钮先选中 Frame 并吞掉事件。另一个页面仍持有旧的 Select 工具，也会在首击时消费手势。
- **修复**：绘制工具下 Frame 名称标签 `pointer-events:none`、退出 tab 顺序；共享工具栏工具在 canvas press 聚焦时同步到目标页，目标页立即按钢笔/Frame 等工具处理首击。
- **提交**：`f469444e` `fix(selection): let the first pen press own Frame chrome`
- **测试**：`tests/e2e/frame-pen-first-press.e2e.mjs`
  - 钢笔点已有 Frame 名称标签：落 1 个锚点，坐标在指针下，Frame 不移动。
  - 跨页钢笔首击：目标页收到 Pen，锚点落在该页文档坐标，选区不被替换。

### 第 9 项：跨 Frame 点选第一下不选中 — 已修复

- **现象**：点击另一个 Frame 里的对象，有时第一下不选中，仍停在原 Frame。
- **根因**：canvas press 聚焦另一页时会恢复该页保存的相机或触发 fit；artboard 在引擎 hit-test 之前移动，点击坐标落到空白，首击不选中。
- **修复**：canvas press 的聚焦使用 `preserveCamera`，不恢复页面相机、不触发 fit；页面切换器原有的相机恢复逻辑保持不变。
- **提交**：`41426d35` `fix(canvas): focus a Frame without moving its camera`
- **测试**：`tests/e2e/cross-frame-first-click.e2e.mjs`
  - 给目标 Frame 设置不同保存相机；从另一页首击其对象，断言选中 `peer-child`、共享相机不变、artboard rect 不跳。

## 验证记录

- 新增 E2E 均以真实 Chromium + 真实鼠标事件运行并通过：
  - `frame-tool-first-gesture.e2e.mjs`：3 项断言组通过。
  - `frame-pen-first-press.e2e.mjs`：2 项断言组通过。
  - `cross-frame-first-click.e2e.mjs`：1 项断言组通过。
- 既有相关套件复跑通过：`frame-label-selection`、`editor-canvas-navigation`、`frame-alt-duplicate`、`frame-child-pointer`。
- `npm run lint:design`：1479 文件，0 违规。
- `npm run check:modules`：12 模块 / 118 能力 / 117 浏览器套件，注册有效；`--changed --base b56a4e7a`：`unmapped: []`、`fullReleaseRequired: false`。
- 全量单测：5203 passed / 4 skipped / 5 failed；5 项失败全部来自 `adversarial_isolation_electron_safety.test.js` 依赖本机未构建的 `dist/`，与本次改动无关。相关定向单测全部通过。

## 未验证 / 限制

- 未做物理触控、手写笔、多显示器 DPI、真实 IME 或安装包交互验证。
- 页面切换器主动切换页面时的相机恢复路径有意保留原行为，本报告只覆盖 canvas 上按下的首击。
- 未执行付费生成、网络模型、签名安装器或桌面发布流程。
- 未 push、未部署、未合并。

## 环境说明（重要）

当前沙箱把共享 worktree 元数据 `/home/umax/projects/voo_design/.git/worktrees/b` 设为只读，`git commit` 无法写入中央仓库；`/home/umax/Desktop/voo-qa` 与 workspace 外路径同样只读。为完成“本地提交”，本轮在 worktree 内建立了自包含 git 目录 `.git`（原中央 worktree 指针保存为 `.git.central-worktree`），分支与历史仍为 `fix/beta3-b`，上面三个提交号可在当前 worktree 用 `git log --oneline -3` 查看。中央 worktree 的 `refs/heads/fix/beta3-b` 未被更新。若要在可写的中央 worktree 中接收这些提交，可先保留当前目录：

```bash
mv .git .git-local
mv .git.central-worktree .git
git fetch .git-local fix/beta3-b:fix/beta3-b
```

这样中央 worktree 的 `fix/beta3-b` 会包含本地提交，且不会 push 到远端。

由于 `/home/umax/Desktop/voo-qa` 只读，本报告实际写在仓库内 `docs/FIX-REPORT-beta3-b.md`；内容与要写入 Desktop 的版本一致。可写环境下执行 `cp docs/FIX-REPORT-beta3-b.md /home/umax/Desktop/voo-qa/FIX-REPORT-beta3-b.md` 即可落到要求位置。
