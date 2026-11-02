import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
await withEditorBrowser(async ({ page, tool }) => {
  await page.evaluate(async () => {
    const { createRectNode } = await import('/src/canvas/editor/scene_model.js');
    const engine = window.__vooEditor, doc = engine.getDocument();
    engine.setDoc({...doc,nodes:[...doc.nodes,{...createRectNode({x:20,y:30,width:120,height:80,fill:'#ff0000'}),id:'resource-card',name:'SavedCard'}]});
    engine.selectExactly(['resource-card']);
  });
  await page.getByTestId('editor-layers-tab-assets').click();
  const resources=page.getByTestId('editor-resource-browser');
  await resources.getByText('Import images, SVG or .voo templates, or save a selection to reuse it.',{exact:true}).waitFor();
  await resources.getByRole('button',{name:'Save selection to resources',exact:true}).click();
  const saved=resources.getByRole('button',{name:/^Insert resource: SavedCard-/});
  await saved.waitFor();
  await saved.click();
  await page.waitForFunction(()=>window.__vooEditor.getDocument().nodes.filter(n=>n.name==='SavedCard').length===2);
  await tool('undo');
  assert.equal(await page.evaluate(()=>window.__vooEditor.getDocument().nodes.filter(n=>n.name==='SavedCard').length),1);
  await page.evaluate(()=>window.__vooEditor.selectExactly(['resource-card']));
  await tool('create_component',{layerId:'resource-card',name:'ReusableCard'});
  await resources.getByRole('button',{name:'Resource source',exact:true}).click();
  await page.getByRole('option',{name:'In this file',exact:true}).click();
  const component=resources.getByRole('button',{name:'Insert resource: ReusableCard',exact:true});
  await component.waitFor();
  const instances=await page.evaluate(()=>window.__vooEditor.getDocument().nodes.filter(n=>n.sourceCanvasId).length);
  await component.click();
  await page.waitForFunction(count=>window.__vooEditor.getDocument().nodes.filter(n=>n.sourceCanvasId).length===count+1,instances);
  await tool('undo');
  await resources.getByRole('button',{name:'Resource source',exact:true}).click();
  await page.getByRole('option',{name:'Workspace',exact:true}).click();
  const folder=await page.evaluate(async()=>{
    const {workspaceStorage}=await import('/src/services/workspace_storage.js');
    return (await workspaceStorage.listFolders()).some(f=>f.name==='Resources');
  });
  assert.equal(folder,true);
  // Import a genuine PNG and prove hydrated pixels appear after insertion.
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=16;c.height=12;const x=c.getContext('2d');x.fillStyle='#00ff00';x.fillRect(0,0,16,12);return c.toDataURL();});
  await resources.locator('input[type=file]').setInputFiles({name:'Green.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});
  const image=resources.getByRole('button',{name:/^Insert resource: Green-/});await image.waitFor();await image.click();
  await page.waitForFunction(()=>window.__vooEditor.getDocument().nodes.some(n=>n.kind==='image'));
  await page.waitForFunction(()=>{
    const e=window.__vooEditor,n=e.getDocument().nodes.find(n=>n.kind==='image');
    return e.sampleColorAt({x:n.x+8,y:n.y+6})==='#00ff00';
  });
  await tool('undo');
  assert.equal(await page.evaluate(()=>window.__vooEditor.getDocument().nodes.some(n=>n.kind==='image')),false);
  await resources.getByRole('button',{name:'Resource source',exact:true}).click();
  await page.getByRole('option',{name:'Templates',exact:true}).click();
  const template=resources.locator('button[data-resource-id]').first();await template.waitFor();
  const before=await page.evaluate(()=>window.__vooEditor.getDocument().nodes.length);
  await template.click();
  await page.waitForFunction(count=>window.__vooEditor.getDocument().nodes.length>count,before);
  await tool('undo');
  assert.equal(await page.evaluate(()=>window.__vooEditor.getDocument().nodes.length),before);
  // Search uses the same existing header entry and applies to resource names.
  const searchLabel=await page.evaluate(async()=>(await import('/src/shared/i18n.js')).t('editor.assets.searchToggle'));
  await page.getByTestId('editor-layers-panel').getByRole('button',{name:searchLabel,exact:true}).click();
  await page.getByRole('textbox',{name:'Search resources…',exact:true}).fill('no-such-resource-982');
  await resources.getByText('No matching resources',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Search resources…',exact:true}).fill('');
  await resources.getByRole('button',{name:'Resource source',exact:true}).click();
  await page.getByRole('option',{name:'Workspace',exact:true}).click();
  await image.waitFor();
  await page.reload();await page.waitForLoadState('networkidle');
  await tool('new_document',{width:600,height:400,name:'ResourceReload',force:true});
  await page.waitForFunction(()=>document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute('data-open-guard')==='off');
  await page.getByTestId('editor-layers-tab-assets').click();
  await image.waitFor();
  await page.screenshot({path:editorArtifactPath('voo-resources-desktop.png')});
  await resources.locator('input[type=file]').setInputFiles({name:'Broken.voo',mimeType:'application/octet-stream',buffer:Buffer.from('{}')});
  await resources.getByRole('alert').waitFor();
  await resources.getByRole('button',{name:/^Move resource to trash: Green-/}).click();
  await image.waitFor({state:'detached'});
  const trashed=await page.evaluate(async()=>{
    const {workspaceStorage}=await import('/src/services/workspace_storage.js');
    return (await workspaceStorage.scanFiles({trashOnly:true})).some(item=>item.name.startsWith('Green-'));
  });
  assert.equal(trashed,true);

});
console.log('Resource browser: selection/save/insert/undo, durable workspace folder, PNG hydration pixels, templates and search passed.');

await withEditorBrowser(async ({page})=>{
  const toggle=page.getByRole('button',{name:'Expand layers panel',exact:true});
  if(await toggle.isVisible()) await toggle.click();
  await page.getByTestId('editor-layers-tab-assets').click();
  const resources=page.getByTestId('editor-resource-browser');
  await resources.getByRole('button',{name:'Resource source',exact:true}).click();
  await page.getByRole('option',{name:'Templates',exact:true}).click();
  await resources.locator('button[data-resource-id]').first().waitFor();
  for(const width of [320,390,768]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const geometry=await resources.evaluate(element=>{
      const box=element.getBoundingClientRect();
      return {left:box.left,right:box.right,width:innerWidth,overflow:element.scrollWidth>element.clientWidth};
    });
    assert.ok(geometry.left>=0 && geometry.right<=geometry.width,JSON.stringify(geometry));
    assert.equal(geometry.overflow,false);
    await page.screenshot({path:editorArtifactPath(`voo-resources-${width}.png`)});
  }
},{viewport:{width:390,height:900},hasTouch:true});
