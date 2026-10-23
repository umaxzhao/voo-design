import { useEffect, useReducer } from "react";
import { useI18n } from "../../use_i18n.js";
import { InspectorGroup, InspectorRow } from "../inspector_primitives.jsx";
import { componentVariants, variantProperties, parseVariantName, matchVariantProperty, createVariantDocument, switchVariantDocument } from "../../editor/component_variants.js";

const FIELD_CLASS = "h-8 w-full min-w-0 rounded-xl bg-[#222222] px-2 text-[11px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";
const BUTTON_CLASS = "flex h-8 w-full items-center rounded-xl bg-[#222222] px-3 text-left text-[11px] text-neutral-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40";

export default function VariantsSection({ engine, node = null, sourceDoc = null, isMainComponent = false }) {
  const { t } = useI18n();
  const [, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => engine?.subscribeRender?.(refresh, { documentOnly: true }), [engine]);
  const host = engine?.getDocument?.();
  if (!host) return null;
  const source = node ? host.components?.[node.sourceCanvasId] ?? sourceDoc : host;
  if (!source || (!node && !isMainComponent && !source.isComponent && !source.variantGroupId)) return null;
  const variants = componentVariants(host, source);
  const current = variants.find(doc => doc.canvasId === (node?.sourceCanvasId ?? host.canvasId)) ?? source;
  const properties = variantProperties(variants);
  const switchTo = target => {
    if (target) engine.setDoc(switchVariantDocument({ ...engine.getDocument(), components: { ...engine.getDocument().components, ...Object.fromEntries(variants.map(doc => [doc.canvasId, doc])) } }, node.id, target), { name: t("editor.variants.change") });
  };
  return <InspectorGroup title={t("editor.variants.title")} testId="editor-variants-section">
    {node ? properties ? properties.map(({ key, values }) => <InspectorRow key={key} label={key}>
      <select className={FIELD_CLASS} aria-label={key} value={parseVariantName(current.variantName)?.[key] ?? ""} onChange={event => switchTo(matchVariantProperty(variants, current, key, event.target.value))}>
        {values.map(value => <option key={value} value={value} disabled={!matchVariantProperty(variants, current, key, value)}>{value}</option>)}
      </select>
    </InspectorRow>) : <InspectorRow label={t("editor.variants.variant")}>
      <select className={FIELD_CLASS} aria-label={t("editor.variants.variant")} value={current.canvasId} onChange={event => switchTo(variants.find(doc => doc.canvasId === event.target.value))}>
        {variants.map(doc => <option key={doc.canvasId} value={doc.canvasId}>{doc.variantName ?? doc.name ?? t("editor.variants.default")}</option>)}
      </select>
    </InspectorRow> : <>
      <InspectorRow label={t("editor.variants.set")}><span className="text-[11px] text-neutral-300">{source.name ?? source.variantGroupId ?? t("editor.variants.default")}</span></InspectorRow>
      {variants.map(doc => <InspectorRow key={doc.canvasId} label={doc.variantName ?? t("editor.variants.default")}><span className="text-[11px] text-neutral-300">{doc.name}</span></InspectorRow>)}
      <button type="button" className={BUTTON_CLASS} onClick={() => {
        let index = 2;
        let name;
        do { name = properties ? Object.entries(parseVariantName(current.variantName)).map(([key, value], i) => `${key}=${i === 0 ? `${value} ${index}` : value}`).join(", ") : `${t("editor.variants.variant")} ${index}`; index++; } while (variants.some(doc => doc.variantName === name));
        engine.setDoc(createVariantDocument(engine.getDocument(), engine.getDocument(), name), { name: t("editor.variants.add") });
      }}>{t("editor.variants.add")}</button>
    </>}
  </InspectorGroup>;
}
