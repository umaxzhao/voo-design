# DISPATCH — 2026-10-21T23:22:00Z

You are orchestrator_11, the top-level Project Orchestrator for voo_design.
Your working directory is /Users/tt/teamwork_projects/voo_design/.agents/teamwork/orchestrator_11.
The user request is recorded in /Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md.

The user's latest requirement:
为 VOO Design 画布引擎实施全面的全栈性能架构升级：包括结合空间索引的高效视口剔除（Viewport Culling）与静态图层分层离屏缓存、手势高频吸附与几何运算防卡顿解耦、以及大图纹理与历史快照内存管理，确保上千节点与高负载编辑场景下平移缩放稳定 60FPS。

Key Requirements:
### R1. 视口剔除与分层离屏渲染加速（Viewport Culling & Layer Caching）
在 `src/canvas/editor/viewport_culling.js`、`src/canvas/editor/spatial_index.js` 及渲染管线中：
- 结合空间索引（Spatial Index / R-Tree）将视口内外判定与图层候选筛选优化至 O(log N)，在大规模节点（1000+）场景下快速过滤非视口图层及其耗时特效（模糊、阴影、路径混合）。
- 为静态图层与无形变群组提供智能离屏缓存机制，在用户平移画布或拖动单个图层时，复用已渲染位图缓存，避免无意义的全树全量重绘。

### R2. 高频手势与吸附计算防抖解耦（Gesture & Snapping Optimization）
在 `src/canvas/editor/editor_pointer_move.js` 与 `src/canvas/editor/scene_snapping.js` 中：
- 拖拽与移动变换过程中的对齐、等间距吸附和参考线计算，改为仅在拖拽目标附近的局部几何包围盒（Local AABB Neighborhood）中查询候选对象，杜绝全画布节点全量几何碰撞检测。
- 交互手势与主渲染循环严格使用 `requestAnimationFrame` 驱动调度，防止高刷新率鼠标/触控板 `pointermove` 事件泛滥导致帧率掉到 30FPS 以下。

### R3. 大图纹理、显存与历史快照内存管理（Memory & Texture Optimization）
在 `src/canvas/editor/bitmap_cache.js`、`src/canvas/editor/gl_spatial.js` 及历史状态控制器中：
- 为大尺寸位图与离屏画布实现自适应 LRU 纹理缓存管理，不可见/长时间未引用的显存资源自动释放，防止内存堆积导致 OOM。
- 优化历史记录（Undo/Redo）快照机制，采用结构共享或差量补丁（Diff-based Patches）避免长会话下完整克隆全树导致的内存暴涨。

### R4. 自动化验证与生产部署（Verification & Deployment）
- 编写专项性能基准测试与功能回归测试，覆盖视口边界剔除精度、海量节点吸附与内存释放，确保 `npm test` 100% 通过（保持 60+ 测试套件全绿）。
- 确保 `npm run lint:design` 完全 clean（0 违规），严格遵循 `Design.md` 规范。
- 遵循部署规则：改动完成且测试通过后，自动执行 `VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh` 部署上线并完成服务探活（HTTP 200 at https://la.voo.run/editor/）。
- 目标服务器固定为 `la` (`103.114.160.86`)，路径 `/var/www/voo.run/editor/`。绝不部署到 `pt` 服务器。

Orchestration Protocol:
- Decompose work and dispatch to specialized subagents under `.agents/teamwork/` (e.g., explorers, workers, reviewers, challengers).
- Maintain detailed `progress.md` in your directory (/Users/tt/teamwork_projects/voo_design/.agents/teamwork/orchestrator_11/progress.md).
- When done and verified with test passes and deployment, report completion back to Sentinel.
