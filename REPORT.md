# VOO Design — JPG & WebP Export Roundtrip Acceptance Report (v2 Scope Correction)

**Date**: 2026-11-03  
**Task**: JPG and WebP real UI export, Web DOM filechooser re-import into fresh browser process, asset pixel comparison, interactive UI button & keyboard Undo/Redo, and cold reopen (v2 incremental verification)  
**Clone**: `/Users/tt/Documents/Codex/2026-11-02/task/b8-export-jpg-webp-20261103T083400Z`  
**Baseline Commit**: `b8ae8039a291e841f786b29f90af00e4f4c89653`  
**v1 Base Commit**: `b33e6085f3efb8340b70a2525fd93281d5fb3b60` (Tree `01557fbfdf557f1291640d74710a4ca7980bff56`)  
**v2 Verified Commit**: `7f9c014e6f0e3bdcbbc62ef0aaf23878810adc8f` (Tree `a547c39c6e86573a542ab0572b3ba2caec91d8ae`)  
**Commit Relationship**: `7f9c014e` 实现了真实 UI 按钮点击（`EditorZoom` 底栏撤销/重做按钮）与真实键盘快捷键（`Meta+z` / `Meta+Shift+z`）替代旧版的测试 harness `tool("undo/redo")` MCP 桥调用。其提交链为：`7f9c014e`（v2 测试与文档更正）→ `eac50921`（v1 报告入账）→ `b33e6085`（v1 初始实现）→ `b8ae8039`（基线）。  
**v2 独立证据目录**: `/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/b8-export-jpg-webp-v2-20261103T092500Z/`  
**Overall Status**: `ALL_PASSED`  
**Overall Exit Code**: `0`  

---

## 1. 实际执行证据与独立进程概览

### 1.1 增量补证（v2 固化运行实测：交互式 UI / 键盘 UndoRedo + 真实浏览器版本）

- **执行 Node PID**: 47702
- **Playwright npm 包版本**: `1.64.1`
- **实际 Chromium 浏览器版本**: `156.0.8078.4`（通过 `browser.version()` 抓取）
- **CDP 协议元数据** (`Browser.getVersion`):
  - `protocolVersion`: `1.3`
  - `product`: `HeadlessChrome/156.0.8078.4`
  - `revision`: `@f842f52ef39fd97b449eb27cff414bf05a98ddce`
  - `jsVersion`: `15.6.75`

| 阶段 | 运行环境 | Node PID | Browser PID (CDP 实际抓取) | 关键入口 / 控件 | 产物 / 状态 | Exit Code |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Step 1: 真实 UI 导出** | 独立进程 1 | 47702 | 47794 | `titlebar-export` → `design-export-dialog` → 格式按钮 (`JPEG` / `WebP`) → `Export` | `export-test.jpg` (3,915 B)<br>`export-test.webp` (1,388 B) | 0 |
| **Step 2: Filechooser 回导与像素对比** | 独立新进程 2 | 47702 | 48498 | 右键画板 `data-editor-artboard` → `editor-menu-import-media` → `filechooser.setFiles` | JPEG 资产 600×400 (Painted 240,000)<br>WebP 资产 600×400 (Painted 60,800) | 0 |
| **Step 3A: 交互式 UI 按钮 Undo/Redo** | 独立新进程 2 | 47702 | 48498 | `page.getByRole("button", { name: /Undo\|撤销/ })` 点击<br>`page.getByRole("button", { name: /Redo\|重做/ })` 点击 | JPEG Undo: 节点 1 → 0<br>JPEG Redo: 节点 0 → 1<br>解码像素哈希 `2819355748` 100% 恢复 | 0 |
| **Step 3B: 交互式键盘快捷键 Undo/Redo** | 独立新进程 2 | 47702 | 48498 | 画板聚焦 → `page.keyboard.press("Meta+z")`<br>`page.keyboard.press("Meta+Shift+z")` | WebP Undo: 节点 2 → 1<br>WebP Redo: 节点 1 → 2<br>解码像素哈希 `656127927` 100% 恢复 | 0 |
| **Step 4: 冷启动新进程** | 独立新进程 3 | 47702 | 49006 | Welcome 仪表盘顶栏 `Import project file` → `filechooser` | JPEG 冷开哈希与热态一致<br>WebP 冷开哈希与热态一致 | 0 |

---

## 2. 导出文件与渲染像素哈希（v2 独立产物）

- **产物固化目录**: `/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/b8-export-jpg-webp-v2-20261103T092500Z/`

### 2.1 基线画布渲染
- **文件路径**: `closure-acceptance-evidence/b8-export-jpg-webp-v2-20261103T092500Z/baseline-render.png`
- **尺寸**: 600 × 400
- **Painted 像素数**: 60,800（红、蓝、绿三个形状的总不重叠面积）
- **FNV-1a 像素哈希**: `2703388965`

### 2.2 真实 UI 导出落盘文件 (SHA-256)
- **JPEG**: `export-test.jpg` (3,915 bytes)
  - SHA-256: `3e2b492ce949a28eb9a6c4991bd536d7058ccc72b4880b60976e333e11146b30`
  - Magic Bytes: `[0xFF, 0xD8, 0xFF]`
- **WebP**: `export-test.webp` (1,388 bytes)
  - SHA-256: `b4d4b0c3470bb5ca10251f54fa6726324227d977225a245ad9157bccff95f5e2`
  - Magic Bytes: `RIFF...WEBP`
- **工程快照 (v2)**: `reimport-snapshot.zip` (22,599 bytes)
  - SHA-256: `089da646d669319c8186bbaa01bea629cc924979f3ce228835b5cc09d6a57861`

---

## 3. 回导资产像素比对、交互式 Undo/Redo 与冷开结果

### 3.1 JPEG 格式回环
- **回导方式**: 画板右键菜单 `[data-testid="editor-menu-import-media"]` 触发 Web DOM `filechooser` 写入落盘文件。
- **位图尺寸**: 600 × 400
- **Painted 像素数**: 240,000（JPEG 格式无 alpha 通道，强制不透明白底保真）
- **像素哈希 (FNV-1a)**: `2819355748`
- **各区域色值采样**:
  - 红色区域 (60, 60): `[254, 0, 0, 255]`
  - 蓝色区域 (260, 60): `[0, 0, 254, 255]`
  - 绿色区域 (160, 160): `[0, 255, 1, 255]`
  - 背景区域 (20, 20): `[255, 255, 255, 255]`
- **交互式按钮 Undo 验证**: 点击底栏撤销按钮，节点数从 1 降为 0，画布恢复空白状态。
- **交互式按钮 Redo 验证**: 等待重做按钮解除禁用并点击，节点数恢复为 1，解码位图像素哈希严格等于 `2819355748`（`pixelMatch: true`）。
- **冷开验证 (Process 3, PID 49006)**: 经 Welcome 顶栏导入文件 chooser 打开，水合后 JPEG 资产像素哈希为 `2819355748`，与热态哈希完全一致（`exactMatchWithWarm: true`）。

### 3.2 WebP 格式回环
- **回导方式**: 画板右键菜单 `[data-testid="editor-menu-import-media"]` 触发 Web DOM `filechooser` 写入落盘文件。
- **位图尺寸**: 600 × 400
- **Painted 像素数**: 60,800（WebP 支持 alpha 通道，导出弹窗默认透明背景，几何形状区域着色，背景透明无双重着色）
- **像素哈希 (FNV-1a)**: `656127927`
- **各区域色值采样**:
  - 红色区域 (60, 60): `[255, 1, 0, 255]`
  - 蓝色区域 (260, 60): `[0, 0, 255, 255]`
  - 绿色区域 (160, 160): `[0, 255, 1, 255]`
  - 背景区域 (20, 20): `[0, 0, 0, 0]`（Alpha 严格为 0）
- **交互式键盘 Undo 验证**: 聚焦画板后按键盘快捷键 `Meta+z`，节点数从 2 降为 1（仅留先前的 JPEG 节点）。
- **交互式键盘 Redo 验证**: 按键盘快捷键 `Meta+Shift+z`，节点数恢复为 2，解码位图像素哈希严格等于 `656127927`（`pixelMatch: true`）。
- **冷开验证 (Process 3, PID 49006)**: 经 Welcome 顶栏导入文件 chooser 打开，水合后 WebP 资产像素哈希为 `656127927`，与热态哈希完全一致（`exactMatchWithWarm: true`）。

---

## 4. 边界范围更正与分层说明

1. **v1 原始快照 ZIP 字节未保全事实披露**:
   - 经磁盘检索确认：原 v1 运行产物 `reimport-snapshot.zip`（22,595 字节，SHA-256 `36f880fcdbd0ce7e4fbf6883f88e334c11e276e3529b6b3709e4a8f2b64a84d6`）在初次 v2 测试时因未隔离输出目录而被覆盖，无独立备份文件；
   - 如实记录原 ZIP 字节未保全事实，严禁伪造恢复或重新运行冒充历史原件；
   - 原 v1 回执文件 `jpg-webp-roundtrip-receipt.json` 与日志 `jpg-webp-roundtrip.log` 完整保留未动；
   - 本次 v2 所有产物已固化至独立专属目录 `b8-export-jpg-webp-v2-20261103T092500Z`，实现证据物理隔离。
2. **Web DOM Filechooser 与操作系统原生对话框边界**:
   - 本次测试的回导与冷开导入，使用的是 Playwright `page.waitForEvent('filechooser')` 拦截浏览器的隐藏 `<input type="file">` 元素（由右键菜单项 `editor-menu-import-media` 及欢迎屏按钮触发）。
   - 该流程完整覆盖了 Web 端 DOM 文件摄入、ArrayBuffer 读取、ImageBitmap 解码与节点挂载全链路，但**不触达** macOS 系统的 `NSOpenPanel` 或 Windows Explorer 原生系统对话框。
3. **交互式 UI/键盘历史与 MCP 桥接历史边界**:
   - 初版回执中 lines 356/361/446/451 曾使用测试 harness 提供的 `tool("undo")` / `tool("redo")`，属于内部 MCP 桥接工具调用；
   - 本次 v2 补证完全替换为**真实 UI 按钮点击**（底栏 `EditorZoom` 的 `IconUndo` 与 `IconRedo` 按钮，通过 `aria-label` 与真实 disabled 状态调度）和**真实键盘快捷键**（`Meta+z` / `Meta+Shift+z`），断言画布节点变化及位图像素哈希 100% 恢复。
4. **Chromium 实际版本与 Playwright 包版本边界**:
   - `1.64.1` 为 Node.js 测试 harness 的 Playwright npm 包版本；
   - 实际运行测试的 Chromium 浏览器二进制版本为 `156.0.8078.4`（HeadlessChrome，CDP 协议版本 1.3，V8 15.6.75）。
5. **运行平台与原生 GUI 隔离**:
   - 运行于 macOS arm64 Headless Chromium 自动化环境；
   - 未替换或干扰真实应用 PID 224（`mac-arm64/VOO Design.app`），未碰其 profile；
   - Linux 及 Mac 原生图形窗口保持未测，不以 headless 浏览器冒充原生 OS 验收。
6. **代码隔离与协同纪律**:
   - 产品代码（`src/`）零修改；未修改 `ExportSection`、`presets` 或渲染引擎；
   - 仅包含新增 E2E 测试 `tests/e2e/jpg-webp-export-roundtrip.e2e.mjs` 及 `scripts/editor-module-catalog.mjs` 中的套件注册。
   - 无 git push，无 CI / Release 触发，原冻结仓库与 7 dirty refs 保持不动。

---

## 5. 文件与证据索引

- **v2 独立固化目录**: `/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/b8-export-jpg-webp-v2-20261103T092500Z/`
  - 新回执 JSON (v2): `jpg-webp-roundtrip-receipt-v2.json`
  - 独立执行日志: `jpg-webp-roundtrip.log`
  - 导出 JPEG: `export-test.jpg` (3,915 B)
  - 导出 WebP: `export-test.webp` (1,388 B)
  - 基线渲染: `baseline-render.png` (6,461 B)
  - v2 工程快照: `reimport-snapshot.zip` (22,599 B)
- **v1 原始目录 (保留原件)**: `/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/b8-export-jpg-webp-20261103T083400Z/`
  - 原回执 JSON: `jpg-webp-roundtrip-receipt.json`
  - 原执行日志: `jpg-webp-roundtrip.log`
