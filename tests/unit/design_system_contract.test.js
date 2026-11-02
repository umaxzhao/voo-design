import { describe, it, expect } from 'vitest';
import { validateDesignSystem, checkContrast } from '../../src/canvas/agent/design_system/schema.js';
import { fromStyleKit, DESIGN_SYSTEM_PRESETS } from '../../src/canvas/agent/design_system/from_style_kit.js';
import { designSystemToCssVars, designSystemToTailwindConfig, designSystemPromptBlock, diffDesignSystem } from '../../src/canvas/agent/design_system/apply.js';
import { getActiveDesignSystem, setActiveDesignSystem } from '../../src/canvas/agent/design_system/store.js';
import { serialiseDocument, deserialiseDocument } from '../../src/canvas/editor/scene_model_serialization.js';
import { runAgentTurn } from '../../src/canvas/agent/canvas_agent.js';
const preset = () => fromStyleKit('linear');
describe('versioned design system', () => {
  it('converts every shipped kit, flattening translucent glass colors', () => {
    expect(Object.keys(DESIGN_SYSTEM_PRESETS)).toHaveLength(20);
    for (const ds of Object.values(DESIGN_SYSTEM_PRESETS)) expect(validateDesignSystem(ds).ok).toBe(true);
    expect(DESIGN_SYSTEM_PRESETS.glass.colors.surface).toBe('#C3C5C7');
  });
  it('normalizes without mutation and preserves unknown fonts with warnings', () => {
    const ds = preset(); ds.colors.primary = '#abc'; ds.typography.fontBody = 'My Custom Face'; ds.spacing.scale = [8,0,4,4];
    const result = validateDesignSystem(ds);
    expect(result.ok).toBe(true); expect(result.value.colors.primary).toBe('#AABBCC');
    expect(result.value.spacing.scale).toEqual([0,4,8]); expect(ds.colors.primary).toBe('#abc');
    expect(result.value.typography.fontBody).toBe('My Custom Face'); expect(result.warnings.join()).toContain('unknown font');
  });
  it.each([null,{}, {version:2}])('rejects malformed input %j', obj => expect(validateDesignSystem(obj).ok).toBe(false));
  it('rejects invalid nested values and oversized guidelines', () => {
    const ds = preset(); ds.colors.primary='red'; ds.typography.scale.bodyMd.fontSize=999; ds.components.input.height=-1; ds.designMd='a'.repeat(4001);
    expect(validateDesignSystem(ds).errors).toHaveLength(4);
  });
  it('reports low contrast without invalidating', () => {
    const ds = preset(); ds.colors.onPrimary = ds.colors.primary;
    expect(checkContrast(ds).join()).toContain('onPrimary/primary: contrast 1.00');
    expect(validateDesignSystem(ds).ok).toBe(true);
  });
  it('exports usable tokens and detects leaf drift independent of key order', () => {
    const ds=preset(); const vars=designSystemToCssVars(ds);
    expect(vars['--ds-typography-scale-body-md-font-size']).toBe('13px');
    expect(vars['--ds-typography-scale-body-md-font-weight']).toBe('400');
    const config=designSystemToTailwindConfig(ds); expect(config.theme.extend.colors.primary).toBe(ds.colors.primary);
    expect(config.theme.extend.spacing['4']).toBe('16px');
    expect(designSystemPromptBlock(ds)).toContain(ds.designMd);
    expect(diffDesignSystem(ds,{...ds})).toEqual([]);
    expect(diffDesignSystem(ds,{...ds,name:'Changed'})).toEqual([{path:'name',before:ds.name,after:'Changed'}]);
  });
  it('validates before committing and round trips document metadata', () => {
    let doc={version:1,width:800,height:600,nodes:[],colorVariables:[{id:'x',name:'X',value:'#ffffff'}]}; let commits=0;
    const editor={getDoc:()=>doc,setDoc:next=>{doc=next; commits++;}};
    expect(()=>setActiveDesignSystem(editor,{})).toThrow(); expect(commits).toBe(0);
    setActiveDesignSystem(editor,preset()); expect(commits).toBe(1);
    expect(getActiveDesignSystem(deserialiseDocument(serialiseDocument(doc)))).toEqual(preset());
    expect(getActiveDesignSystem(deserialiseDocument(serialiseDocument({...doc,designSystem:undefined})))).toBe(null);
    expect(doc.colorVariables).toHaveLength(1);
  });
  it('persists the auto selection after an edit and reuses the contract on subsequent turns', async () => {
    const original=globalThis.window; let doc={nodes:[]}; let system;
    globalThis.window={__vooEditor:{getDoc:()=>doc,setDoc:next=>{doc=next;}}};
    const run = (userText, edit = false) => {
      let first = true;
      return runAgentTurn({ config: {}, history: [], userText, tools: [], executeTool: async () => ({}), streamStep: async ({ messages }) => {
        system = messages[0].content;
        const toolCalls = edit && first ? [{ id: 'rename', name: 'rename_layer', arguments: '{}' }] : [];
        first = false;
        return { text: 'done', toolCalls };
      } });
    };
    try {
      await run('editorial magazine'); expect(doc.designSystem).toBeUndefined();
      await run('editorial magazine', true); expect(doc.designSystem.id).toBe('editorial');
      doc.designSystem.colors.primary='#123456'; await run('edit the dark developer dashboard');
      expect(system).toContain('#123456'); expect(system).toContain('Editorial Print'); expect(system).not.toContain('Palette: bg');
    } finally { if(original===undefined) delete globalThis.window; else globalThis.window=original; }
  });
});
