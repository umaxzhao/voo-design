# Agent instructions

## Product rules

- **UI 对标 Figma，图像处理对标 Affinity**：只修现有功能，不加新功能。
- **绿色外框（`#b2ffd6`）是产品特色，不准移除**。
- **深色版**：不做浅色版。
- **隐藏 Linux 系统顶栏和菜单栏**。
- **标题栏不加保存按钮**。

## Simplicity first

Read `Design.md` before changing UI. Its first rule is binding:

> **不要做特别复杂的事。**

Default to the smallest interface that completes the task. Prefer removing,
merging, or automating an option over adding a new control. Put genuinely
advanced options behind one secondary entry (a settings button, a detail
popover, or a drawer), never inline in the default surface.

When a change adds visible controls, verify that each one is necessary, has a
single home, and is not duplicating existing UI. If the default interface
still works after removing a control, remove it.

## Common commands

- **单测 (Unit tests)**: `npm test` (`npm run test`) 或 `npm run test:module`
- **Lint (Design lint)**: `npm run lint:design`
- **打 Linux AppImage**: `npm run dist`
- **包校验**: `npm run verify:package`

## Known pitfalls & operational rules

- **所有命令都加 timeout**：避免进程悬挂或超时假死。
- **不准用交互式命令**：任何脚本或 CLI 命令必须以非交互模式运行。
- **截图方式**：截图只能用 `xdotool` 加 `import -window <窗口ID>`。
- **PATH 顺序**：PATH 里不要把 `/usr/bin` 放在 `orca` 前面。
- **AppImage 运行**：启动 AppImage 时必须加 `--ozone-platform=x11`。
- **dsh 沙盒**：dsh 沙盒环境可能会把 `.git` 设成只读。

## Git rules

- **Worktree 隔离**：每个子 agent 在 `~/projects/voo-wt/` 下使用独立的 git worktree。
- **保护他人修改**：不覆盖别人未提交的修改（如未提交文件备份与隔离）。
- **禁止 Force Push**：严禁 `git push --force`。
- **分支与 PR 规范**：只推新分支、开 PR，严禁直接合入 `main`。

## Reporting discipline

- **失败必须如实记录**：失败就保留日志，严禁谎报成功。
- **实证原则**：每个结论都必须附带证据（截图、测量数据、测试输出）。

## Automatic preview deployment

After each application update passes the required checks, automatically create
one commit containing only that task's changes, push it to the configured
GitHub branch, and deploy the editor with `scripts/deploy-editor.sh`. Do not
wait for another confirmation. Verify that `https://voo.run/editor/` serves the
deployed build and report the preview URL and commit. If validation, pushing, or
deployment fails, report the failure and its cause instead of claiming success.

Other project conventions and verification commands are in `README.md` and
`docs/agents.md`.

## Desktop publication policy

Do not create a version tag, draft Release or public GitHub Release without a
new explicit user request to publish. Ordinary commits, PR merges and automatic
Web preview deployment do not authorize desktop publication. Future user-facing
download lists should contain installers only; retain required updater metadata,
and keep CI/signing receipts in Actions evidence. Do not rewrite existing Beta2.

## Module ownership and acceptance

Follow `docs/engineering-workflow.md`. Before changing a behavior, identify its
module in `scripts/editor-module-catalog.mjs` and inspect the affected/related
checks with `node scripts/editor-checks.mjs --changed --json`. Add new behavior
IDs and test ownership to that catalog; keep detailed scope and unverified
contexts in the relevant audit document. Use one common domain operation for
UI, shortcut and Agent entry points.

A passing test run proves only its registered assertions on its recorded
revision. Never mark an untested context, skipped test, blocked service or
different platform passed. Keep execution and functional coverage separate in
delivery reports. Reproduce defects before fixing them and retain the failing
scenario as a regression check.

Maintain `docs/quality-progress.md` as the user's single progress entry. After
each audit, update affected module status, remaining contexts and the exact
verified revision/evidence; never inherit a historical pass for changed code.
