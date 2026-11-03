import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export function helpers(page,root){
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const activate=async name=>{await page.getByTestId('editor-marquee-menu-trigger').click();await page.getByTestId('editor-marquee-menu-list').getByRole('menuitem',{name,exact:true}).click();await settle();};
 const field=async(name,value)=>{const el=page.getByTestId('editor-properties-panel').getByRole('textbox',{name,exact:true});await el.fill(String(value));await el.press('Enter');await el.press('Tab');await settle();};
 const client=point=>page.evaluate(p=>{const r=document.querySelector('[data-editor-artboard]').getBoundingClientRect(),d=window.__vooEditor.getDocument();return{x:r.left+p.x*r.width/d.width,y:r.top+p.y*r.height/d.height};},point);
 const click=async p=>{const at=await client(p);await page.mouse.click(at.x,at.y);await settle();};
 const drag=async(a,b)=>{const from=await client(a),to=await client(b);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();await settle();};
 const seed=async kind=>{
  await page.mouse.up();await page.keyboard.press('Escape');
  const node=await page.evaluate(async kind=>{
   const e=window.__vooEditor;e.cancelSelectionTransform();e.endMaskEdit();e.cancelLasso?.();e.setTool('select');e.selectExactly([]);
   e.setDoc({...e.getDocument(),width:600,height:400,isCanvasRoot:false,backgroundColor:'#ffffff',nodes:[]});
   const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d');
   if(kind==='magnetic'){ctx.fillStyle='rgb(120,120,120)';ctx.fillRect(0,0,128,128);ctx.fillStyle='rgb(128,128,128)';ctx.fillRect(32,24,64,80);}
   else{ctx.fillStyle='rgb(20,40,180)';ctx.fillRect(0,0,128,128);ctx.fillStyle='rgb(100,100,100)';ctx.fillRect(8,16,24,80);ctx.fillRect(80,16,24,80);ctx.fillStyle='rgb(110,110,110)';ctx.fillRect(32,16,16,80);}
   const node=await e.insertImage(c.toDataURL(),{x:220,y:150});e.selectExactly([node.id]);
   const{useDesignStore}=await import('/src/store/design_store.js');useDesignStore.setState({editorCamera:{zoom:1,panX:300,panY:100}});
   return{id:node.id,x:node.x,y:node.y,width:node.width,height:node.height};
  },kind);await settle();
  // Make layer selection real before any tool measurement; fixture API only seeds pixels/document.
  await click({x:150,y:100});await click({x:node.x+20,y:node.y+50});
  return node;
 };
 const snapshot=async(id,name)=>{
  await settle();const data=await page.evaluate(async id=>{
   const e=window.__vooEditor;await e.flushMasks();await e.flushPaints();const n=e.getNode(id),selection=e.getPixelSelection();
   const out=e.exportSelectionPng([id]),img=new Image();img.src=typeof out==='string'?out:out.dataUrl;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const bytes=ctx.getImageData(0,0,img.width,img.height).data;
   let softAlpha=0,transparent=0;for(let i=3;i<bytes.length;i+=4){if(bytes[i]>0&&bytes[i]<255)softAlpha++;if(bytes[i]===0)transparent++;}
   const {contoursToMask}=await import('/src/canvas/editor/pixel_selection_contour.js');
   const alpha=selection?Array.from(contoursToMask(selection.contours,n,128,128),v=>Math.round(v*255)):Array(128*128).fill(0);
   const mask=document.createElement('canvas');mask.width=128;mask.height=128;const mc=mask.getContext('2d'),mi=mc.createImageData(128,128);
   alpha.forEach((v,i)=>{mi.data[i*4]=mi.data[i*4+1]=mi.data[i*4+2]=255;mi.data[i*4+3]=v;});mc.putImageData(mi,0,0);
   return{geometry:{x:n.x,y:n.y,width:n.width,height:n.height,rotation:n.rotation??0},imageId:n.imageId,maskId:n.maskId??null,selection,selectedIds:e.getSelectedIds(),maskEdit:e.getMaskEdit?.(),alpha,sourceBytes:Array.from(bytes),softAlpha,transparent,sourcePng:canvas.toDataURL(),maskPng:mask.toDataURL()};
  },id);
  for(const [key,suffix] of [['sourcePng','source'],['maskPng','selection-mask']]){await writeFile(root+`pixels/${name}-${suffix}.png`,Buffer.from(data[key].split(',')[1],'base64'));delete data[key];}
  data.sourceSha256=createHash('sha256').update(Buffer.from(data.sourceBytes)).digest('hex');delete data.sourceBytes;
  data.selectionMaskSha256=createHash('sha256').update(Buffer.from(data.alpha)).digest('hex');
  data.selectedPixelCount=data.alpha.filter(v=>v>127).length;
  await writeFile(root+`pixels/${name}.json`,JSON.stringify(data,null,2));await page.screenshot({path:root+`screenshots/${name}.png`});return data;
 };
 const history=async(id,name,before,after,assert)=>{
  const states={};await page.getByTestId('editor-marquee-menu-trigger').focus();await page.keyboard.press('ControlOrMeta+z');states.undo=await snapshot(id,`${name}-undo`);
  await page.keyboard.press('ControlOrMeta+Shift+z');states.redo=await snapshot(id,`${name}-redo`);
  assert.deepEqual(states.undo.geometry,before.geometry,'Undo geometry');assert.equal(states.undo.sourceSha256,before.sourceSha256,'Undo actual exported pixels');
  assert.equal(states.undo.selectionMaskSha256,before.selectionMaskSha256,'Undo selection pixels');assert.deepEqual(states.undo.selection,before.selection,'Undo selection geometry');
  assert.deepEqual(states.redo.geometry,after.geometry,'Redo geometry');assert.equal(states.redo.sourceSha256,after.sourceSha256,'Redo actual exported pixels');
  assert.equal(states.redo.selectionMaskSha256,after.selectionMaskSha256,'Redo selection pixels');assert.deepEqual(states.redo.selection,after.selection,'Redo selection geometry');return states;
 };
 return{settle,activate,field,client,click,drag,seed,snapshot,history};
}
