import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  await page.evaluate(async () => {
    const { workspaceStorage } = await import('/src/services/workspace_storage.js');
    const { createDocument, createRectNode } = await import('/src/canvas/editor/scene_model.js');
    const { encodeVooBinary } = await import('/src/canvas/store/voo_binary.js');
    const doc = createDocument(240,160,'transparent');
    doc.nodes = [{...createRectNode({x:-500,y:-200,width:240,height:160,fill:'#ff0000'}),id:'cover-art'}];
    await workspaceStorage.writeFileBytes('LegacyCover.voo',encodeVooBinary({format:'voo',version:1,document:doc,images:{}}));
    window.__coverSavedDoc = doc;
  });
  const heading = page.getByTestId('welcome-prompt-heading');
  await heading.waitFor();
  assert.equal(await heading.innerText(),'What would you like to design?');
  const card = page.locator('[data-welcome-file-id]').filter({has:page.getByRole('button',{name:'LegacyCover.voo',exact:true})});
  const image=card.getByTestId('welcome-file-cover-image');
  await image.waitFor();
  const pixel = async () => image.evaluate(async img=>{
    await img.decode();const c=document.createElement('canvas');c.width=1;c.height=1;
    const ctx=c.getContext('2d');ctx.drawImage(img,0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];
  });
  assert.deepEqual(await pixel(),[255,0,0,255]);
  // A newer draft must beat the workspace record's old cover and old bytes.
  await page.evaluate(async()=>{
    const { addRecentFile }=await import('/src/canvas/store/recent_files.js');
    const { saveDraftBytes }=await import('/src/canvas/store/draft_store.js');
    const { encodeVooBinary }=await import('/src/canvas/store/voo_binary.js');
    const entry=addRecentFile({name:'LegacyCover.voo',isDraft:true});
    const doc=structuredClone(window.__coverSavedDoc);doc.nodes[0].fill='#00ff00';
    await saveDraftBytes(entry.id,encodeVooBinary({format:'voo',version:1,document:doc,images:{}}),entry.name);
  });
  await page.waitForFunction(()=>{
    const img=document.querySelector('[data-testid="welcome-file-cover-image"]');
    if(!img?.complete||!img.naturalWidth)return false;
    const c=document.createElement('canvas');c.width=1;c.height=1;const x=c.getContext('2d');
    x.drawImage(img,0,0,1,1);return x.getImageData(0,0,1,1).data[1]===255;
  });
  assert.deepEqual(await pixel(),[0,255,0,255]);
  await page.evaluate(async()=>{
    const {workspaceStorage}=await import('/src/services/workspace_storage.js');
    const {decodeVooBinary}=await import('/src/canvas/store/voo_binary.js');
    const file=decodeVooBinary(await workspaceStorage.readFileBytes('LegacyCover.voo'));
    window.__coverUnchanged=file.document.nodes[0].fill;
  });
  assert.equal(await page.evaluate(()=>window.__coverUnchanged),'#ff0000');
  await page.reload();await page.waitForLoadState('networkidle');
  await image.waitFor();assert.deepEqual(await pixel(),[0,255,0,255]);
  const draftPreview = await page.evaluate(async()=>{
    const {addRecentFile}=await import('/src/canvas/store/recent_files.js');
    const {writeDraftSnapshot}=await import('/src/canvas/store/draft_autosave.js');
    const {loadDraftBytes}=await import('/src/canvas/store/draft_store.js');
    const {decodeVooBinary}=await import('/src/canvas/store/voo_binary.js');
    const entry=addRecentFile({name:'AutoCover.voo',isDraft:true});
    const {workspaceStorage}=await import('/src/services/workspace_storage.js');
    const doc=decodeVooBinary(await workspaceStorage.readFileBytes('LegacyCover.voo')).document;
    const saved=await writeDraftSnapshot({store:{fileName:entry.name,nodes:[{id:'auto-page',data:{editorDoc:doc}}],editingNodeId:'auto-page'}});
    const file=decodeVooBinary((await loadDraftBytes(entry.id)).bytes);
    window.dispatchEvent(new CustomEvent('voo:workspace-changed'));
    return {saved,preview:file.preview};
  });
  assert.equal(draftPreview.saved,true);
  assert.ok(draftPreview.preview.startsWith('data:image/png'));
  const auto=page.locator('[data-welcome-file-id]').filter({has:page.getByRole('button',{name:'AutoCover.voo',exact:true})});
  await auto.getByTestId('welcome-file-cover-image').waitFor();
  await page.evaluate(async()=>{await(await import('/src/shared/i18n.js')).setLocale('zh');});
  assert.equal(await heading.innerText(),'今天想设计什么？');
  await page.screenshot({path:editorArtifactPath('voo-welcome-covers-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  await heading.scrollIntoViewIfNeeded();
  assert.ok((await heading.boundingBox()).width<=390);
  await page.screenshot({path:editorArtifactPath('voo-welcome-covers-mobile.png')});
},{openDocument:false,mcpLink:false});
console.log('Welcome heading and real legacy/draft cover pixels, reload and read-only recovery passed.');
