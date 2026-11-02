import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { initializeCanvas } from 'ag-psd';
import { figBytesToVooFile } from '../../src/canvas/figma/figma-to-voo.js';
import { psdBytesToVooFile } from '../../src/canvas/store/psd_to_voo.js';
import { svgBytesToVooFile } from '../../src/canvas/store/svg_document_io.js';
import { saveVooProject, openVooProject } from '../../src/canvas/store/project_io.js';
import { decodeVooBinary } from '../../src/canvas/store/voo_binary.js';
vi.mock('../../src/canvas/store/db.js', () => ({ getImageDataUrl: async () => 'data:image/png;base64,AAAA', putImage: async () => {}, getImageBlobMap: async () => new Map(), deleteImages: async () => {} }));
afterEach(() => vi.unstubAllGlobals());
const root = new URL('../fixtures/roundtrip/', import.meta.url);
const fixtures = readdirSync(root).filter(n => /\.(fig|psd|svg)$/.test(n));
const makeImageData = (w,h) => ({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});
initializeCanvas((width,height) => ({width,height,getContext:()=>({createImageData:makeImageData,putImageData(){}})}),makeImageData);

describe('import → live registry → project save → reopen', () => {
  for (const name of fixtures) it(name, async () => {
    vi.stubGlobal('window', { });
    vi.stubGlobal('ImageData', class { constructor(data,width,height) {Object.assign(this,{data,width,height});} });
    vi.stubGlobal('document', { createElement: () => ({getContext:()=>({putImageData(){}}),toDataURL:()=> 'data:image/png;base64,AAAA'}) });
    const bytes = new Uint8Array(readFileSync(new URL(name,root)));
    const imported = name.endsWith('.fig') ? (await figBytesToVooFile(bytes)).vooFile : name.endsWith('.psd') ? psdBytesToVooFile(bytes) : svgBytesToVooFile(bytes);
    const pages = imported.document.pages || [{id:'page',label:name,sceneDoc:imported.document}];
    const nodes = pages.map(p => ({id:p.id,data:{label:p.label,sceneDoc:{...p.sceneDoc,nodes:[]}}}));
    const enginesRef = {current:new Map(pages.map(p => [p.id,{ready:true,engine:{serialise:()=>structuredClone(p.sceneDoc),exportPng:()=>null}}]))};
    let saved;
    const store = {nodes,editingNodeId:pages[0].id,fileName:'roundtrip.voo',filePath:'/test.voo'};
    window.electronAPI = {saveFileDialog:async()=>'/test.voo',writeFileBytes:async (_path,data)=>{saved=data;}};
    await saveVooProject({store,enginesRef});
    const parsed = decodeVooBinary(saved);
    expect(parsed.document.nodes).toEqual(pages[0].sceneDoc.nodes);
    expect(parsed.document.pages.map(p=>p.sceneDoc)).toEqual(pages.map(p=>p.sceneDoc));
    let reopened;
    window.electronAPI = {openFileDialog:async()=>'/test.voo',readFileBytes:async()=>saved};
    await openVooProject({fileOrPath:'/test.voo',store:{loadVooProject:({vooData})=>{reopened=vooData;}}});
    expect(reopened.document).toEqual(parsed.document);
  });
});

describe('save registry fallbacks', () => {
  it('serializes all ready pages and uses snapshots for pages still opening', async () => {
    vi.stubGlobal('window', {});
    const liveDoc = {version:1,width:100,height:100,nodes:[{id:'new',kind:'rect',name:'Live edit',x:5,y:7,width:20,height:20,fill:'#ff6600'}]};
    const snapshotDoc = {...liveDoc,nodes:[{...liveDoc.nodes[0],name:'Evicted edit'}]};
    const storedDoc = {...liveDoc,nodes:[]};
    const serialise = vi.fn(()=>liveDoc);
    const pendingSerialise = vi.fn(()=>{throw new Error('must not serialize placeholder');});
    let saved;
    window.electronAPI = {saveFileDialog:async()=>'/test.voo',writeFileBytes:async (_path,bytes)=>{saved=bytes;}};
    await saveVooProject({
      store:{fileName:'pages.voo',filePath:'/test.voo',editingNodeId:'live',nodes:['live','pending','stored'].map(id=>({id,data:{editorDoc:storedDoc}}))},
      enginesRef:{current:new Map([['live',{ready:true,engine:{serialise,exportPng:()=>null}}],['pending',{ready:false,engine:{serialise:pendingSerialise}}]])},
      snapshotsRef:{current:new Map([['live',{doc:storedDoc}],['pending',{doc:snapshotDoc}]])},
    });
    const doc=decodeVooBinary(saved).document;
    expect(doc.nodes).toEqual(liveDoc.nodes);
    expect(doc.pages.map(p=>p.sceneDoc)).toEqual([liveDoc,snapshotDoc,storedDoc]);
    expect(serialise).toHaveBeenCalledOnce();
    expect(pendingSerialise).not.toHaveBeenCalled();
  });
});

describe('browser File import entry point', () => {
  for (const name of fixtures.filter(name => /\.(fig|psd)$/.test(name))) it(name, async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('ImageData', class { constructor(data,width,height) {Object.assign(this,{data,width,height});} });
    vi.stubGlobal('document', { createElement: () => ({getContext:()=>({putImageData(){}}),toDataURL:()=> 'data:image/png;base64,AAAA'}) });
    const file = new File([readFileSync(new URL(name, root))], name);
    const loadVooProject = vi.fn();
    const setDocumentLoading = vi.fn();
    const result = await openVooProject({fileOrPath:file,store:{loadVooProject,setDocumentLoading}});
    expect(result.success).toBe(true);
    expect(loadVooProject).toHaveBeenCalledOnce();
    const {vooData,fileName} = loadVooProject.mock.calls[0][0];
    const pages = vooData.document.pages || [{sceneDoc:vooData.document}];
    expect(pages.some(page => page.sceneDoc.nodes.length > 0)).toBe(true);
    expect(fileName).toMatch(name.endsWith('.psd') ? /\.psd$/ : /\.fig$/);
    expect(setDocumentLoading).toHaveBeenLastCalledWith(null);
  });
});
