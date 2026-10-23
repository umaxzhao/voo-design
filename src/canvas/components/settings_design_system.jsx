import { useEffect, useState } from 'react';
import { useDesignStore } from '../../store/design_store.js';
import { DEFAULT_DESIGN_TOKENS, validateDesignTokens } from '../editor/design_tokens.js';
import { colorPickerValue, numberDraft, updateTokenPath } from './design_token_controls.js';
import SettingsSection, { SETTINGS_INPUT_CLASS } from './settings_section.jsx';

export default function SettingsDesignSystem() {
  const pageId = useDesignStore(s => s.editingNodeId);
  const [tokens, setTokens] = useState(DEFAULT_DESIGN_TOKENS);
  const [designMd, setDesignMd] = useState('');
  const [status, setStatus] = useState('');
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const editor = window.__vooEditor;
    const doc = editor?.getDocument?.();
    setAvailable(Boolean(doc && editor?.setDesignSystem));
    setTokens(structuredClone(doc?.designTokens || DEFAULT_DESIGN_TOKENS));
    setDesignMd(doc?.designMd || '');
    setStatus('');
  }, [pageId]);
  function update(path, value) {
    setTokens(previous => updateTokenPath(previous, path, value));
    setStatus('Unsaved changes');
  }
  function save() {
    try {
      const editor = window.__vooEditor;
      const doc = editor?.getDocument?.();
      if (!doc || !editor.setDesignSystem) throw new Error('Open a design document first.');
      editor.setDesignSystem({ designTokens: validateDesignTokens(tokens), designMd });
      setStatus('Saved to this page. Used for future agent generation.');
    } catch (error) { setStatus(error.message); }
  }
  function control(value, path, label, kind) {
    const name = path.join(' ');
    if (kind === 'color') return <label key={name} className="flex min-w-0 flex-col gap-2 text-xs text-neutral-300">
      {label}<span className="flex items-center gap-2">
        <input type="color" aria-label={`${name} picker`} disabled={!available} value={colorPickerValue(value)} onChange={e => update(path, e.target.value)} className="h-12 w-12 shrink-0 cursor-pointer rounded-lg bg-transparent" />
        <input aria-label={name} disabled={!available} className={SETTINGS_INPUT_CLASS} value={value} onChange={e => update(path, e.target.value)} />
      </span>
    </label>;
    if (value && typeof value === 'object') return <fieldset key={name} className="col-span-full grid min-w-0 grid-cols-2 gap-3"><legend className="mb-3 text-xs text-neutral-400">{label}</legend>
      {Object.entries(value).map(([key, entry]) => control(entry, [...path, key], key))}
    </fieldset>;
    const numeric = kind === 'number' || typeof value === 'number';
    return <label key={name} className="flex min-w-0 flex-col gap-2 text-xs text-neutral-300">{label}
      <input aria-label={name} disabled={!available} type={numeric ? 'number' : 'text'} min={numeric ? (path[0] === 'typeScale' ? 0.1 : 0) : undefined} step={numeric ? (path[0] === 'typeScale' ? 0.1 : 1) : undefined} className={SETTINGS_INPUT_CLASS} value={value ?? ''} onChange={e => update(path, numeric ? numberDraft(e.target.value) : e.target.value)} />
    </label>;
  }
  return <SettingsSection title="Document design system" hint="Saved with the active page. Agent generation follows these tokens and your markdown design spec.">
    {!available && <p className="text-xs text-neutral-400">Open a design document to edit its tokens.</p>}
    <div className="flex flex-col gap-6" data-testid="design-token-panel">
      {[[ 'colors', 'Color roles' ], [ 'typeScale', 'Type scale · px' ], [ 'spacing', 'Spacing scale · px' ], [ 'radius', 'Radius · px' ], [ 'components', 'Per-component tokens' ]].map(([group, label]) =>
        <fieldset key={group} className="grid min-w-0 grid-cols-2 gap-3"><legend className="mb-3 text-xs font-medium text-neutral-200">{label}</legend>
          {Object.entries(tokens[group] || {}).map(([key, value]) => control(value, [group, key], Array.isArray(tokens[group]) ? `${group === 'typeScale' ? 'Size' : 'Step'} ${Number(key) + 1}` : key, group === 'colors' ? 'color' : ['typeScale', 'spacing', 'radius'].includes(group) ? 'number' : undefined))}
        </fieldset>)}
      <label className="flex flex-col gap-2 text-xs text-neutral-300">designMd · Markdown design spec
        <textarea aria-label="designMd" disabled={!available} spellCheck={false} rows={9} placeholder={'# Design direction\nDescribe hierarchy, tone, layout, and component usage…'} className={`${SETTINGS_INPUT_CLASS} w-full resize-y font-mono`} value={designMd} onChange={e => { setDesignMd(e.target.value); setStatus('Unsaved changes'); }} />
      </label>
    </div>
    <p className="text-xs text-neutral-500">Type sizes, spacing and radii use pixels. Color values also accept CSS colors.</p>
    <button type="button" disabled={!available} onClick={save} className="rounded-lg bg-white/10 px-4 py-2 text-xs text-neutral-100 disabled:opacity-40">Save design system</button>
    <p role="status" className="text-xs text-neutral-400">{status}</p>
  </SettingsSection>;
}
