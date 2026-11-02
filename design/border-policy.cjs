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

/** Element tags and ARIA roles that are controls: a divider never lives on them. */
const CONTROL_TAGS = new Set(["button", "input", "select", "textarea", "a"]);
const CONTROL_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "dialog",
  "listbox",
  "menu",
  "menuitem",
  "option",
  "radio",
  "slider",
  "switch",
  "tab",
  "textbox",
]);

/**
 * The element whose attributes directly own this string (the JSX opening tag
 * of a className). Nested descendants are deliberately not searched upward.
 */
function ownerOpeningElement(node) {
  for (let current = node; current; current = current.parent) {
    if (current.type === "JSXOpeningElement") return current;
  }
  return null;
}

function attributeValue(opening, name) {
  const attribute = opening.attributes.find(
    (item) => item.type === "JSXAttribute" && item.name?.name === name,
  );
  return attribute?.value?.value;
}

/**
 * A structural divider owner: an element marked `data-ui-structure="divider"`
 * that is not itself a control. Frames are CSS-owned (design/structural-lines.cjs)
 * and never reach this check.
 */
function isDividerOwner(node) {
  const opening = ownerOpeningElement(node);
  if (!opening || attributeValue(opening, "data-ui-structure") !== "divider")
    return false;
  if (CONTROL_TAGS.has(opening.name?.name)) return false;
  return !CONTROL_ROLES.has(attributeValue(opening, "role"));
}

/**
 * A single-side hairline, or a pair of sides, in neutral translucent white.
 * Full perimeters (`border`, `border-2`, `ring-*`, inset shadows) never qualify.
 */
function isDividerToken(token) {
  const base = token.slice(token.lastIndexOf(":") + 1).replace(/^!/, "");
  return (
    /^border-[tblr]$/.test(base) ||
    /^border-white\/(?:\d+|\[0\.\d+\])$/.test(base)
  );
}

function checkClassText(context, node, text) {
  if (!isUiSource(context.getFilename()) || hasGuideOwner(node)) return;
  const divider = isDividerOwner(node);
  for (const token of decorativeBorderTokens(text)) {
    if (divider && isDividerToken(token)) continue;
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
  isDividerToken,
  isGuideSelector,
};
