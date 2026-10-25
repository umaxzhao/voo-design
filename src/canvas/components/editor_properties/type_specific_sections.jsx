import PropTypes from 'prop-types';
import { SectionAddButton, StaticSection, fieldClass, sectionRowClass } from './property_section.jsx';
import ScrubValueInput from './scrub_value_input.jsx';
import { IconEye, IconEyeOff } from '../../icons.jsx';
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
    {has('arc') && <StaticSection title={t('editor.props.arc')} storageKey="arc"><div className="grid grid-cols-2 gap-2">{number(t('editor.props.arcStart'), 'arcStart', 0, -360, 360)}{number(t('editor.props.arcSweep'), 'arcSweep', 360, 0.01, 360)}{number(t('editor.props.arcInnerRadius'), 'arcInnerRadius', 0, 0, 0.99)}</div></StaticSection>}
    {has('clip') && (
      <StaticSection title={t('editor.props.clip')} storageKey="clip">
        <button
          type="button"
          role="switch"
          aria-label={t('editor.props.clipContent')}
          aria-checked={object.clipContent !== false}
          onClick={() => editAndCommit({ clipContent: object.clipContent === false })}
          className={sectionRowClass}
        >
          <span className="flex-1 text-left">{t('editor.props.clipContent')}</span>
          <span
            aria-hidden="true"
            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${object.clipContent !== false ? 'bg-white' : 'bg-white/10'}`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform ${object.clipContent !== false ? 'left-3.5 bg-black' : 'left-0.5 bg-neutral-400'}`}
            />
          </span>
        </button>
      </StaticSection>
    )}
    {has('layoutGrid') && (
      <StaticSection
        title={t('editor.props.layoutGrid')}
        storageKey="layoutGrid"
        extra={
          <SectionAddButton
            label={t('editor.props.showGrid')}
            onClick={() => editAndCommit({ layoutGrid: { size: 8, ...object.layoutGrid, enabled: true } })}
          />
        }
      >
        {object.layoutGrid ? (
          <div className={sectionRowClass}>
            <button
              type="button"
              aria-label={t('editor.props.showGrid')}
              aria-pressed={Boolean(object.layoutGrid.enabled)}
              onClick={() => editAndCommit({ layoutGrid: { size: 8, ...object.layoutGrid, enabled: !object.layoutGrid.enabled } })}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
            >
              {object.layoutGrid.enabled ? <IconEye size={13} /> : <IconEyeOff size={13} />}
            </button>
            <span className="flex-1 text-[11px] text-neutral-300">{t('editor.props.showGrid')}</span>
            <ScrubValueInput
              min={1}
              max={512}
              step={1}
              value={object.layoutGrid.size ?? 8}
              format={(size) => String(size)}
              onChange={(size) => editAndCommit({ layoutGrid: { ...object.layoutGrid, size: Math.max(1, Math.min(512, Number(size))) } })}
              ariaLabel={t('editor.props.gridSize')}
              scrubHint={t('editor.props.dragToAdjust')}
              className="!w-10 shrink-0 text-right"
            />
          </div>
        ) : null}
      </StaticSection>
    )}
    {has('component') && <><StaticSection title={t('editor.props.component')} storageKey="component"><span className="text-[11px]">{object.sourceCanvasId ? `${t('editor.props.mainComponent')}: ${object.sourceCanvasId}` : t('editor.props.mainComponent')}</span></StaticSection><VariantsSection engine={engine} node={object.sourceCanvasId ? object : null} isMainComponent={!object.sourceCanvasId} /></>}
  </>;
}
TypeSpecificSections.propTypes = { object: PropTypes.object.isRequired, sections: PropTypes.arrayOf(PropTypes.string).isRequired, editAndCommit: PropTypes.func.isRequired, engine: PropTypes.object };
