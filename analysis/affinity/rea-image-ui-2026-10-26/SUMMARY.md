# Affinity 图像 UI 取证摘要

1. 顶栏有矢量、像素、布局、Canva AI Studio。**运行时截图** `current-pixel-studio.png`（当前选中矢量）。
2. 上下文栏显示像素背景、72dpi、开发、液化、色调映射入口。**运行时截图**。
3. 右侧可见颜色、图层、路径/画笔/快速特效/样式、变换/导航器/历史记录面板组。**运行时截图**。
4. 像素 Studio 的定位涵盖位图编辑、滤镜、调整及配套面板。**REA 静态** `zh-Hans-studios.json`。
5. 色彩分级 Studio 描述列出 Scopes、宏、Library、快速调整和调整预设。**REA 静态** `en-GB-studios.json` / `zh-Hans-studios.json`。
6. 修整 Studio 说明含快照、多版本保存/恢复。**REA 静态** `studios.strings`。
7. 合成 Studio 说明强调非破坏性滤镜快捷入口。**REA 静态** `studios.strings`。
8. 调整字符串表含 158 项，混合调整名与预设，不能当作菜单条目计数。**REA 静态** `menus.json`。
9. preference 中抽取 7 个 Studio archive 并得到对象/引用数；面板组合未完全还原。**REA 静态+推断** `studio-layout.json`。
10. Lead 备用图已入库，标明来源；菜单、工具参数和 Persona 具体流程尚缺。**截图证据/缺项** `screens/lead-*.png`。

缺失：REA 深度 provider 不可用；目标主菜单 nib 未覆盖；Filter/Adjustments 菜单截图、滤镜对话框、实际 Persona 切换和焦点合成流程未采集；`studios3.dat` 不支持。
