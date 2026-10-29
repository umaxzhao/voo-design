import PropTypes from 'prop-types';
import { StaticSection, fieldClass, sectionRowClass } from './property_section.jsx';
import ScrubField from '../scrub_field.jsx';
import AutoLayoutModeIcon from './auto_layout_mode_icon.jsx';
import ScrubValueInput from './scrub_value_input.jsx';
import FlatSelect from '../flat_select.jsx';
import { normalizeLayoutGrid } from '../../editor/layout_grid.js';
import { IconEye, IconEyeOff } from '../../icons.jsx';
import VariantsSection from './variants_section.jsx';
import { useI18n } from '../../use_i18n.js';
import { AutoLayoutFields, DEFAULT_AUTO_LAYOUT } from './auto_layout_section.jsx';
import { normalizeAutoLayout } from '../../editor/scene_auto_layout.js';

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
export default function TypeSpecificSections({ object, sections, showDimensions = true, editAndCommit, edit = null, commitNow = null, engine }) {
  const { t } = useI18n();
  const has = section => sections.includes(section);
  const number = (label, key, fallback, min, max) => <label className="block text-[11px]" key={key}>{label}<input className={fieldClass} type="number" aria-label={label} value={object[key] ?? fallback} min={min} max={max} onChange={event => {
    if (event.target.value === '') return;
    const value = Number(event.target.value);
    if (Number.isFinite(value)) editAndCommit({ [key]: Math.max(min, Math.min(max, value)) });
  }} /></label>;
  return <>
    {has('arc') && <StaticSection title={t('editor.props.arc')} storageKey="arc"><div className="grid grid-cols-2 gap-2">{number(t('editor.props.arcStart'), 'arcStart', 0, -360, 360)}{number(t('editor.props.arcSweep'), 'arcSweep', 360, 0.01, 360)}{number(t('editor.props.arcInnerRadius'), 'arcInnerRadius', 0, 0, 0.99)}</div></StaticSection>}
    {(has('layoutGrid') || has('autoLayout')) && (() => {
      const layout = normalizeAutoLayout(object.autoLayout);
      const grid = normalizeLayoutGrid(object.layoutGrid);
      const layoutMode = layout ? layout.direction : grid?.enabled ? 'grid' : 'none';
      const setMode = (mode) => {
        if (mode === 'none') {
          editAndCommit({
            autoLayout: null,
            layoutGrid: grid?.enabled ? { ...grid, enabled: false } : object.layoutGrid,
          });
          return;
        }
        if (mode === 'grid') {
          editAndCommit({
            autoLayout: null,
            layoutGrid: { ...grid, enabled: true },
          });
          return;
        }
        editAndCommit({
          autoLayout: layout ? { ...layout, direction: mode } : { ...DEFAULT_AUTO_LAYOUT, direction: mode },
          layoutGrid: grid?.enabled ? { ...grid, enabled: false } : object.layoutGrid,
        });
      };
      const applyEdit = (patch) => (edit ?? editAndCommit)(patch);
      const modes = ['none', 'vertical', 'horizontal', 'grid'];
      return (
        <StaticSection title={t(layout ? 'editor.autoLayout.title' : 'editor.props.layout')} storageKey="layout">
          {/* Figma's layout mode strip: none / vertical / horizontal / grid. */}
          <div className="flex h-7 items-center gap-0.5 rounded-xl bg-neutral-800 p-0.5">
            {modes.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-label={t(`editor.props.layoutMode.${mode}`)}
                aria-pressed={layoutMode === mode}
                title={t(`editor.props.layoutMode.${mode}`)}
                onClick={() => setMode(mode)}
                className={`flex h-6 flex-1 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
                  layoutMode === mode
                    ? 'bg-black/40 text-white'
                    : 'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200'
                }`}
              >
                <AutoLayoutModeIcon mode={mode} />
              </button>
            ))}
          </div>

          {showDimensions && <div className="grid grid-cols-2 gap-2">
            {[['width', 'W', 'widthMode'], ['height', 'H', 'heightMode']].map(([axis, label, modeKey]) => (
              <div key={axis} className="flex h-7 min-w-0 items-center rounded-xl bg-neutral-800">
                <ScrubField bare className="[&_input]:!px-1" prefix={label} min={1} max={99999} value={Math.round(object[axis] ?? 0)}
                  onValueChange={(value) => applyEdit({ [axis]: value, ...(layout ? { autoLayout: { ...layout, [modeKey]: 'fixed' } } : {}) })}
                  onCommit={commitNow} ariaLabel={label} scrubHint={t('editor.props.dragToAdjust')} />
                {layout && <FlatSelect value={layout[modeKey]}
                  onChange={(mode) => editAndCommit({ autoLayout: { ...layout, [modeKey]: mode } })}
                  label={t(`editor.autoLayout.${modeKey}`)}
                  options={['fixed', 'hug'].map((mode) => ({ value: mode, label: t(mode === 'hug' ? 'editor.autoLayout.hugCompact' : 'editor.sizing.fixed') }))}
                  className="min-w-0 shrink-0"
                  triggerClassName="!h-7 !rounded-none !bg-transparent !px-1 !text-[10px]"
                  portal />}
              </div>
            ))}
          </div>}

          {layoutMode === 'vertical' || layoutMode === 'horizontal' ? (
            <AutoLayoutFields object={object} editAndCommit={editAndCommit} hideDirection hideSizing />
          ) : null}

          {has('clip') ? (
            <label className="flex h-7 items-center gap-2 text-[11px] font-mono text-neutral-300">
              <input
                type="checkbox"
                className="flat-check"
                checked={object.clipContent !== false}
                onChange={(event) => editAndCommit({ clipContent: event.target.checked })}
                aria-label={t('editor.props.clipContent')}
              />
              {t('editor.props.clipContent')}
            </label>
          ) : null}

          {layoutMode === 'grid' ? (() => {
            const patch = (changes) => editAndCommit({ layoutGrid: normalizeLayoutGrid({ ...grid, ...changes }) });
            const field = (label, key, min, max) => (
              <label className="flex min-w-0 items-center gap-1 rounded-xl bg-neutral-800 px-2" key={key}>
                <span className="shrink-0 text-[9px] font-mono uppercase tracking-tight text-neutral-400">{label}</span>
                <ScrubValueInput
                  min={min}
                  max={max}
                  step={1}
                  value={grid[key]}
                  format={(value) => String(value)}
                  onChange={(value) => patch({ [key]: value })}
                  ariaLabel={label}
                  scrubHint={t('editor.props.dragToAdjust')}
                  className="!w-full !border-0 !bg-transparent !px-0 text-right text-[11px]"
                />
              </label>
            );
            return (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={t('editor.props.showGrid')}
                    aria-pressed={grid.enabled}
                    onClick={() => patch({ enabled: !grid.enabled })}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
                  >
                    {grid.enabled ? <IconEye size={13} /> : <IconEyeOff size={13} />}
                  </button>
                  <FlatSelect
                    value={grid.type}
                    onChange={(type) => patch({ type })}
                    label={t('editor.props.gridType')}
                    options={['grid', 'columns', 'rows'].map((type) => ({
                      value: type,
                      label: t(`editor.props.gridType.${type}`),
                    }))}
                    className="min-w-0 flex-1"
                    triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !px-2 !text-[10px] !font-mono !uppercase !text-neutral-100 hover:!bg-neutral-800/80"
                    widthClass="w-full"
                  />
                </div>
                {grid.type === 'grid' ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {field(t('editor.props.gridSize'), 'size', 1, 512)}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {field(t('editor.props.gridCount'), 'count', 1, 64)}
                    {field(t('editor.props.gridGutter'), 'gutter', 0, 512)}
                    {field(t('editor.props.gridMargin'), 'margin', 0, 512)}
                  </div>
                )}
              </div>
            );
          })() : null}
        </StaticSection>
      );
    })()}
    {has('component') && <><StaticSection title={t('editor.props.component')} storageKey="component"><span className="text-[11px]">{object.sourceCanvasId ? `${t('editor.props.mainComponent')}: ${object.sourceCanvasId}` : t('editor.props.mainComponent')}</span></StaticSection><VariantsSection engine={engine} node={object.sourceCanvasId ? object : null} isMainComponent={!object.sourceCanvasId} /></>}
  </>;
}
TypeSpecificSections.propTypes = { object: PropTypes.object.isRequired, sections: PropTypes.arrayOf(PropTypes.string).isRequired, showDimensions: PropTypes.bool, editAndCommit: PropTypes.func.isRequired, engine: PropTypes.object };
