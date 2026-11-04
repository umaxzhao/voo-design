/** Decorative UI frames are prohibited; artwork and manipulation guides are explicit. */
const GUIDE_ROLES = new Set([
  "artwork",
  "canvas-selection",
  "color-handle",
  "paint-preview",
  "progress",
  "hierarchy",
]);

function decorativeBorderTokens(text) {
  return text.split(/\s+/).filter((token) => {
    if (/(?:^|:)focus-visible:/.test(token)) return false;
    const base = token.slice(token.lastIndexOf(":") + 1).replace(/^!/, "");
    if (
      /^(?:border(?:-[trblxyse])?-(?:0|none)|border-none|border-0|ring-0|outline-none|outline-hidden)$/.test(
        base,
      )
    )
      return false;
    return (
      /^(?:border(?:-[^\s]+)?|ring(?:-[^\s]+)?|divide-[^\s]+|outline(?:-(?:\d+|solid|dashed|double))?)$/.test(
        base,
      ) || /^shadow-\[inset_0_0_0_/.test(base)
    );
  });
}

function hasGuideOwner(node) {
  for (let current = node; current; current = current.parent) {
    if (current.type !== "JSXOpeningElement") continue;
    // A local guide must never exempt a whole interface container.
    if (
      ["aside", "nav", "main", "header", "section"].includes(
        current.name?.name,
      ) ||
      current.attributes.some(
        (attribute) =>
          attribute.name?.name === "role" &&
          [
            "dialog",
            "menu",
            "listbox",
            "toolbar",
            "tabpanel",
            "navigation",
          ].includes(attribute.value?.value),
      )
    )
      return false;
    return current.attributes.some(
      (attribute) =>
        attribute.type === "JSXAttribute" &&
        attribute.name?.name === "data-ui-guide" &&
        GUIDE_ROLES.has(attribute.value?.value),
    );
  }
  return false;
}

function isUiSource(filename) {
  return /(?:^|\/)src\/(?:canvas\/(?:components|color_picker)\/|shared\/[^/]+\.jsx$|(?:app_title_bar|App)\.jsx$)/.test(
    filename.replace(/\\/g, "/"),
  );
}

function checkClassText(context, node, text) {
  if (!isUiSource(context.getFilename()) || hasGuideOwner(node)) return;
  for (const token of decorativeBorderTokens(text)) {
    context.report({ node, messageId: "borderlessUi", data: { token } });
  }
}

function checkInlineStyle(context, node) {
  if (!isUiSource(context.getFilename()) || hasGuideOwner(node)) return;
  const name = node.key?.name ?? node.key?.value;
  if (
    !/^(?:boxShadow|outline|border(?:Top|Right|Bottom|Left)?(?:Width|Color|Style)?)$/.test(
      name ?? "",
    )
  )
    return;
  let owner = node.parent;
  while (owner && owner.type !== "JSXAttribute") owner = owner.parent;
  if (owner?.name?.name !== "style") return;
  const values = [];
  const visit = (value) => {
    if (!value) return;
    if (value.type === "Literal" && typeof value.value === "string")
      values.push(value.value);
    if (value.type === "ConditionalExpression") {
      visit(value.consequent);
      visit(value.alternate);
    }
  };
  visit(node.value);
  if (
    values.some((value) =>
      name === "boxShadow"
        ? /\b0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+[1-9]/.test(value)
        : !/^(?:0(?:px)?|none|transparent)$/.test(value),
    )
  ) {
    context.report({ node, messageId: "borderlessUi", data: { token: name } });
  }
}

function isGuideSelector(selector) {
  return selector
    .split(",")
    .every((part) =>
      /(?:\.react-flow__handle|\.ciw-port|\.is-drop-target|\.node-card\.is-selected|:focus-visible|scrollbar)/.test(
        part,
      ),
    );
}

module.exports = {
  GUIDE_ROLES,
  decorativeBorderTokens,
  hasGuideOwner,
  isUiSource,
  checkClassText,
  checkInlineStyle,
  isGuideSelector,
};
