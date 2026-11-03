import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {withEditorBrowser} from './editor-browser-fixture.mjs';
const out=(process.env.VOO_FRAME_EVIDENCE || join(tmpdir(),'voo-editor-frame-pixels'))+'/';
await mkdir(out,{recursive:true});
const rows=[];
for(const dpr of [1,2]) await withEditorBrowser(async({page})=>{
  for(const width of [1440,1100,768,390,320]) for(const theme of ['dark','light']){
    await page.setViewportSize({width,height:900});
    await page.evaluate(async(theme)=>{const {setEditorTheme}=await import('/src/canvas/use_editor_theme.js');setEditorTheme(theme)},theme);
    await page.waitForFunction((color)=>getComputedStyle(document.querySelector('.editor-shell')).borderLeftColor===color,
      theme==='dark'?'rgb(178, 255, 214)':'rgb(167, 255, 212)');
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const metrics=await page.evaluate(()=>{
      const read=s=>{const el=document.querySelector(s),cs=getComputedStyle(el),r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bg:cs.backgroundColor,padding:[cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft],radii:[cs.borderTopLeftRadius,cs.borderTopRightRadius,cs.borderBottomRightRadius,cs.borderBottomLeftRadius],borders:[cs.borderTopWidth,cs.borderRightWidth,cs.borderBottomWidth,cs.borderLeftWidth]}};
      return {dpr:devicePixelRatio,root:read('.app-root-frame'),shell:read('.editor-shell'),layout:read('[data-testid="editor-workspace-layout"]'),titlebar:read('.app-title-bar')};
    });
    const name=`${theme}-${width}-dpr${dpr}`;
    const png=await page.screenshot({path:`${out}${name}.png`});
    const pixels=await page.evaluate(async({png,dpr,w,h,sy})=>{
      const img=new Image();img.src=`data:image/png;base64,${png}`;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      const px=(x,y)=>Array.from(ctx.getImageData(Math.floor(x*dpr),Math.floor(y*dpr),1,1).data);
      return {image:[img.width,img.height],leftEdge:px(0,h/2),rightEdge:px(w-1,h/2),bottomEdge:px(w/2,h-1),topLeftViewport:px(0,0),topRightViewport:px(w-1,0),bottomLeftViewport:px(0,h-1),bottomRightViewport:px(w-1,h-1),topLeftShellGap:px(4,sy+1),topRightShellGap:px(w-5,sy+1)};
    },{png:png.toString('base64'),dpr,w:width,h:900,sy:metrics.shell.y});
    const row={name,...metrics,pixels};
    rows.push(row);
    await writeFile(`${out}measurements.json`,JSON.stringify(rows,null,2));
    assert.equal(metrics.dpr,dpr,`${name}: actual browser DPR`);
    assert.deepEqual(pixels.image,[width*dpr,900*dpr],`${name}: screenshot physical size`);
    const mint=theme==='dark'?[178,255,214,255]:[167,255,212,255];
    for(const edge of ['leftEdge','rightEdge','bottomEdge','topLeftShellGap','topRightShellGap']){
      assert.deepEqual(pixels[edge],mint,`${name}: ${edge} must be mint`);
    }
    assert.deepEqual(pixels.topLeftViewport,[178,255,214,255],`${name}: status gradient green end covers top-left`);
    assert.deepEqual(pixels.topRightViewport,[0,0,0,255],`${name}: status gradient black end covers top-right`);
    for(const corner of ['bottomLeftViewport','bottomRightViewport']){
      assert.ok(pixels[corner].every((v,i)=>Math.abs(v-mint[i])<=8),`${name}: ${corner} must not expose black backing`);
    }
    assert.equal(metrics.shell.x,width-metrics.shell.x-metrics.shell.width,`${name}: symmetric frame gutters`);
    assert.equal(metrics.shell.borders[1],metrics.shell.borders[3],`${name}: symmetric frame borders`);
    assert.equal(metrics.root.radii[0],metrics.shell.radii[3],`${name}: visible top/bottom left radius`);
    assert.equal(metrics.root.radii[1],metrics.shell.radii[2],`${name}: visible top/bottom right radius`);
    assert.equal(metrics.titlebar.x,0,`${name}: status bar reaches viewport left`);
    assert.equal(metrics.titlebar.x+metrics.titlebar.width,width,`${name}: status bar reaches viewport right`);
    console.log(`${name}: pixel, DPI, radius and symmetry assertions passed`);
  }
  // The normal home button returns to Welcome; this repair must not recolour it.
  await page.setViewportSize({width:1440,height:900});
  await page.getByTitle('Home / Welcome',{exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.app-root-frame').hasAttribute('data-editor-page'));
  const welcome=await page.locator('.app-root-frame').evaluate(el=>getComputedStyle(el).backgroundImage);
  assert.match(welcome,/linear-gradient/, 'Welcome keeps its existing gradient');
},{deviceScaleFactor:dpr});
await writeFile(`${out}measurements.json`,JSON.stringify(rows,null,2));
