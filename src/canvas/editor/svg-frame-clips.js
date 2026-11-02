import { resolveCornerRadii } from "./scene_model_core.js";
import { roundedRectPathData } from "./editor_svg_image.js";
import { svgNodeTransform } from "./editor_svg_xml.js";
import { createFrameClipContext } from "./frame-clip-context.js";

/** Each Frame clips only its descendants; its own outside stroke stays visible. */
export function createSvgFrameClips(nodes, defs) {
  const { framesOf } = createFrameClipContext(nodes);
  const references = new Map();
  const referenceOf = (frame) => {
    if (references.has(frame)) return references.get(frame);
    const id = `frame-clip-${references.size}-${defs.length}`;
    const radii = resolveCornerRadii(frame.cornerRadius, frame.width, frame.height);
    const path = roundedRectPathData(frame.x, frame.y, frame.width, frame.height, radii);
    defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${path}" ${svgNodeTransform(frame)}/></clipPath>`);
    references.set(frame, id);
    return id;
  };
  return {
    wrap(node, markup) {
      if (!markup.length) return markup;
      let content = markup.join("");
      for (const frame of framesOf(node)) content = `<g clip-path="url(#${referenceOf(frame)})">${content}</g>`;
      return [content];
    },
    page(doc, page, markup) {
      if (doc.isCanvasRoot || !doc.cornerRadius) return markup;
      const id = referenceOf({ ...page, cornerRadius: doc.cornerRadius });
      return [`<g clip-path="url(#${id})">${markup.join("")}</g>`];
    },
  };
}
