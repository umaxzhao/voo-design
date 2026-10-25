import { useEffect, useReducer, useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { InspectorGroup, InspectorRow } from "../inspector_primitives.jsx";
import { componentVariants, variantProperties, parseVariantName, matchVariantProperty, createVariantDocument, extendVariantProperties, switchVariantDocument } from "../../editor/component_variants.js";

// Selected variant values sit on a purple wash, as selected rows do in the agent panel.
const FIELD_CLASS = "h-8 w-full min-w-0 rounded-xl bg-[#E5B2FF]/15 px-2 text-[11px] text-[#eed0ff] outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";
const BUTTON_CLASS = "flex h-8 w-full items-center rounded-xl bg-[#222222] px-3 text-left text-[11px] text-neutral-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40";

export default function VariantsSection({ engine, node = null, sourceDoc = null, isMainComponent = false }) {
  const { t } = useI18n();
  const [, refresh] = useReducer(value => value + 1, 0);
  const [axisName, setAxisName] = useState("");
  const [axisValues, setAxisValues] = useState("");
  const [axisError, setAxisError] = useState(null);
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
      <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-[#1c1c1c] p-1.5">
        <span className="text-[9px] uppercase tracking-[0.14em] text-neutral-400">
          {t("editor.variants.properties")}
        </span>
        {properties?.length ? (
          properties.map(property => (
            <div key={property.key} className="flex items-center justify-between gap-2 text-[10px] font-mono text-neutral-300">
              <span className="truncate">{property.key}</span>
              <span className="shrink-0 text-neutral-400">{property.values.join(" · ")}</span>
            </div>
          ))
        ) : (
          <span className="text-[10px] leading-4 text-neutral-400">{t("editor.variants.noProperties")}</span>
        )}
        <div className="flex items-center gap-1.5">
          <input
            value={axisName}
            onChange={event => setAxisName(event.target.value)}
            placeholder={t("editor.variants.propertyName")}
            aria-label={t("editor.variants.propertyName")}
            className="h-6 min-w-0 flex-1 rounded-lg bg-[#222222] px-2 text-[10px] font-mono text-neutral-200 outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <input
            value={axisValues}
            onChange={event => setAxisValues(event.target.value)}
            placeholder={t("editor.variants.propertyValues")}
            aria-label={t("editor.variants.propertyValues")}
            className="h-6 min-w-0 flex-[1.4] rounded-lg bg-[#222222] px-2 text-[10px] font-mono text-neutral-200 outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <button
            type="button"
            aria-label={t("editor.variants.addProperty")}
            title={t("editor.variants.addProperty")}
            disabled={!axisName.trim() || !axisValues.trim()}
            onClick={() => {
              try {
                const values = axisValues.split(",").map(value => value.trim()).filter(Boolean);
                if (!values.length) throw new Error("empty");
                const existing = Object.fromEntries((properties ?? []).map(property => [property.key, property.values]));
                const next = extendVariantProperties(engine.getDocument(), current, { ...existing, [axisName.trim()]: values });
                engine.setDoc(next.document, { name: t("editor.variants.addProperty") });
                setAxisName("");
                setAxisValues("");
                setAxisError(null);
              } catch (error) {
                setAxisError(error?.message ?? "invalid");
              }
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            +
          </button>
        </div>
        {axisError ? <span className="text-[9px] text-rose-400">{axisError}</span> : null}
        <button type="button" className={BUTTON_CLASS} onClick={() => {
          let index = 2;
          let name;
          do { name = properties ? Object.entries(parseVariantName(current.variantName)).map(([key, value], i) => `${key}=${i === 0 ? `${value} ${index}` : value}`).join(", ") : `${t("editor.variants.variant")} ${index}`; index++; } while (variants.some(doc => doc.variantName === name));
          engine.setDoc(createVariantDocument(engine.getDocument(), engine.getDocument(), name), { name: t("editor.variants.add") });
        }}>{t("editor.variants.add")}</button>
      </div>
    </>}
  </InspectorGroup>;
}
