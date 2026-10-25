import PropTypes from 'prop-types';
import { StaticSection, fieldClass } from './property_section.jsx';
import VariantsSection from './variants_section.jsx';
import { useI18n } from '../../use_i18n.js';

export function downloadSelectionPng(engine, object) {
  const result = engine?.exportSelectionPng?.([object.id]);
  const dataUrl = typeof result === 'string' ? result : result?.dataUrl;
  if (!dataUrl) return;
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = `${object.name || object.kind}.png`;
  anchor.click();
}

/** Controls only appear when the resolver grants their capability. */
export default function TypeSpecificSections({ object, sections, editAndCommit, engine }) {
  const { t } = useI18n();
  const has = section => sections.includes(section);
  const number = (label, key, fallback, min, max) => <label className="block text-[11px]" key={key}>{label}<input className={fieldClass} type="number" aria-label={label} value={object[key] ?? fallback} min={min} max={max} onChange={event => {
    if (event.target.value === '') return;
    const value = Number(event.target.value);
    if (Number.isFinite(value)) editAndCommit({ [key]: Math.max(min, Math.min(max, value)) });
  }} /></label>;
  return <>
    {has('arc') && <StaticSection title={t('editor.props.arc')}><div className="grid grid-cols-2 gap-2">{number(t('editor.props.arcStart'), 'arcStart', 0, -360, 360)}{number(t('editor.props.arcSweep'), 'arcSweep', 360, 0.01, 360)}{number(t('editor.props.arcInnerRadius'), 'arcInnerRadius', 0, 0, 0.99)}</div></StaticSection>}
    {has('clip') && <StaticSection title={t('editor.props.clip')}><label className="text-[11px]"><input type="checkbox" checked={object.clipContent !== false} onChange={event => editAndCommit({ clipContent: event.target.checked })} /> {t('editor.props.clipContent')}</label></StaticSection>}
    {has('layoutGrid') && <StaticSection title={t('editor.props.layoutGrid')}><label className="text-[11px]"><input type="checkbox" checked={Boolean(object.layoutGrid?.enabled)} onChange={event => editAndCommit({ layoutGrid: { size: 8, ...object.layoutGrid, enabled: event.target.checked } })} /> {t('editor.props.showGrid')}</label><input aria-label={t('editor.props.gridSize')} className={fieldClass} type="number" min="1" max="512" value={object.layoutGrid?.size ?? 8} onChange={event => editAndCommit({ layoutGrid: { ...object.layoutGrid, size: Math.max(1, Math.min(512, Number(event.target.value))) } })} /></StaticSection>}
    {has('component') && <><StaticSection title={t('editor.props.component')}><span className="text-[11px]">{object.sourceCanvasId ? `${t('editor.props.mainComponent')}: ${object.sourceCanvasId}` : t('editor.props.mainComponent')}</span></StaticSection><VariantsSection engine={engine} node={object.sourceCanvasId ? object : null} isMainComponent={!object.sourceCanvasId} /></>}
    {has('export') && <StaticSection title={t('editor.export')}><button type="button" className={fieldClass} onClick={() => downloadSelectionPng(engine, object)}>{t('editor.props.exportPng')}</button></StaticSection>}
  </>;
}
TypeSpecificSections.propTypes = { object: PropTypes.object.isRequired, sections: PropTypes.arrayOf(PropTypes.string).isRequired, editAndCommit: PropTypes.func.isRequired, engine: PropTypes.object };
