/**
 * Inspect panel (Figma Dev Mode-style): geometry, spacing to the parent,
 * appearance, typography, bound tokens, and copyable CSS/Tailwind for the
 * selected layer. Read-only: every mutation stays in the normal properties
 * sections, this view measures and hands off.
 */

import PropTypes from "prop-types";
import { useMemo, useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { normalizeStyles } from "../../editor/scene_styles.js";
import {
  inspectCss,
  inspectNumber,
  inspectTailwind,
} from "../../editor/inspect_code.js";
import { resolveCodeSnippet } from "../../codegen/code_connect.js";
import { HEX_COLOUR, NONE_PATTERN } from "./colour_swatch.jsx";

function Row({ label, value, mono = true }) {
  return (
    <div className="flex h-7 items-center justify-between gap-2 rounded-xl bg-neutral-800 px-2.5">
      <span className="shrink-0 text-[9px] font-mono uppercase tracking-tight text-neutral-400">
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right text-[11px] ${mono ? "font-mono tabular-nums" : ""} text-neutral-100`}
      >
        {value}
      </span>
    </div>
  );
}

Row.propTypes = { label: PropTypes.string, value: PropTypes.node, mono: PropTypes.bool };

function Group({ title, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-[9px] font-mono uppercase tracking-[0.14em] text-neutral-400">
        {title}
      </span>
      {children}
    </div>
  );
}

Group.propTypes = { title: PropTypes.string, children: PropTypes.node };

function spacingRows(node, parent) {
  if (!node || !parent) return null;
  const width = Number(parent.width) || 0;
  const height = Number(parent.height) || 0;
  const left = Number(node.x) - Number(parent.x);
  const top = Number(node.y) - Number(parent.y);
  const right = width - (left + (Number(node.width) || 0));
  const bottom = height - (top + (Number(node.height) || 0));
  return { left, top, right, bottom };
}

export default function InspectPanel({
  object,
  parentNode = null,
  engine = null,
  onClose = null,
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(null);

  const css = useMemo(() => inspectCss(object), [object]);
  const tailwind = useMemo(() => inspectTailwind(object), [object]);
  const spacing = spacingRows(object, parentNode);

  const doc = engine?.getDocument?.();
  const componentDoc = object?.sourceCanvasId
    ? doc?.components?.[object.sourceCanvasId] ?? null
    : null;
  const codeConnect = useMemo(
    () => resolveCodeSnippet(object, componentDoc),
    [object, componentDoc],
  );
  const boundVariable = object?.fillVariableId
    ? (doc?.variablesV2?.collections ?? [])
        .flatMap((collection) => collection.variables ?? [])
        .find((variable) => variable.id === object.fillVariableId)
    : null;
  const boundStyle = object?.styleIds?.paintId
    ? normalizeStyles(doc?.styles).paint.find(
        (style) => style.id === object.styleIds.paintId,
      )
    : null;

  const copy = async (kind, text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1200);
  };

  if (!object) return null;
  const isText = object.kind === "text";
  const fill =
    Array.isArray(object.fills) && object.fills.length
      ? object.fills[0]?.fill
      : object.fill;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-neutral-300">
          {t("editor.inspect.title")}
        </span>
        {onClose ? (
          <button
            type="button"
            aria-label={t("editor.inspect.close")}
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            ×
          </button>
        ) : null}
      </div>

      <Group title={t("editor.inspect.geometry")}>
        <Row label="X" value={inspectNumber(object.x, "px")} />
        <Row label="Y" value={inspectNumber(object.y, "px")} />
        <Row label="W" value={inspectNumber(object.width, "px")} />
        <Row label="H" value={inspectNumber(object.height, "px")} />
        {object.rotation ? (
          <Row label={t("editor.props.rotation")} value={inspectNumber(object.rotation, "°")} />
        ) : null}
        <Row label={t("editor.props.opacity")} value={inspectNumber((object.opacity ?? 1) * 100, "%")} />
      </Group>

      {spacing ? (
        <Group title={t("editor.inspect.spacing")}>
          <Row label="←" value={inspectNumber(spacing.left, "px")} />
          <Row label="→" value={inspectNumber(spacing.right, "px")} />
          <Row label="↑" value={inspectNumber(spacing.top, "px")} />
          <Row label="↓" value={inspectNumber(spacing.bottom, "px")} />
        </Group>
      ) : null}

      <Group title={t("editor.inspect.appearance")}>
        <div className="flex h-7 items-center justify-between gap-2 rounded-xl bg-neutral-800 px-2.5">
          <span className="text-[9px] font-mono uppercase tracking-tight text-neutral-400">
            {t("editor.props.fill")}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              role="img"
              aria-label={t("editor.props.fill")}
              className="block h-5 w-5 shrink-0 overflow-hidden rounded-md border border-white/10"
              style={{
                background: typeof fill === "string" &&
                  (HEX_COLOUR.test(fill) || fill.includes("-gradient"))
                  ? fill
                  : NONE_PATTERN,
              }}
            />
            <span className="truncate text-[11px] font-mono uppercase text-neutral-100">
              {typeof fill === "string" && fill !== "transparent" ? fill.toUpperCase() : "—"}
            </span>
          </span>
        </div>
        {object.stroke && object.stroke !== "transparent" ? (
          <Row
            label={t("editor.props.stroke")}
            value={`${object.stroke.toUpperCase()} · ${inspectNumber(object.strokeWidth ?? 1, "px")}`}
          />
        ) : null}
        {object.cornerRadius ? (
          <Row label={t("editor.props.cornerRadius")} value={inspectNumber(object.cornerRadius, "px")} />
        ) : null}
      </Group>

      {isText ? (
        <Group title={t("editor.inspect.typography")}>
          {object.fontFamily ? <Row label={t("editor.props.fontFamily")} value={object.fontFamily} /> : null}
          <Row label={t("editor.props.fontSize")} value={inspectNumber(object.fontSize, "px")} />
          <Row label={t("editor.props.fontWeight")} value={String(object.fontWeight ?? "—")} />
          {object.lineHeight ? (
            <Row label={t("editor.props.lineHeight")} value={inspectNumber(object.lineHeight)} />
          ) : null}
          {object.letterSpacing ? (
            <Row label={t("editor.props.letterSpacing")} value={inspectNumber(object.letterSpacing, "px")} />
          ) : null}
        </Group>
      ) : null}

      <Group title={t("editor.inspect.tokens")}>
        <Row
          label={t("editor.inspect.variable")}
          value={boundVariable?.name ?? "—"}
          mono={Boolean(boundVariable)}
        />
        <Row
          label={t("editor.inspect.style")}
          value={boundStyle?.name ?? "—"}
          mono={Boolean(boundStyle)}
        />
      </Group>

      {codeConnect ? (
        <Group title={t("editor.inspect.codeConnect")}>
          <pre className="max-h-40 overflow-auto rounded-xl bg-neutral-900 p-2 text-[10px] leading-4 text-[#a7ffd4]">
            <code>{codeConnect.code}</code>
          </pre>
          <button
            type="button"
            onClick={() => copy("codeConnect", codeConnect.code)}
            className="flex min-h-7 w-full items-center justify-center rounded-xl bg-white/[0.08] text-[10px] font-mono text-neutral-200 transition-colors hover:bg-white/[0.14]"
          >
            {copied === "codeConnect"
              ? t("editor.inspect.copied")
              : t("editor.inspect.copyCode")}
          </button>
        </Group>
      ) : null}

      <Group title={t("editor.inspect.code")}>
        <pre className="max-h-40 overflow-auto rounded-xl bg-neutral-900 p-2 text-[10px] leading-4 text-neutral-300">
          <code>{css}</code>
        </pre>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => copy("css", css)}
            className="flex min-h-7 items-center justify-center rounded-xl bg-white/[0.08] text-[10px] font-mono text-neutral-200 transition-colors hover:bg-white/[0.14]"
          >
            {copied === "css" ? t("editor.inspect.copied") : t("editor.inspect.copyCss")}
          </button>
          <button
            type="button"
            onClick={() => copy("tailwind", tailwind)}
            className="flex min-h-7 items-center justify-center rounded-xl bg-white/[0.08] text-[10px] font-mono text-neutral-200 transition-colors hover:bg-white/[0.14]"
          >
            {copied === "tailwind" ? t("editor.inspect.copied") : t("editor.inspect.copyTailwind")}
          </button>
        </div>
      </Group>
    </div>
  );
}

InspectPanel.propTypes = {
  object: PropTypes.object,
  parentNode: PropTypes.object,
  engine: PropTypes.object,
  onClose: PropTypes.func,
};
