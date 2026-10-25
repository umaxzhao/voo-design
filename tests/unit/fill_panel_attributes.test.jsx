import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { FillSection } from "../../src/canvas/components/editor_properties/colour_fill_section.jsx";
import { parseHex } from "../../src/canvas/components/editor_properties/colour_swatch.jsx";
const render = (object) => renderToStaticMarkup(<FillSection object={object} edit={()=>{}} editAndCommit={()=>{}} />);
describe("Fill panel paints",()=>{
 it("accepts alpha hex colors without losing their alpha",()=>{
  expect(parseHex("3366ff80")).toBe("#3366ff80");
  expect(render({kind:"rect",fill:"#3366ff80"})).toContain('value="#3366ff80"');
 });
 it("shows opacity and visibility controls for every paint, with blend mode kept out of the row",()=>{
  const html=render({kind:"rect",fill:"#ff0000",maskBase:true,fills:[
   {fill:"#ff0000",opacity:.65,visible:true,blendMode:"source-over"},
   {fill:"linear-gradient(90deg, #000000 0%, #ffffff 100%)",opacity:.3,visible:false,blendMode:"multiply"},
  ]});
  expect(html).not.toContain('aria-label="Fill blend mode"');
  expect(html.match(/aria-label="Fill visible"/g)).toHaveLength(2);
  expect(html).toContain('>65</button>');
  expect(html).toContain('>30</button>');
  expect(html).toContain("Mask · alpha");
 });
});
