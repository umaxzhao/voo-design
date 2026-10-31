# Agent instructions

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

## Automatic preview deployment

After each application update passes the required checks, automatically create
one commit containing only that task's changes, push it to the configured
GitHub branch, and deploy the editor with `scripts/deploy-editor.sh`. Do not
wait for another confirmation. Verify that `https://voo.run/editor/` serves the
deployed build and report the preview URL and commit. If validation, pushing, or
deployment fails, report the failure and its cause instead of claiming success.

Other project conventions and verification commands are in `README.md` and
`docs/agents.md`.

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
