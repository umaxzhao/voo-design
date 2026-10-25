import { useId, useState } from 'react';
import { useI18n } from '../use_i18n.js';
import { getSetting, setSetting } from '../../shared/settings.js';
import { MCP_SERVERS_KEY, validateMcpServers } from '../../shared/agent_mcp_servers.js';
import SettingsSection, { SETTINGS_INPUT_CLASS, SettingsField } from './settings_section.jsx';

const LINK_BUTTON_CLASS =
  'self-start rounded-md px-1 py-1 text-xs text-neutral-200 underline-offset-2 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40';

export default function AgentMcpSettings() {
  const { t } = useI18n();
  const formId = useId();
  const [servers, setServers] = useState(() => getSetting(MCP_SERVERS_KEY) ?? []);
  // The form stays collapsed until someone wants to add a server.
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState('stdio');
  const [id, setId] = useState('');
  const [target, setTarget] = useState('');
  const [args, setArgs] = useState('[]');
  const [values, setValues] = useState('{}');
  const [error, setError] = useState(false);
  const save = next => { setSetting(MCP_SERVERS_KEY, next); setServers(next); };
  const add = event => {
    event.preventDefault();
    try {
      const server = type === 'stdio'
        ? { id: id.trim(), type, command: target.trim(), args: JSON.parse(args), env: JSON.parse(values) }
        : { id: id.trim(), type, url: target.trim(), headers: JSON.parse(values) };
      save(validateMcpServers([...servers, server]));
      setId(''); setTarget(''); setArgs('[]'); setValues('{}'); setError(false); setFormOpen(false);
    } catch { setError(true); }
  };
  return <SettingsSection title={t('agent.mcp.title')} hint={t('agent.mcp.hint')}>
    {servers.map(server => <div key={server.id} className="flex items-center justify-between text-xs text-neutral-300">
      <span>{server.id} · {server.type}</span>
      <button type="button" className={LINK_BUTTON_CLASS} onClick={() => save(servers.filter(item => item.id !== server.id))}>{t('agent.mcp.remove')}</button>
    </div>)}
    <button type="button" data-testid="agent-mcp-form-toggle" aria-expanded={formOpen} aria-controls={formId}
      className={LINK_BUTTON_CLASS} onClick={() => setFormOpen(open => !open)}>
      {t(formOpen ? 'agent.mcp.hideForm' : 'agent.mcp.showForm')}
    </button>
    {formOpen && <form id={formId} onSubmit={add} className="flex flex-col gap-2">
      <SettingsField label={t('agent.mcp.type')}><select className={SETTINGS_INPUT_CLASS} value={type} onChange={e => { setType(e.target.value); setTarget(''); setValues('{}'); }}>
        <option value="stdio">{t('agent.mcp.stdio')}</option><option value="http">{t('agent.mcp.http')}</option>
      </select></SettingsField>
      <SettingsField label={t('agent.mcp.id')}><input className={SETTINGS_INPUT_CLASS} value={id} onChange={e => setId(e.target.value)} required /></SettingsField>
      <SettingsField label={t(type === 'stdio' ? 'agent.mcp.command' : 'agent.mcp.url')}><input className={SETTINGS_INPUT_CLASS} value={target} onChange={e => setTarget(e.target.value)} required /></SettingsField>
      {type === 'stdio' && <SettingsField label={t('agent.mcp.args')}><input className={SETTINGS_INPUT_CLASS} value={args} onChange={e => setArgs(e.target.value)} /></SettingsField>}
      <SettingsField label={t(type === 'stdio' ? 'agent.mcp.env' : 'agent.mcp.headers')}><textarea className={SETTINGS_INPUT_CLASS} value={values} onChange={e => setValues(e.target.value)} /></SettingsField>
      {error && <p role="alert" className="text-xs text-rose-400">{t('agent.mcp.invalid')}</p>}
      <button type="submit" className="min-h-9 rounded-xl bg-white/[0.06] px-3 py-2 text-xs text-neutral-200 outline-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40">{t('agent.mcp.add')}</button>
    </form>}
  </SettingsSection>;
}
