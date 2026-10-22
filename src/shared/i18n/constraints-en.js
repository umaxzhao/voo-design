/**
 * Resize-constraint copy (pin / stretch / centre / scale).
 *
 * Shipped as its own module (like rulers-en.js) so the string table can be
 * wired into `en.js` by the Lead without either worker editing the shared
 * dictionary. Values are flat app keys under `editor.constraints.*`.
 */
export default {
  "editor.constraints.title": "Constraints",
  "editor.constraints.horizontal": "Horizontal",
  "editor.constraints.vertical": "Vertical",
  "editor.constraints.left": "Left",
  "editor.constraints.right": "Right",
  "editor.constraints.leftRight": "Left & right",
  "editor.constraints.center": "Center",
  "editor.constraints.scale": "Scale",
  "editor.constraints.top": "Top",
  "editor.constraints.bottom": "Bottom",
  "editor.constraints.topBottom": "Top & bottom",
  "editor.constraints.hint": "Pins keep their offset when the frame resizes",
};
