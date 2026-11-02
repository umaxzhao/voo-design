import { documentToSvg } from "../editor/editor_svg.js";

export function resourcePreview(doc, assets = {}) {
  if (!doc?.nodes?.length) return null;
  const svg = documentToSvg(doc, { bitmapOf: id => assets[id] ?? null });
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
}

export async function templateResources() {
  const { COMMUNITY_TEMPLATES } = await import("../components/community_templates_data.js");
  return COMMUNITY_TEMPLATES.filter(item => typeof item.createDoc === "function").map(template => {
    const doc = template.createDoc();
    return { id: template.id, name: template.title, category: template.category,
      preview: resourcePreview(doc), document: doc };
  });
}
