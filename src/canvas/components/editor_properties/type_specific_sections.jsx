import PropTypes from 'prop-types';
import { StaticSection, fieldClass } from './property_section.jsx';
import VariantsSection from './variants_section.jsx';

/** Controls only appear when the resolver grants their capability. */
export default function TypeSpecificSections({ object, sections, editAndCommit, engine }) {
  const has = section => sections.includes(section);
  const number = (label, key, fallback, min, max) => <label className="block text-[11px]" key={key}>{label}<input className={fieldClass} type="number" aria-label={label} value={object[key] ?? fallback} min={min} max={max} onChange={event => {
    if (event.target.value === '') return;
    const value = Number(event.target.value);
    if (Number.isFinite(value)) editAndCommit({ [key]: Math.max(min, Math.min(max, value)) });
  }} /></label>;
  return <>
    {has('arc') && <StaticSection title="弧线"><div className="grid grid-cols-2 gap-2">{number('起始角度', 'arcStart', 0, -360, 360)}{number('扫过角度', 'arcSweep', 360, 0.01, 360)}{number('内半径比例', 'arcInnerRadius', 0, 0, 0.99)}</div></StaticSection>}
    {has('clip') && <StaticSection title="画框"><label className="text-[11px]"><input type="checkbox" checked={object.clipContent !== false} onChange={event => editAndCommit({ clipContent: event.target.checked })} /> 裁剪内容</label></StaticSection>}
    {has('layoutGrid') && <StaticSection title="布局网格"><label className="text-[11px]"><input type="checkbox" checked={Boolean(object.layoutGrid?.enabled)} onChange={event => editAndCommit({ layoutGrid: { size: 8, ...object.layoutGrid, enabled: event.target.checked } })} /> 显示网格</label><input aria-label="网格大小" className={fieldClass} type="number" min="1" max="512" value={object.layoutGrid?.size ?? 8} onChange={event => editAndCommit({ layoutGrid: { ...object.layoutGrid, size: Math.max(1, Math.min(512, Number(event.target.value))) } })} /></StaticSection>}
    {has('component') && <><StaticSection title="组件"><span className="text-[11px]">{object.sourceCanvasId ? `主组件: ${object.sourceCanvasId}` : '主组件'}</span></StaticSection><VariantsSection engine={engine} node={object.sourceCanvasId ? object : null} isMainComponent={!object.sourceCanvasId} /></>}
    {has('export') && <StaticSection title="导出"><button type="button" className={fieldClass} onClick={() => {
      const url = engine?.exportSelectionPng?.([object.id]) ?? engine?.exportNodePng?.(object.id);
      if (!url) return;
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${object.name || object.kind}.png`; anchor.click();
    }}>导出 PNG</button></StaticSection>}
  </>;
}
TypeSpecificSections.propTypes = { object: PropTypes.object.isRequired, sections: PropTypes.arrayOf(PropTypes.string).isRequired, editAndCommit: PropTypes.func.isRequired, engine: PropTypes.object };
