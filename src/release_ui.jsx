import React, { useEffect, useState } from 'react';
import { useI18n } from './canvas/use_i18n.js';
import { version as browserVersion } from '../package.json';

export default function ReleaseUI() {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(null);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(browserVersion);
  const [legal, setLegal] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const api = window.vooDesktop;
    const onStatus = (value) => setStatus(value?.state);
    const offStatus = api?.updates?.onStatus(onStatus);
    api?.updates?.status().then(onStatus).catch(() => {});
    api?.version?.().then(setVersion).catch(() => {});
    const show = () => setOpen(true);
    window.addEventListener('voo:open-about', show);
    const offMenu = window.electronAPI?.onMenuAction((action) => { if (action === 'help:about') show(); });
    return () => { offStatus?.(); offMenu?.(); window.removeEventListener('voo:open-about', show); };
  }, []);
  useEffect(() => {
    if (!open || legal) return;
    let active = true;
    setFailed(false);
    Promise.all(['LICENSE', 'EULA.md', 'THIRD_PARTY_NOTICES.json'].map(async (name) => {
      const response = await fetch(new URL(name, document.baseURI));
      if (!response.ok) throw new Error(name);
      return response.text();
    })).then((value) => { if (active) setLegal(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [open, legal]);
  useEffect(() => {
    if (!open) return;
    const close = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return <>
    {['available', 'downloaded'].includes(status) && dismissed !== status && <div role="status" className="fixed bottom-5 left-5 z-[110] flex items-center gap-4 rounded-xl border border-white/20 bg-neutral-900 p-4 text-xs text-white shadow-panel">
      <span>{t(status === 'downloaded' ? 'release.restartReady' : 'release.downloading')}</span>
      {status === 'downloaded' && <button onClick={() => window.vooDesktop?.updates?.quitAndInstall().catch(() => {})}>{t('release.restart')}</button>}
      <button onClick={() => setDismissed(status)}>{t('release.dismiss')}</button>
    </div>}
    {open && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="about-title" className="max-h-[80vh] w-[720px] max-w-[95vw] overflow-auto rounded-xl bg-neutral-900 p-6 text-white shadow-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 id="about-title">{t('release.about')}</h2><button autoFocus onClick={() => setOpen(false)}>{t('release.close')}</button></div>
        <p className="my-4">VOO Design {version} · MIT</p>
        {failed ? <p>{t('release.loadFailed')}</p> : !legal ? <p>{t('release.loading')}</p> : legal.map((text, i) => <details key={i} className="my-3"><summary>{['MIT License', t('release.eula'), t('release.notices')][i]}</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{text}</pre></details>)}
      </section>
    </div>}
  </>;
}
