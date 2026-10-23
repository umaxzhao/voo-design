/** Native color inputs require six-digit hex; keep other CSS colors in the text field. */
export function colorPickerValue(value) {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  if (/^#[\da-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map(c => c + c).join('');
  return '#000000';
}

/** Preserve empty drafts so clearing a number cannot silently save a zero. */
export function numberDraft(value) {
  return value.trim() === '' ? '' : Number(value);
}

export function updateTokenPath(tokens, path, value) {
  const copy = structuredClone(tokens);
  let target = copy;
  for (const key of path.slice(0, -1)) target = target[key];
  target[path.at(-1)] = value;
  return copy;
}
