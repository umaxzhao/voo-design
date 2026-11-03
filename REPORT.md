# VOO Design — JPG & WebP Export Roundtrip Acceptance Report

**Date**: 2026-11-03  
**Task**: JPG and WebP real UI export, filechooser re-import into fresh browser process, asset pixel comparison, Undo/Redo, and cold reopen  
**Clone**: `/Users/tt/Documents/Codex/2026-11-02/task/b8-export-jpg-webp-20261103T083400Z`  
**Baseline Commit**: `b8ae8039a291e841f786b29f90af00e4f4c89653`  
**Verified Pinned Commit**: `b33e6085f3efb8340b70a2525fd93281d5fb3b60`  
**Tree Hash**: `01557fbfdf557f1291640d74710a4ca7980bff56`  
**Overall Status**: `ALL_PASSED`  
**Overall Exit Code**: `0`  

---

## 1. 实际执行证据与独立进程概览

| 阶段 | 运行环境 | Node PID | Browser PID (CDP 实际抓取) | 关键入口 / 控件 | 产物 / 状态 | Exit Code |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Step 1: 真实 UI 导出** | 独立进程 1 | 95584 | 95599 | `titlebar-export` → `design-export-dialog` → 格式按钮 (`JPEG` / `WebP`) → `Export` | `export-test.jpg` (3,915 B)<br>`export-test.webp` (1,388 B) | 0 |
| **Step 2: Filechooser 回导与像素对比** | 独立新进程 2 | 95584 | 95840 | 右键画板 `data-editor-artboard` → `editor-menu-import-media` → `filechooser.setFiles` | JPEG 资产 600×400 (Painted 240,000)<br>WebP 资产 600×400 (Painted 60,800) | 0 |
| **Step 3: Undo / Redo 验证** | 独立新进程 2 | 95584 | 95840 | `tool("undo")` / `tool("redo")` | JPEG Undo: 0, Redo: 1<br>WebP Undo: 1, Redo: 2<br>像素哈希 100% 恢复 | 0 |
| **Step 4: 冷启动新进程** | 独立新进程 3 | 95584 | 96017 | Welcome 仪表盘顶栏 `Import project file` → `filechooser` | JPEG 冷开哈希与热态一致<br>WebP 冷开哈希与热态一致 | 0 |

---

## 2. 导出文件与渲染像素哈希

### 2.1 基线画布渲染
- **文件路径**: `closure-acceptance-evidence/b8-export-jpg-webp-20261103T083400Z/baseline-render.png`
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
- **工程快照**: `reimport-snapshot.zip` (22,595 bytes)
  - SHA-256: `36f880fcdbd0ce7e4fbf6883f88e334c11e276e3529b6b3709e4a8f2b64a84d6`

---

## 3. 回导资产像素比对、Undo/Redo 与冷开结果

### 3.1 JPEG 格式回环
- **回导方式**: 画板右键菜单 `[data-testid="editor-menu-import-media"]` 触发原生 `filechooser` 写入落盘文件。
- **位图尺寸**: 600 × 400
- **Painted 像素数**: 240,000（JPEG 格式无 alpha 通道，强制不透明白底保真）
- **像素哈希 (FNV-1a)**: `2819355748`
- **各区域色值采样**:
  - 红色区域 (60, 60): `[254, 0, 0, 255]`
  - 蓝色区域 (260, 60): `[0, 0, 254, 255]`
  - 绿色区域 (160, 160): `[0, 255, 1, 255]`
  - 背景区域 (20, 20): `[255, 255, 255, 255]`
- **Undo 验证**: 节点数从 1 降为 0，画布恢复空白状态。
- **Redo 验证**: 节点数恢复为 1，解码位图像素哈希严格等于 `2819355748`（`pixelMatch: true`）。
- **冷开验证 (Process 3, PID 96017)**: 经 Welcome 顶栏导入文件 chooser 打开，水合后 JPEG 资产像素哈希为 `2819355748`，与热态哈希完全一致（`exactMatchWithWarm: true`）。

### 3.2 WebP 格式回环
- **回导方式**: 画板右键菜单 `[data-testid="editor-menu-import-media"]` 触发原生 `filechooser` 写入落盘文件。
- **位图尺寸**: 600 × 400
- **Painted 像素数**: 60,800（WebP 支持 alpha 通道，导出弹窗默认透明背景，几何形状区域着色，背景透明无双重着色）
- **像素哈希 (FNV-1a)**: `656127927`
- **各区域色值采样**:
  - 红色区域 (60, 60): `[255, 1, 0, 255]`
  - 蓝色区域 (260, 60): `[0, 0, 255, 255]`
  - 绿色区域 (160, 160): `[0, 255, 1, 255]`
  - 背景区域 (20, 20): `[0, 0, 0, 0]`（Alpha 严格为 0）
- **Undo 验证**: 节点数从 2 降为 1（仅留先前的 JPEG 节点）。
- **Redo 验证**: 节点数恢复为 2，解码位图像素哈希严格等于 `656127927`（`pixelMatch: true`）。
- **冷开验证 (Process 3, PID 96017)**: 经 Welcome 顶栏导入文件 chooser 打开，水合后 WebP 资产像素哈希为 `656127927`，与热态哈希完全一致（`exactMatchWithWarm: true`）。

---

## 4. 边界与受限说明

1. **环境与运行态**:
   - 运行于 macOS arm64 Headless Chromium 1.64.1，经 CDP 注入获取宿主 Chromium 真实 PID；
   - 未替换或干扰真实应用 PID 224（`mac-arm64/VOO Design.app`），未碰其 profile；
   - Linux 及 Mac 原生图形窗口未覆盖（标记为未测，不以 headless 浏览器冒充原生 OS 验收）。
2. **代码隔离**:
   - 产品代码（`src/`）零修改；未修改 `ExportSection`、`presets` 或渲染引擎；
   - 仅包含新增 E2E 测试 `tests/e2e/jpg-webp-export-roundtrip.e2e.mjs` 及 `scripts/editor-module-catalog.mjs` 中的套件注册。
   - `npm run lint:design`（1479 files clean）与 `node scripts/editor-checks.mjs --check`（valid）全部通过。
3. **无外部动作**:
   - 无 git push，无 CI / Release 触发，原冻结仓库与 7 dirty refs 保持不动。

---

## 5. 文件与证据索引

- **回执 JSON**: `/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/b8-export-jpg-webp-20261103T083400Z/jpg-webp-roundtrip-receipt.json`
- **执行日志**: `/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/b8-export-jpg-webp-20261103T083400Z/jpg-webp-roundtrip.log`
- **测试代码**: `tests/e2e/jpg-webp-export-roundtrip.e2e.mjs`
