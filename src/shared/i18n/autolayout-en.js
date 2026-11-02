/**
 * Auto layout depth copy (wrap, cross gap, align content, min/max sizing).
 *
 * Shipped as its own module (like rulers-en.js) so the string table can be
 * wired into `en.js` by the Lead without either worker editing the shared
 * dictionary. Values are flat app keys under `editor.autoLayout.*`; the
 * existing pre-wrap keys stay in `en.js` and are not duplicated here.
 */
export default {
  "editor.autoLayout.hugCompact": "Hug",
  "editor.autoLayout.advanced": "Auto layout settings",
  "editor.autoLayout.paddingHorizontal": "Horizontal padding",
  "editor.autoLayout.paddingVertical": "Vertical padding",
  "editor.autoLayout.mixed": "Mixed",
  "editor.autoLayout.alignmentPoint": "Vertical {row}, horizontal {column}",

  "editor.autoLayout.wrap": "Wrap",
  "editor.autoLayout.on": "On",
  "editor.autoLayout.off": "Off",
  "editor.autoLayout.crossGap": "Cross gap",
  "editor.autoLayout.alignContent": "Align content",
  "editor.autoLayout.space-around": "Space around",
  "editor.autoLayout.space-evenly": "Space evenly",
  "editor.autoLayout.constraints": "Size constraints",
  "editor.autoLayout.minWidth": "Min W",
  "editor.autoLayout.maxWidth": "Max W",
  "editor.autoLayout.minHeight": "Min H",
  "editor.autoLayout.maxHeight": "Max H",
};
