import { describe, expect, it } from "vitest";
import { drawNode } from "../../src/canvas/editor/render_node_dispatch.js";
import { requiresCanvas2dMediaFallback } from "../../src/canvas/editor/skia_scene_adapter.js";
import { createRectNode, createGroupNode } from "../../src/canvas/editor/scene_model.js";
function context() {
 const painted=[], stroked=[], stack=[];
 const ctx={globalAlpha:1,globalCompositeOperation:"source-over",
 save(){stack.push([this.globalAlpha,this.globalCompositeOperation]);},
 restore(){[this.globalAlpha,this.globalCompositeOperation]=stack.pop();},
 beginPath(){},rect(){},roundRect(){},moveTo(){},lineTo(){},arcTo(){},closePath(){},
 translate(){},rotate(){},scale(){},transform(){},setTransform(){},
 fill(){painted.push([this.fillStyle,this.globalAlpha,this.globalCompositeOperation]);},
 fillRect(){this.fill();},stroke(){stroked.push(this.strokeStyle);},strokeRect(){},
 };
 return {ctx,painted,stroked};
}
describe("fill attributes at the renderer boundary",()=>{
 it("routes masks and paint stacks to the compositor that supports them",()=>{
  for(const node of [{maskBase:true},{clipTo:"mask"},{fills:[]},{fillBlendMode:"multiply"}])
   expect(requiresCanvas2dMediaFallback({nodes:[node]})).toBe(true);
 });
 it("paints all visible fills in order with independent opacity and blend",()=>{
  const {ctx,painted}=context();
  drawNode(ctx,{...createRectNode({x:0,y:0,width:100,height:100}),fills:[
   {fill:"#ff0000",opacity:.4,blendMode:"source-over"},
   {fill:"#00ff00",visible:false},
   {fill:"#0000ff",opacity:.7,blendMode:"multiply"},
  ]},()=>null);
  expect(painted.map(p=>[p[0],p[2]])).toEqual([["rgba(255, 0, 0, 0.4)","source-over"],["rgba(0, 0, 255, 0.7)","multiply"]]);
 });
 it("paints a nested frame's own fill instead of treating it as a folder",()=>{
  const {ctx,painted}=context();
  drawNode(ctx,{...createGroupNode({x:0,y:0,width:100,height:100}),isFrame:true,parentId:"outer",fill:"#ab3737"},()=>null);
  expect(painted.map(p=>p[0])).toEqual(["#ab3737"]);
 });
 it("does not draw a hidden fill",()=>{
  const {ctx,painted}=context();
  drawNode(ctx,{...createRectNode({x:0,y:0,width:100,height:100,fill:"#ff0000"}),fillHidden:true},()=>null);
  expect(painted).toEqual([]);
 });
 it("does not draw a hidden stroke",()=>{
  const {ctx,stroked}=context();
  drawNode(ctx,{...createRectNode({x:0,y:0,width:100,height:100,stroke:"#ff0000",strokeWidth:2}),strokeHidden:true},()=>null);
  expect(stroked).toEqual([]);
 });
});
