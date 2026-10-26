export function localizedTemplateValue(value, locale) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return [value[locale], value.en, value.zh].find(item => typeof item === "string" && item.length) || "";
}

/** Local factories and downloaded documents must open through the same flow. */
export function prepareCommunityTemplate(template, locale) {
  if (typeof template.createDoc === "function") return { type: "design", template };
  const kind = template.kind || template.type || (template.document ? "design" : "prompt");
  if (kind !== "design") {
    const prompt = localizedTemplateValue(template.body, locale);
    if (!prompt.trim()) throw new Error("Template prompt is empty");
    return { type: "prompt", prompt };
  }
  const envelope = typeof template.document === "string" ? JSON.parse(template.document) : template.document;
  const document = envelope?.document ?? envelope;
  if (!document || typeof document !== "object" ||
      !Array.isArray(document.nodes) && !Array.isArray(document.pages)) throw new Error("Template document is invalid");
  return { type: "design", template: {
    title: localizedTemplateValue(template.title, locale) || template.id,
    category: template.categories?.[0] || template.category || "web",
    assets: structuredClone(envelope?.assets ?? template.assets ?? {}),
    createDoc: () => structuredClone(document),
  } };
}
