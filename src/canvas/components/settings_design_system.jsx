import { useEffect, useState } from 'react';
import { useDesignStore } from '../../store/design_store.js';
import { DEFAULT_DESIGN_TOKENS, validateDesignTokens } from '../editor/design_tokens.js';
import SettingsSection, { SETTINGS_INPUT_CLASS } from './settings_section.jsx';

const GROUPS = [['colors', 'Color roles'], ['typeScale', 'Type scale · px'], ['spacing', 'Spacing scale · px'], ['radius', 'Radius · px'], ['components', 'Per-component tokens']];

export default function SettingsDesignSystem() {
  const pageId = useDesignStore(s => s.editingNodeId);
  const [fields, setFields] = useState({});
  const [designMd, setDesignMd] = useState('');
  const [status, setStatus] = useState('');
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const editor = window.__vooEditor;
    const doc = editor?.getDocument?.();
    setAvailable(Boolean(doc && editor?.setDesignSystem));
    const tokens = doc?.designTokens || DEFAULT_DESIGN_TOKENS;
    setFields(Object.fromEntries(GROUPS.map(([key]) => [key, JSON.stringify(tokens[key] ?? DEFAULT_DESIGN_TOKENS[key], null, 2)])));
    setDesignMd(doc?.designMd || '');
    setStatus('');
  }, [pageId]);
  function save() {
    try {
      const editor = window.__vooEditor;
      const doc = editor?.getDocument?.();
      if (!doc || !editor.setDesignSystem) throw new Error('Open a design document first.');
      const designTokens = validateDesignTokens(Object.fromEntries(GROUPS.map(([key]) => [key, JSON.parse(fields[key])])));
      editor.setDesignSystem({ designTokens, designMd });
      setStatus('Saved to this page. Used for future agent generation.');
    } catch (error) { setStatus(error.message); }
  }
  return <SettingsSection title="Document design system" hint="Saved with the active page. Agent generation follows these tokens and your markdown design spec.">
    {!available && <p className="text-xs text-neutral-400">Open a design document to edit its tokens.</p>}
    <div className="grid gap-4 sm:grid-cols-2" data-testid="design-token-panel">
      {GROUPS.map(([key, label]) => <label key={key} className={`flex flex-col gap-2 text-xs text-neutral-300 ${key === 'components' ? 'sm:col-span-2' : ''}`}>
        {label}<textarea aria-label={label} disabled={!available} spellCheck={false} rows={key === 'colors' ? 8 : 5} className={`${SETTINGS_INPUT_CLASS} w-full resize-y font-mono`} value={fields[key] || ''} onChange={e => { setFields({ ...fields, [key]: e.target.value }); setStatus('Unsaved changes'); }} />
      </label>)}
      <label className="flex flex-col gap-2 text-xs text-neutral-300 sm:col-span-2">designMd · Markdown design spec
        <textarea aria-label="designMd" disabled={!available} spellCheck={false} rows={9} placeholder={'# Design direction\nDescribe hierarchy, tone, layout, and component usage…'} className={`${SETTINGS_INPUT_CLASS} w-full resize-y font-mono`} value={designMd} onChange={e => { setDesignMd(e.target.value); setStatus('Unsaved changes'); }} />
      </label>
    </div>
    <p className="mt-3 text-xs text-neutral-500">Token fields use JSON. Name color roles and components freely; scales and radii use pixels.</p>
    <button type="button" disabled={!available} onClick={save} className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-xs text-neutral-100 disabled:opacity-40">Save design system</button>
    <p role="status" className="mt-2 text-xs text-neutral-400">{status}</p>
  </SettingsSection>;
}
