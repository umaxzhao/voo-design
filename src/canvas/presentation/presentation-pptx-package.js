import {
  COLOR_MAP,
  GROUP_SHAPE,
  PRESENTATION_NAMESPACES,
  XML_HEADER,
  relationships,
  themeXml,
  xmlText,
} from "./presentation-pptx-xml.js";

const EMU_PER_INCH = 914400;
const MAX_SLIDE_EDGE = 13.333 * EMU_PER_INCH;
const TYPE_PREFIX =
  "application/vnd.openxmlformats-officedocument.presentationml.";

export function slideSize(width, height) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new TypeError("Presentation dimensions must be positive numbers");
  }
  const ratio = width / height;
  if (ratio < 1 / 56 || ratio > 56)
    throw new RangeError("Presentation aspect ratio is outside PPTX limits");
  const scale = MAX_SLIDE_EDGE / Math.max(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale,
  };
}

export function baseEntries(deck, size) {
  const slideIds = deck.pages
    .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${4 + index}"/>`)
    .join("");
  const presentation = `${XML_HEADER}<p:presentation ${PRESENTATION_NAMESPACES}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${size.width}" cy="${size.height}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`;
  const master = `${XML_HEADER}<p:sldMaster ${PRESENTATION_NAMESPACES}><p:cSld><p:spTree>${GROUP_SHAPE}</p:spTree></p:cSld>${COLOR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
  const layout = `${XML_HEADER}<p:sldLayout ${PRESENTATION_NAMESPACES} type="blank" preserve="1"><p:cSld><p:spTree>${GROUP_SHAPE}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const notesMaster = `${XML_HEADER}<p:notesMaster ${PRESENTATION_NAMESPACES}><p:cSld><p:spTree>${GROUP_SHAPE}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="685800"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4114800"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200"/></a:pPr><a:endParaRPr/></a:p></p:txBody></p:sp></p:spTree></p:cSld>${COLOR_MAP}<p:notesStyle/></p:notesMaster>`;
  return [
    [
      "_rels/.rels",
      `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    ],
    [
      "docProps/core.xml",
      `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlText(deck.title ?? "")}</dc:title></cp:coreProperties>`,
    ],
    [
      "docProps/app.xml",
      `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>VOO</Application><Slides>${deck.pages.length}</Slides><Notes>${deck.pages.length}</Notes></Properties>`,
    ],
    ["ppt/presentation.xml", presentation],
    [
      "ppt/_rels/presentation.xml.rels",
      relationships([
        ["rId1", "slideMaster", "slideMasters/slideMaster1.xml"],
        ["rId2", "notesMaster", "notesMasters/notesMaster1.xml"],
        ["rId3", "presProps", "presProps.xml"],
        ...deck.pages.map((_, index) => [
          `rId${4 + index}`,
          "slide",
          `slides/slide${index + 1}.xml`,
        ]),
      ]),
    ],
    [
      "ppt/presProps.xml",
      `${XML_HEADER}<p:presentationPr ${PRESENTATION_NAMESPACES}/>`,
    ],
    ["ppt/slideMasters/slideMaster1.xml", master],
    [
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      relationships([
        ["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"],
        ["rId2", "theme", "../theme/theme1.xml"],
      ]),
    ],
    ["ppt/slideLayouts/slideLayout1.xml", layout],
    [
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      relationships([
        ["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"],
      ]),
    ],
    ["ppt/notesMasters/notesMaster1.xml", notesMaster],
    [
      "ppt/notesMasters/_rels/notesMaster1.xml.rels",
      relationships([["rId1", "theme", "../theme/theme1.xml"]]),
    ],
    ["ppt/theme/theme1.xml", themeXml(deck)],
  ];
}

export function contentTypes(count) {
  const parts = [
    ["/ppt/presentation.xml", `${TYPE_PREFIX}presentation.main+xml`],
    ["/ppt/presProps.xml", `${TYPE_PREFIX}presProps+xml`],
    ["/ppt/slideMasters/slideMaster1.xml", `${TYPE_PREFIX}slideMaster+xml`],
    ["/ppt/slideLayouts/slideLayout1.xml", `${TYPE_PREFIX}slideLayout+xml`],
    ["/ppt/notesMasters/notesMaster1.xml", `${TYPE_PREFIX}notesMaster+xml`],
    [
      "/ppt/theme/theme1.xml",
      "application/vnd.openxmlformats-officedocument.theme+xml",
    ],
    [
      "/docProps/core.xml",
      "application/vnd.openxmlformats-package.core-properties+xml",
    ],
    [
      "/docProps/app.xml",
      "application/vnd.openxmlformats-officedocument.extended-properties+xml",
    ],
  ];
  for (let index = 1; index <= count; index += 1) {
    parts.push([`/ppt/slides/slide${index}.xml`, `${TYPE_PREFIX}slide+xml`]);
    parts.push([
      `/ppt/notesSlides/notesSlide${index}.xml`,
      `${TYPE_PREFIX}notesSlide+xml`,
    ]);
  }
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>${parts.map(([path, type]) => `<Override PartName="${path}" ContentType="${type}"/>`).join("")}</Types>`;
}
