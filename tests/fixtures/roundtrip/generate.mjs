import { writeFile } from 'node:fs/promises';
import { writePsd } from 'ag-psd';
import { serializeFigFile } from '../../../src/canvas/figma/fig-file.js';
import { loadFigmaSchema } from '../../../src/canvas/figma/figma-schema.js';
const schema = await loadFigmaSchema();
const vectorBytes = [];
const float = new DataView(new ArrayBuffer(4));
for (const [op,...values] of [[1,0,0],[2,30,0],[2,15,25],[0]]) {vectorBytes.push(op);for(const value of values){float.setFloat32(0,value,true);vectorBytes.push(...new Uint8Array(float.buffer));}}
const guid = localID => ({ sessionID: 0, localID });
for (let i = 1; i <= 3; i++) {
  const change = (id, parent, type, name, extra = {}) => ({guid:guid(id), ...(parent == null ? {} : {parentIndex:{guid:guid(parent),position:String.fromCharCode(33+id)}}),type,name,...extra});
  const shape = (x,y,w,h) => ({transform:{m00:1,m01:0,m02:x,m10:0,m11:1,m12:y},size:{x:w,y:h},fillPaints:[{type:'SOLID',color:{r:.2*i,g:.4,b:.8,a:1},opacity:1,visible:true}]});
  await writeFile(new URL(`layout-${i}.fig`,import.meta.url), await serializeFigFile({version:106,schema,message:{nodeChanges:[change(0,null,'DOCUMENT','Sample'),change(1,0,'CANVAS','Page'),change(2,1,'FRAME','Card',shape(0,0,320,200)),change(3,2,'GROUP','Content',shape(10,10,200,100)),change(4,3,'RECTANGLE','Accent',shape(10,10,80+i*10,40)),change(5,3,'ELLIPSE','Badge',shape(120,20,40,40)),change(6,2,'TEXT','Heading',{...shape(20,140,200,30),fontSize:24,textData:{characters:`Design ${i}`}}),change(7,2,'VECTOR','Triangle',{...shape(240,140,30,25),fillGeometry:[{windingRule:'NONZERO',commandsBlob:0}]})],blobs:[{bytes:new Uint8Array(vectorBytes)}]}}));
  const pixels = (w,h,color) => ({width:w,height:h,data:new Uint8ClampedArray(Array.from({length:w*h},()=>color).flat())});
  await writeFile(new URL(`poster-${i}.psd`,import.meta.url),new Uint8Array(writePsd({width:160,height:100,children:[{name:'Artwork',opened:true,children:[{name:'Accent',left:10,top:10,imageData:pixels(40,30,[40*i,100,200,255])}]},{name:'Caption',left:20,top:60,text:{text:`Poster ${i}`,style:{font:{name:'ArialMT'},fontSize:14}},imageData:pixels(60,16,[80,80,80,255])},{name:'Masked',left:110,top:20,imageData:pixels(20,20,[220,100,60,255]),mask:{top:20,left:110,imageData:pixels(20,20,[255,255,255,255])}}]},{generateThumbnail:false})));
  await writeFile(new URL(`graphic-${i}.svg`,import.meta.url),`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><defs><linearGradient id="l"><stop stop-color="#3478ed"/><stop offset="1" stop-color="#e59bd9"/></linearGradient><radialGradient id="r"><stop stop-color="white"/><stop offset="1" stop-color="#2966bb"/></radialGradient><clipPath id="c"><rect width="280" height="160" rx="20"/></clipPath><mask id="m"><rect width="320" height="200" fill="white"/><circle cx="250" cy="50" r="12" fill="black"/></mask></defs><g transform="translate(10 10)" clip-path="url(#c)"><rect width="280" height="160" fill="url(#l)" mask="url(#m)"/><circle cx="220" cy="85" r="40" fill="url(#r)"/><text x="20" y="60" font-size="24">Design ${i}</text></g></svg>`);
}
