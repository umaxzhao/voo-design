// Start npm run dev -- --host 127.0.0.1 --port 5253, then:
// flock /tmp/voo-e2e.lock node tests/e2e/roundtrip.e2e.mjs
import { chromium } from 'playwright';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const phase = process.env.ROUNDTRIP_PHASE || 'after';
const shots = '/workspace/tmp/shots-roundtrip';
const root = new URL('../fixtures/roundtrip/', import.meta.url);
await mkdir(shots,{recursive:true});
const browser = await chromium.launch({args:['--no-sandbox']});
process.once('SIGINT', async () => { await browser.close(); process.exit(130); });
const rows = [];
try {
 let page;
 const freshPage = async () => {
  if (page) await page.context().close();
  page = await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
  page.setDefaultTimeout(90000);
  page.on('pageerror',error=>console.error('PAGE ERROR',error.message));
  page.on('console',message=>{if(message.text().startsWith('ROUNDTRIP WORKER')) console.log(message.text());});
  if (phase === 'before') {
   for (const source of ['src/canvas/store/project_io.js','src/canvas/editor/editor_svg_import.js']) {
    const original=execFileSync('git',['show',`${process.env.ROUNDTRIP_BASELINE_REF || 'origin/main'}:${source}`],{encoding:'utf8'});
    await page.route(`**/${source}*`,route=>route.fulfill({contentType:'application/javascript',body:original}));
   }
  }
  page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{
   const NativeWorker = window.Worker;
   window.Worker = class extends NativeWorker {
    constructor(...args) {
     super(...args);
     this.addEventListener('message',({data})=>{
      if (data?.type) console.log('ROUNDTRIP WORKER', data.type, data.stage || '', data.percent ?? '');
     });
    }
   };
  });
  await page.addInitScript(()=>{localStorage.setItem('ciw.locale',JSON.stringify('en'));window.showSaveFilePicker=undefined;window.showOpenFilePicker=undefined;});
 };
 const start = async () => {await page.goto(process.env.VOO_URL || 'http://127.0.0.1:5253/?voo-test=1',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'New',exact:true}).waitFor();};
 const deadline = promise => { let timer; return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('operation exceeded 120 seconds')),120000);})]).finally(()=>clearTimeout(timer)); };
 const open = async (name,bytes,allowEmpty=false) => {
  console.log('OPEN',name);
  await deadline(page.evaluate(async ({name,bytes})=>{
   const {openVooProject}=await import('/src/canvas/store/project_io.js');
   await openVooProject({fileOrPath:new File([new Uint8Array(bytes)],name)});
  },{name,bytes:Array.from(bytes)}));
  console.log('IMPORTED',name);
  await page.getByTestId('design-editor').waitFor();
  console.log('EDITOR',name);
  await page.waitForFunction(allowEmpty ? ()=>!!window.__vooEditor?.getDocument() : ()=>window.__vooEditor?.getDocument()?.nodes?.length>0);
  await deadline(page.evaluate(()=>document.fonts.ready));
  console.log('READY',name);
  await page.waitForTimeout(500);
 };
 const capture = async (label) => {
  await page.screenshot({path:`${shots}/${label}.png`});
  const value = await page.evaluate(async ()=>{
   const engine=window.__vooEditor;
   const png=await engine.exportFullResPng();
   return {document:engine.serialise(),png};
  });
  await writeFile(`${shots}/${label}.json`,JSON.stringify(value.document,null,2));
  return value;
 };
 const save = async (name) => {
  await page.evaluate(async name=>{const {useDesignStore}=await import('/src/store/design_store.js');useDesignStore.setState({fileName:name,filePath:null,fileHandle:null});},name);
  const download=page.waitForEvent('download');
  await page.locator('.app-title-bar').getByRole('button',{name:'Save',exact:true}).click();
  const file=await download;
  const path=`${shots}/${phase}-${name}`;
  await file.saveAs(path);
  return readFile(path);
 };
 const compare = async (a,b) => {
  const fields=['kind','name','x','y','width','height','fill','fills','text'];
  const normalize=d=>d.nodes.map(n=>Object.fromEntries(fields.filter(k=>n[k]!==undefined).map(k=>[k,n[k]])));
  const tree=JSON.stringify(normalize(a.document))===JSON.stringify(normalize(b.document));
  const pixel=await page.evaluate(async ({a,b})=>{
   const decode=async data=>{const img=await createImageBitmap(await(await fetch(data)).blob());const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);img.close();return {w:c.width,h:c.height,data:ctx.getImageData(0,0,c.width,c.height).data};};
   const x=await decode(a),y=await decode(b);if(x.w!==y.w||x.h!==y.h)return 100;
   let different=0;for(let i=0;i<x.data.length;i+=4){if([0,1,2,3].some(c=>Math.abs(x.data[i+c]-y.data[i+c])>2))different++;}return 100*different/(x.w*x.h);
  },{a:a.png,b:b.png});
  return {tree,pixel};
 };
 for (const name of (await readdir(root)).filter(n=>/\.(fig|svg|psd)$/.test(n) && (!process.env.ROUNDTRIP_FILTER || n.includes(process.env.ROUNDTRIP_FILTER)))) {
  const row={fixture:name};rows.push(row);
  try {
   await freshPage();
   await start();await open(name,await readFile(new URL(name,root)));
   await page.evaluate(()=>{const e=window.__vooEditor;const n=e.addRectAt({x:20,y:120});e.updateNode(n.id,{name:'Roundtrip live edit',width:25,height:18,fill:'#ff6600'});});
   const before=await capture(`${phase}-${name}-open`);row.nodes=before.document.nodes.length;
   const native=await save(`${name}.voo`);
   const exported=await save(name);
   await start();await open(`${name}.voo`,native,true);
   const after=await capture(`${phase}-${name}-native`);row.native=await compare(before,after);row.reopenedNodes=after.document.nodes.length;
   await start();await open(name,exported,true);
   const original=await capture(`${phase}-${name}-original`);row.originalNodes=original.document.nodes.length;
   row.original=await compare(before,original);
  } catch(error) {row.error=error.message;await page.screenshot({path:`${shots}/${phase}-${name}-failure.png`,timeout:15000}).catch(()=>{});}
  console.log(JSON.stringify(row));
 }
} finally {await browser.close();}
await writeFile(`${shots}/${phase}-report.json`,JSON.stringify(rows,null,2));
const table=['| Fixture | Nodes | Native tree | Native pixel Δ % | Original tree | Original pixel Δ % | Error |','|---|---:|---|---:|---|---:|---|',...rows.map(r=>`| ${r.fixture} | ${r.nodes??'-'} → ${r.reopenedNodes??'-'} | ${r.native?.tree??'-'} | ${r.native?.pixel??'-'} | ${r.original?.tree??'-'} | ${r.original?.pixel??'-'} | ${(r.error||'').replaceAll('\n',' ').replaceAll('|','/')} |`)];
await writeFile(`/workspace/tmp/roundtrip-${phase}.md`,table.join('\n')+'\n');
if(phase==='after')assert.ok(rows.length > 0 && rows.every(r=>!r.error&&r.native?.tree&&r.native.pixel===0),'All native round trips must preserve nodes and pixels; see report');
