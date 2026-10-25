import ToolPropertiesSection from './tool_properties_section.jsx';
import PropTypes from 'prop-types';
import { useRef } from 'react';
import { useI18n } from '../../use_i18n.js';
import { normalizeAdjustments } from '../../editor/scene_model.js';

/** Affinity-style canvas context bar; deliberately outside the floating panel. */
export default function RasterContextToolbar({ context, object, engine, editAndCommit, toolProps }) {
  const input = useRef(null);
  const frequencyRadius = useRef(null);
  const frequencyStatus = useRef(null);
  const { t } = useI18n();
  if (!context.topBar) return null;
  const applyFrequencySeparation = async () => {
    try {
      await engine?.frequencySeparateSelected?.(object.id, Number(frequencyRadius.current?.value));
      if (frequencyStatus.current) frequencyStatus.current.textContent = "";
    } catch (error) {
      const key = typeof error?.message === "string" && error.message.startsWith("editor.frequencySeparation.error.")
        ? error.message
        : "editor.frequencySeparation.error.generic";
      if (frequencyStatus.current) frequencyStatus.current.textContent = t(key);
    }
  };
  return <div role="toolbar" aria-label="Image context" data-testid="image-context-toolbar" className="absolute inset-x-20 top-16 z-30 flex flex-wrap items-center gap-3 rounded-lg bg-neutral-950 px-3 py-2 text-xs text-neutral-200">
    {toolProps && <details><summary>{t('editor.toolOptions')}</summary><div className="absolute top-full max-h-[60vh] w-80 overflow-auto rounded-lg bg-neutral-950 p-3"><ToolPropertiesSection tool={context.topBar} {...toolProps} /></div></details>}
    <span>{context.topBar === 'image' ? t('editor.context.image') : t(['marquee', 'lasso', 'wand', 'region', 'select_region', 'ai_select'].includes(context.topBar) ? 'editor.tool.selection' : `editor.tool.${context.topBar}`)}</span>
    <button type="button" onClick={() => engine?.setTool?.('crop')}>{t('editor.taskbar.crop')}</button>
    {object?.kind === 'image' && <>
      <button type="button" onClick={() => input.current?.click()}>{t('editor.taskbar.replace')}</button>
      <label className="flex items-center gap-1" htmlFor="frequency-separation-radius">
        {t("editor.frequencySeparation.radius")}
        <input ref={frequencyRadius} id="frequency-separation-radius" type="number" min="1" max="100" defaultValue="10" className="w-14 rounded-lg bg-neutral-900 px-1 py-0.5" />
      </label>
      <button type="button" onClick={applyFrequencySeparation}>
        {t("editor.frequencySeparation.action")}
      </button>
      <span ref={frequencyStatus} role="status" aria-live="polite" />
      <input ref={input} hidden type="file" accept="image/*" onChange={async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => engine?.replaceNodeBitmap?.(object.id, reader.result);
        reader.readAsDataURL(file);
        event.target.value = '';
      }} />
      <details><summary>{t('editor.taskbar.adjust')}</summary><div className="absolute top-full rounded-lg bg-neutral-950 p-3">{['brightness', 'contrast'].map(kind => <label key={kind} className="block">{t(`editor.adjust.${kind}`)}<input aria-label={kind} type="range" min="-100" max="100" value={normalizeAdjustments(object.adjustments)[kind].value} onChange={event => editAndCommit({ adjustments: { ...normalizeAdjustments(object.adjustments), [kind]: { enabled: true, value: Number(event.target.value) } } })} /></label>)}</div></details>
      <select aria-label="Fit / Fill" defaultValue="" onChange={event => {
        const doc = engine?.getDocument?.();
        const parent = doc?.nodes?.find(node => node.id === object.parentId) ?? doc;
        if (!parent?.width || !parent?.height || !object.width || !object.height) return;
        const scale = Math[event.target.value === 'fit' ? 'min' : 'max'](parent.width / object.width, parent.height / object.height);
        const width = object.width * scale, height = object.height * scale;
        editAndCommit({ width, height, x: (parent.x ?? 0) + (parent.width - width) / 2, y: (parent.y ?? 0) + (parent.height - height) / 2 });
        event.target.value = '';
      }} className="bg-neutral-900"><option value="" disabled>{t('editor.image.fitFill')}</option><option value="fit">{t('editor.image.fit')}</option><option value="fill">{t('editor.image.fill')}</option></select>
    </>}
  </div>;
}
RasterContextToolbar.propTypes = { toolProps: PropTypes.object, context: PropTypes.object.isRequired, object: PropTypes.object, engine: PropTypes.object, editAndCommit: PropTypes.func.isRequired };
