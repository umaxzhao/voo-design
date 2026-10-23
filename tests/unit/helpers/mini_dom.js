/**
 * Just enough DOM for the ChatGPT / Gemini adapter tests.
 * Supports the selector forms those adapters actually use.
 */

function splitCommas(selector) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (const char of selector) {
    if (char === "[") depth += 1;
    else if (char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function tokenize(selector) {
  const tokens = [];
  let buf = "";
  let depth = 0;
  const pushCompound = () => {
    if (buf.trim()) tokens.push({ compound: buf.trim() });
    buf = "";
  };
  for (const char of selector) {
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
    if (depth === 0 && char === ">") {
      pushCompound();
      tokens.push({ combinator: ">" });
      continue;
    }
    if (depth === 0 && /\s/.test(char)) {
      if (buf.trim()) {
        pushCompound();
        tokens.push({ combinator: " " });
      }
      continue;
    }
    buf += char;
  }
  pushCompound();
  const cleaned = [];
  for (const token of tokens) {
    if (token.combinator && (cleaned.length === 0 || cleaned.at(-1)?.combinator)) continue;
    cleaned.push(token);
  }
  if (cleaned.at(-1)?.combinator) cleaned.pop();
  return cleaned;
}

function classList(node) {
  return String(node.className || node.attrs?.class || "")
    .split(/\s+/)
    .filter(Boolean);
}

function attrValue(node, name) {
  if (name === "class") return node.className || "";
  if (name === "id") return node.id || "";
  const value = node.attrs?.[name];
  return value == null ? "" : String(value);
}

function matchesCompound(node, compound) {
  if (!node || node.nodeType === 9) return false;
  let rest = compound.trim();
  const tag = /^([a-zA-Z*][\w-]*)/.exec(rest);
  if (tag && tag[1] !== "*") {
    if (node.tagName.toLowerCase() !== tag[1].toLowerCase()) return false;
    rest = rest.slice(tag[1].length);
  } else if (tag && tag[1] === "*") {
    rest = rest.slice(1);
  }
  while (rest.length) {
    if (rest[0] === "#") {
      const id = /^#([^\s#[\].]+)/.exec(rest);
      if (!id || node.id !== id[1]) return false;
      rest = rest.slice(id[0].length);
      continue;
    }
    if (rest[0] === ".") {
      const cls = /^\.([^\s#[\].]+)/.exec(rest);
      if (!cls || !classList(node).includes(cls[1])) return false;
      rest = rest.slice(cls[0].length);
      continue;
    }
    if (rest[0] === "[") {
      const attr = /^\[([^\]=~|^$*\s]+)(?:([*^$~|]?=)\s*"([^"]*)"(\s+i)?)?\]/.exec(rest);
      if (!attr) return false;
      const [, name, operator, expected, flag] = attr;
      const actual = attrValue(node, name);
      const fold = (value) => (flag ? value.toLowerCase() : value);
      if (!operator) {
        if (!actual) return false;
      } else if (operator === "=") {
        if (fold(actual) !== fold(expected)) return false;
      } else if (operator === "*=") {
        if (!fold(actual).includes(fold(expected))) return false;
      } else if (operator === "^=") {
        if (!fold(actual).startsWith(fold(expected))) return false;
      } else if (operator === "$=") {
        if (!fold(actual).endsWith(fold(expected))) return false;
      } else return false;
      rest = rest.slice(attr[0].length);
      continue;
    }
    return false;
  }
  return true;
}

function descendants(node) {
  const found = [];
  const walk = (current) => {
    for (const child of current.children || []) {
      found.push(child);
      walk(child);
    }
  };
  walk(node);
  return found;
}

function queryComplex(scope, selector) {
  const tokens = tokenize(selector);
  if (tokens.length === 0 || !tokens[0].compound) return [];
  let matched = descendants(scope).filter((node) => matchesCompound(node, tokens[0].compound));
  for (let index = 1; index < tokens.length; index += 2) {
    const combinator = tokens[index].combinator;
    const compound = tokens[index + 1]?.compound;
    if (!compound) break;
    const next = [];
    for (const node of matched) {
      const pool = combinator === ">" ? node.children || [] : descendants(node);
      for (const candidate of pool) {
        if (matchesCompound(candidate, compound)) next.push(candidate);
      }
    }
    matched = next;
  }
  return matched;
}

function queryAll(scope, selector) {
  const seen = new Set();
  const found = [];
  for (const alternative of splitCommas(selector)) {
    for (const node of queryComplex(scope, alternative)) {
      if (seen.has(node)) continue;
      seen.add(node);
      found.push(node);
    }
  }
  return found;
}

export function selectorMatches(node, selector) {
  return splitCommas(selector).some((alternative) => {
    const tokens = tokenize(alternative);
    return tokens.length === 1 && tokens[0].compound && matchesCompound(node, tokens[0].compound);
  });
}

export function el(tag, props = {}, children = []) {
  const attrs = {};
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    children: [],
    parentElement: null,
    attrs,
    className: props.class || "",
    id: props.id || "",
    naturalWidth: props.naturalWidth || 0,
    naturalHeight: props.naturalHeight || 0,
    src: props.src || "",
    currentSrc: props.currentSrc || props.src || "",
    disabled: Boolean(props.disabled),
    textContent: props.text ?? "",
    value: props.value ?? "",
    clicked: 0,
    hidden: Boolean(props.hidden),
  };
  if (props.class) attrs.class = props.class;
  if (props.id) attrs.id = props.id;
  for (const [key, value] of Object.entries(props)) {
    if (
      ["class", "id", "naturalWidth", "naturalHeight", "src", "currentSrc", "disabled", "text", "value", "hidden"].includes(
        key,
      )
    ) {
      continue;
    }
    attrs[key] = value;
  }
  node.getClientRects = () => (node.hidden ? [] : [{ width: 12, height: 12 }]);
  Object.defineProperty(node, "offsetParent", { get: () => (node.hidden ? null : {}) });
  node.getAttribute = (name) => {
    if (name === "class") return node.className || null;
    if (name === "id") return node.id || null;
    const value = attrs[name];
    return value == null ? null : String(value);
  };
  node.click = () => {
    node.clicked += 1;
  };
  node.dispatchEvent = () => {};
  for (const child of children) {
    child.parentElement = node;
    node.children.push(child);
  }
  return node;
}

export function mountDocument(children) {
  const doc = { nodeType: 9, children: [...children], parentElement: null };
  for (const child of doc.children) child.parentElement = doc;
  const index = new Map();
  const visit = (node, order) => {
    index.set(node, order.count);
    order.count += 1;
    for (const child of node.children || []) visit(child, order);
  };
  visit(doc, { count: 0 });
  const decorate = (node) => {
    node.querySelectorAll = (selector) => queryAll(node, selector);
    node.querySelector = (selector) => queryAll(node, selector)[0] ?? null;
    if (node.nodeType !== 9) {
      node.compareDocumentPosition = (other) => {
        const left = index.get(node);
        const right = index.get(other);
        if (left < right) return 4;
        if (left > right) return 2;
        return 0;
      };
      node.closest = (selector) => {
        let current = node;
        while (current && current.nodeType !== 9) {
          if (selectorMatches(current, selector)) return current;
          current = current.parentElement;
        }
        return null;
      };
    }
    for (const child of node.children || []) decorate(child);
  };
  decorate(doc);
  return doc;
}

export function installDocument(children, location = {}) {
  const document = mountDocument(children);
  globalThis.document = document;
  globalThis.window = { location: { pathname: "/", hostname: "chatgpt.com", ...location } };
  globalThis.Node = { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 };
  return document;
}
