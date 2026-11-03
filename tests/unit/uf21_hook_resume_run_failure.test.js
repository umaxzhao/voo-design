import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const H=vi.hoisted(()=>({state:null,refs:[],cursor:0}));
const B=vi.hoisted(()=>({cached:vi.fn(),download:vi.fn(),matte:vi.fn()}));
vi.mock('react',async original=>({...await original(),
 useReducer:(reducer,arg,init)=>{if(H.state===null)H.state=init(arg);return [H.state,action=>{H.state=reducer(H.state,action);}];},
 useRef:value=>{const i=H.cursor++;return H.refs[i]??(H.refs[i]={current:value});},
 useMemo:factory=>factory(),useCallback:f=>f,useEffect:()=>{}
}));
vi.mock("../../src/shared/model-routes.js",()=>({PERFORMANCE_TIER_KEY:'performanceTier',getPerformanceTier:()=>({tier:'basic'})}));
vi.mock("../../src/canvas/editor/local_matting.js",()=>({isModelCached:B.cached,downloadModel:B.download,runLocalMatting:B.matte,MATTE_REFINE_TOO_LARGE:'too-large'}));
import {useEditorRaster} from "../../src/canvas/components/editor_hooks/use_editor_raster.js";
describe('actual production raster hook resume result contract; no real inference',()=>{
 beforeEach(()=>{H.state=null;H.refs=[];H.cursor=0;B.cached.mockResolvedValue(false);B.download.mockResolvedValue(undefined);B.matte.mockRejectedValue(new Error('onnxSessionLoadFailed'));vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:1,height:1,close:vi.fn()}));});
 afterEach(()=>vi.unstubAllGlobals());
 it('must retain a failure/retry state when real runObjectStroke catches model error after download',async()=>{
  const engine={getDocument:()=>({nodes:[{id:'img',kind:'image',x:0,y:0,width:1,height:1,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='}]}),exportNodePng:()=>null,setRegionHint:vi.fn()};
  const render=()=>{H.cursor=0;return useEditorRaster({engine,selected:{id:'img'},lasso:null,pendingObjectStroke:{mode:'replace'}});};
  let api=render();await api.runObjectStroke({nodeId:'img',points:[[0,0]],intent:'select',size:1});
  expect(H.state.mattingDownload.phase).toBe('required');
  api=render();const result=await api.downloadMattingModel();
  console.log('PRODUCTION_RASTER_STATE',JSON.stringify({result,mattingDownload:H.state.mattingDownload,maskError:H.state.maskError,matteCalls:B.matte.mock.calls.length}));
  expect(B.matte).toHaveBeenCalledOnce();
  expect(result).toBe(false);
  expect(H.state.mattingDownload?.phase).toBe('runFailed');
 });
});
