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

Other project conventions and verification commands are in `README.md` and
`docs/agents.md`.
