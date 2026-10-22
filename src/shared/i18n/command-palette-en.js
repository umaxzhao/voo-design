/**
 * English copy for the ⌘K command palette.
 *
 * Shipped as its own module (like rulers-en.js) so the string table can be
 * wired into `en.js` by the Lead without a worker editing the shared
 * dictionary. Keys are flat app keys under `commandPalette.*`.
 */
export default {
  "commandPalette.title": "Command palette",
  "commandPalette.placeholder": "Search commands and actions",
  "commandPalette.sections.recent": "Recent",
  "commandPalette.sections.commands": "Commands",
  "commandPalette.sections.actions": "Actions",
  "commandPalette.empty": "No matching commands",
  "commandPalette.hint.navigate": "↑↓ navigate",
  "commandPalette.hint.run": "↵ run",
  "commandPalette.hint.close": "esc close",
  "commandPalette.shortcut": "⌘K",
};
