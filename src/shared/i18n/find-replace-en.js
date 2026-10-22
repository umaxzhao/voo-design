/**
 * English copy for the canvas find & replace bar.
 *
 * Its own module so the Lead can wire it into `en.js` without a worker editing
 * the shared dictionary. Keys sit under `findReplace.*`; the undo-history label
 * shares the same feature prefix.
 */
export default {
  "findReplace.title": "Find and replace",
  "findReplace.findPlaceholder": "Find text",
  "findReplace.replacePlaceholder": "Replace with",
  "findReplace.caseSensitive": "Match case",
  "findReplace.wholeWord": "Whole word",
  "findReplace.previous": "Previous match",
  "findReplace.next": "Next match",
  "findReplace.replaceOne": "Replace",
  "findReplace.replaceAll": "Replace all",
  "findReplace.close": "Close",
  "findReplace.noResults": "No results",
  "findReplace.matchCount": "{current} / {total}",
  "findReplace.history": "Find and replace",
  "editor.history.entry.replaceText": "Find and replace",
};
