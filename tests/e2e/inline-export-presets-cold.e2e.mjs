import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {withEditorBrowser} from './editor-browser-fixture.mjs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {settlePanels} from './ui-responsive-editor-helpers.mjs';
const out=(process.env.T02_EVIDENCE || join(tmpdir(),'voo-inline-export-cold'))+'/';
await mkdir(out,{recursive:true});
let archive,expected;
await withEditorBrowser(async({page})=>{
  await page.evaluate(async()=>{
    const {createRectNode}=await import('/src/canvas/editor/scene_model.js');
    const e=window.__vooEditor;
    e.setDoc({...e.getDocument(),nodes:[{...createRectNode({x:100,y:100,width:120,height:80,fill:'#ff0000'}),id:'preset-target',name:'PresetTarget'}]});
    e.selectExactly(['preset-target']);
  });
  await settlePanels(page);
  const panel=page.getByTestId('editor-properties-panel');
  const add=panel.getByRole('button',{name:'Add export settings',exact:true});
  await add.click();await add.click();await settlePanels(page);
  const trace=async(label)=>console.log(label,JSON.stringify(await page.evaluate(()=>({doc:window.__vooEditor.getNode('preset-target').exportPresets,ui:[...document.querySelectorAll('[data-testid="editor-properties-panel"] button[aria-label="Export scale"]')].map(e=>e.textContent)}))));
  await trace('after add');
  await panel.getByRole('button',{name:'Export scale',exact:true}).nth(0).click();
  await page.getByRole('option',{name:'2x',exact:true}).click();await trace('after scale2');
  await panel.getByRole('textbox',{name:'Suffix',exact:true}).nth(0).fill('');
  await panel.getByRole('textbox',{name:'Suffix',exact:true}).nth(0).pressSequentially('png');
  await panel.getByRole('textbox',{name:'Suffix',exact:true}).nth(0).press('Tab');await trace('after suffix1');
  await panel.getByRole('button',{name:'Format',exact:true}).nth(1).click();
  await page.getByRole('option',{name:'WebP',exact:true}).click();await trace('after format2');
  await panel.getByRole('button',{name:'Export scale',exact:true}).nth(1).click();
  await page.getByRole('option',{name:'3x',exact:true}).click();await trace('after scale3');
  await panel.getByRole('textbox',{name:'Suffix',exact:true}).nth(1).fill('');
  await panel.getByRole('textbox',{name:'Suffix',exact:true}).nth(1).pressSequentially('web');
  await panel.getByRole('textbox',{name:'Suffix',exact:true}).nth(1).press('Tab');await trace('after suffix2');
  await panel.getByRole('button',{name:'Quality',exact:true}).click();
  await page.getByRole('option',{name:'High',exact:true}).click();await trace('after quality');
  await settlePanels(page);
  expected=await page.evaluate(()=>window.__vooEditor.getNode('preset-target').exportPresets);
  assert.equal(expected.length,2);
  assert.equal(expected[0].suffix,'png');assert.equal(expected[1].suffix,'web');
  assert.equal(expected[0].scale,2);assert.equal(expected[1].type,'image/webp');
  const downloads=[];
  let downloadTimer;
  const complete=new Promise((resolve,reject)=>{
    downloadTimer=setTimeout(()=>reject(new Error('Two preset downloads were not produced')),30000);
    page.on('download',function collect(d){downloads.push(d);if(downloads.length===2){page.off('download',collect);resolve();}});
  });
  try {
    await panel.getByRole('button',{name:'Export',exact:true}).click();
    await complete;
  } finally { clearTimeout(downloadTimer); }
  const files=[];
  for(const download of downloads){
    const name=download.suggestedFilename();await download.saveAs(out+name);
    const bytes=await readFile(out+name);
    const decoded=await page.evaluate(async(b64)=>{
      const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      return {width:img.width,height:img.height,pixel:Array.from(ctx.getImageData(img.width/2,img.height/2,1,1).data)};
    },bytes.toString('base64'));
    assert.ok(decoded.pixel[0]>=250 && decoded.pixel[1]<=5 && decoded.pixel[2]<=5 && decoded.pixel[3]===255);
    assert.deepEqual([decoded.width,decoded.height],name.endsWith('.png')?[240,160]:[360,240]);
    files.push({name,...decoded});
  }
  await page.keyboard.press('Control+k');
  const palette=page.getByRole('dialog').filter({has:page.getByRole('combobox')});
  await palette.getByRole('combobox').fill('portable .zip snapshot');
  const [zip]=await Promise.all([page.waitForEvent('download'),palette.getByRole('option').filter({hasText:/portable \.zip snapshot/i}).click()]);
  await zip.saveAs(out+'PresetConfig.zip');archive=await readFile(out+'PresetConfig.zip');
  await writeFile(out+'before.json',JSON.stringify({expected,files},null,2));
  console.log('Two real preset exports, exact dimensions and red pixels passed; portable ZIP downloaded.');
});
await withEditorBrowser(async({page})=>{
  await page.evaluate(()=>{delete window.showOpenFilePicker;});
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:/^Import project file/}).click()]);
  await chooser.setFiles({name:'PresetConfig.zip',mimeType:'application/zip',buffer:archive});
  await page.waitForFunction(()=>Boolean(window.__vooEditor?.getNode('preset-target')));
  const actual=await page.evaluate(()=>{const e=window.__vooEditor;e.selectExactly(['preset-target']);return e.getNode('preset-target').exportPresets;});
  assert.deepEqual(actual,expected,'cold import retains all preset settings');
  await settlePanels(page);
  const panel=page.getByTestId('editor-properties-panel');
  assert.equal(await panel.getByRole('button',{name:'Format',exact:true}).count(),2);
  assert.deepEqual(await panel.getByRole('textbox',{name:'Suffix',exact:true}).evaluateAll(els=>els.map(el=>el.value)),['png','web']);
  await panel.screenshot({path:out+'cold-inline-config.png'});
  await writeFile(out+'after.json',JSON.stringify(actual,null,2));
  console.log('Fresh browser real filechooser cold reopen retains two inline preset rows, formats/scales/suffix/quality.');
  const suffix=panel.getByRole('textbox',{name:'Suffix',exact:true}).nth(0);
  await suffix.fill('');await suffix.pressSequentially('typed');await suffix.press('Tab');
  assert.equal(await page.evaluate(()=>window.__vooEditor.getNode('preset-target').exportPresets[0].suffix),'typed');
  await page.keyboard.press('ControlOrMeta+Z');
  await page.waitForFunction(()=>window.__vooEditor.getNode('preset-target').exportPresets[0].suffix==='png');
  await settlePanels(page);assert.equal(await suffix.inputValue(),'png');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await page.waitForFunction(()=>window.__vooEditor.getNode('preset-target').exportPresets[0].suffix==='typed');
  await settlePanels(page);assert.equal(await suffix.inputValue(),'typed');
  console.log('Suffix real typing and one Undo/Redo preserve both document value and visible input.');
});
