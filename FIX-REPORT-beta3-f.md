# VOO Design 1.0.0-beta.3 Linux 桌面窗口外框修复报告（worktree f）

- 分支：`fix/beta3-f`
- 工作树：`/home/umax/projects/voo-wt/f`
- 修复基线：`b56a4e7a`
- 代码/测试提交：`d953c7f0`（`fix(desktop): match hosted mint frame and hide Linux native chrome`）
- 范围：只处理 Linux 桌面版窗口外框、系统顶栏/菜单栏隐藏、窗口拖动与窗口按钮；不做浅色主题，不改其他问题。
- 交付约束：未 push、未部署、未合并到其他分支；标题栏未加保存按钮。

## 1. 深色薄荷绿外框：换成网页版已修好的实现

### 原因

beta.3 桌面的外框和网页版不一致，根因是桌面壳层自己又叠了一套“窗口内缩 + 窗口背景绿边”的旧实现：

1. `.app-root-frame` 仍带 4px safe-area 内边距；`.editor-shell` 的 2px 边框因此离开窗口边缘，窗口底色和边框之间多出黑边/第二道绿边。
2. `App.jsx` 根节点使用旧的 4px 左右绿渐变；标题栏又单独画品牌渐变。两者在左上圆角处拼不齐，出现顶部断开和黑三角。
3. 圆角处只画了 2px 边框，16px 外弧与 12px 内弧之间的角落没有薄荷绿填充，露出黑色窗口底色。
4. 旧的根背景在底部多出 2px 黑色区域，形成“底部黑条”。

网页版 `https://voo.run/editor/` 的已部署 CSS 已经有这套修复：黑窗口、`padding: 0`、`.editor-shell` 自身铺薄荷绿、仅左上角用 20px 径向渐变延续标题栏渐变。本次直接按网页版的实现和数值落回：

- `src/App.jsx`：根节点使用 `style={{ background: "#000" }}`（与网页版部署代码一致）。
- `src/app_title_bar.jsx`：恢复网页版的标题栏品牌渐变
  `linear-gradient(-90deg, rgb(0, 0, 0) 70.123%, rgb(178, 255, 214) 89.855%)`。
- `src/index.css`：
  - `.editor-shell` 保持 `border: 2px solid #b2ffd6; border-radius: 16px; background: #b2ffd6;`，用薄荷绿填满圆角缝隙。
  - `.app-root-frame:not([data-embed="true"]) { padding: 0; }`，让 2px 边框贴着窗口四边。
  - 非嵌入工作区背景使用网页版同一条规则：
    `radial-gradient(circle at 0 0, #b2ffd6 0 20px, transparent 20.5px) top left / 21px 21px no-repeat, #000`。
  - 嵌入模式工作区保持 `background: #000`，不显示窗口外框。
- 不再在 CSS 里重复写标题栏渐变，也不再使用旧的 4px/6px 左右绿渐变。

效果：整圈 2px 等宽；左右、顶部、底部都贴窗口边缘；四个圆角的 2px 描边连续（左上角由标题栏渐变补满）；没有第二道内绿线、没有底部黑条。1024×700 和 1440×900 两个桌面尺寸的像素断言均通过。

## 2. Linux 隐藏系统顶栏和菜单栏，保留拖动、窗口按钮和快捷键

### 实现

- 新增 `electron/window-chrome.cjs`：
  - Linux 使用 `frame: false`，不创建原生标题栏；macOS/Windows 仍沿用原来的 `hiddenInset` / `default` 原生 chrome。
  - Linux 隐藏菜单栏：`setAutoHideMenuBar(false)` + `setMenuBarVisibility(false)`；应用菜单仍通过 `native-menu.cjs` 安装，因此 `CmdOrCtrl+N/O/S/...` 等快捷键仍然有效，且按 Alt 不会重新显示菜单栏。
  - 监听 `maximize` / `unmaximize`，通过 `window:maximized` 把原生状态推给渲染层。
  - `window:minimize`、`window:toggleMaximize`、`window:isMaximized`、`window:close` 四个 IPC 只接受创建窗口的主 frame；关闭走 `win.close()`，继续复用未保存确认的 close guard，不调用 `destroy()`。
- `electron/preload.cjs`：在 `vooDesktop.windowControls` 暴露上述命令和状态订阅，仅在 Linux `supported: true`。
- `src/canvas/components/desktop_window_controls.jsx` + `desktop-window-controls.module.css`：在现有极简标题栏右侧渲染最小化/最大化（还原）/关闭三个按钮；按钮为 `no-drag`，标题栏其余区域仍为 `-webkit-app-region: drag`。
- 只影响 Linux：macOS 红绿灯和 Windows 原生标题栏路径未改变；应用内标题栏未加保存按钮。

### 验证

- Electron e2e（Linux，X11/XWayland）：
  - 窗口无原生标题栏/菜单栏空间（`getBounds()` 与 `getContentBounds()` 一致）；
  - 菜单栏不可见，Alt 后仍不可见；
  - 应用菜单仍安装，`New Document` 的 `CmdOrCtrl+N` accelerator 仍在；
  - 标题栏计算样式为 `drag`，窗口按钮容器为 `no-drag`；
  - 最大化、还原、最小化、关闭四个操作均通过真实按钮 + IPC 验证。
- 原生拖动：在 Xvfb + fluxbox 纯 X11 环境下用 `xdotool` 在标题栏空白处做真实指针按下/移动/释放，窗口从 `(240, 79)` 移动到 `(420, 159)`。当前 Wayland/XWayland 会话下 xdotool 的按键事件不投递到 Electron 窗口，因此该拖动证据使用 Xvfb + fluxbox 取得；提交中的 e2e 仍保留可重复的拖动区域/可移动性断言。

## 3. 取消浅色主题适配

- `src/theme-light.css` 已 `git checkout` 回基线，未保留任何本轮浅色外框改动。
- `src/canvas/components/editor_mobile_layout.css` 已回基线；本轮只做 Linux 桌面窗口，不改移动/窄窗布局。
- 新增单测会阻止再次往 `theme-light.css` 添加 `.app-root-frame`/`radial-gradient` 外框规则。
- 目前只有深色版外框；没有新增浅色版，也没有为浅色主题做适配。

## 4. 测试与证据

### 新增/更新测试

| 测试 | 结果 |
| --- | --- |
| `tests/unit/mint_frame_parity.test.js` | 5/5 通过：网页版外框规则、标题栏渐变、无浅色外框、移动端规则未被本轮改动 |
| `tests/unit/window_chrome.test.js` | 10/10 通过：platform options、菜单隐藏、最大化事件、IPC 归属/关闭路径 |
| `tests/unit/linux_menu_accelerators.test.js` | 4/4 通过：菜单仍安装，Ctrl+N/O/S/... 等 accelerator 未被隐藏菜单栏移除 |
| `tests/e2e/mint-frame.e2e.mjs` | 1440×900、1024×700 均通过：四边贴边、单条 2px、无内层绿线、四角描边连续 |
| `tests/e2e/linux-window-chrome.e2e.mjs` | 通过：frameless、菜单隐藏且 Alt 不唤出、窗口按钮、拖动区域、快捷键菜单仍在 |
| 既有 `titlebar_actions` / `electron_cli_bridge` / `adversarial_isolation_electron_safety` | 更新 mock 以适配新窗口模块，相关用例全部通过 |

### 全量回归

- `npm test -- --no-cache`（修正当前 shell 里损坏的 `GIT_CONFIG_*` 环境后执行）：**626 个测试文件通过，3 个跳过；5227 个用例通过，4 个跳过，0 失败**。
- `npm run lint:design`：`design: clean — 1481 file(s) match Design.md.`
- `npm run check:modules`：`12 modules / 117 features / 115 browser suites / 10 additional checks`，注册有效。
- `node scripts/editor-checks.mjs --changed --json`：`unmapped: []`，`fullReleaseRequired: false`；`mint-frame` 已登记为 platform 套件，`linux-window-chrome` 已登记为 native 独立检查。
- 截图/像素证据保存在工作树内 `.local-drafts/evidence/`（不进 git）：`linux-window-chrome.png`、`linux-window-maximized.png`、`voo-mint-frame-1440x900.png`、`voo-mint-frame-1024x700.png`。

## 5. 交付说明与限制

- 本轮只提交了上述修复和测试；`.local-drafts/` 调试脚本/证据未提交（已加入本地 `.git/info/exclude`）。
- 共享仓库元数据在当前环境只读，因此本工作树按上一轮同样方式使用工作区内的本地 `.git/` 元数据（对象库通过 `alternates` 指向共享对象库），提交只落在本工作树的 `fix/beta3-f`；未改写共享 ref，未 push、未部署、未合并。两份提交的补丁保存在 `.git/beta3-f-fixes.patch`，便于在可写环境 `git am` 回共享分支。
- `/home/umax/Desktop/voo-qa` 在当前沙箱不可写，因此本报告写在工作树根目录 `FIX-REPORT-beta3-f.md`，请复制到 `/home/umax/Desktop/voo-qa/FIX-REPORT-beta3-f.md`。
- 本轮未运行完整的 115 组浏览器门禁；只运行了与本修复直接相关的 `mint-frame` 浏览器 e2e 和 Linux Electron e2e，以及全量单元/集成测试。其他平台和完整发布门禁不能由本轮结果继承。
- Electron e2e 使用 Vite 开发服务器 + 未打包的 Electron 可执行文件；本轮未重新执行 `npm run dist`/AppImage 打包，也未做安装包升级或签名验证。
