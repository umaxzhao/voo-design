# Changelog

## 1.0.0

- Canvas resize: dragging page edges, size presets and exact sizes now resolve child constraints (right, bottom, centre, stretch, scale, nested containers) in one undoable step.
- Skia text rendering keeps the italic style.
- Right panel: Figma-style fill and stroke type menus, independent horizontal/vertical anchor arms, nine-position anchor selector, Layers/Assets tabs on the left panel.
- Agents: CLI bridge authentication uses a private token file; the `new_document` MCP tool; connection retry and help on the first-run agent step; DeepSeek Harness connector.
- Onboarding: a single agent-setup step.
- Editor: supplied resize/rotate cursors, grabbable crop edges, unified live-filter stack and surfaced image tools.
- Deployment: the editor deploys directly to the `la2` host (see `docs/deploy-la.md`).
- Commercial release of VOO Design for macOS, Windows, and Linux.
- Includes the canvas editor, local project workflows, and crash recovery for unsaved drafts.
- Provides English and Simplified Chinese interfaces.
