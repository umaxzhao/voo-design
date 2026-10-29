import PropTypes from "prop-types";
import { useState } from "react";
import { hexToRgb, rgbToHex } from "./color_math.js";
import {
  COLOUR_MODELS,
  formatCssColour,
  hslToRgb,
  parseCssColour,
  rgbToHsl,
} from "./color_models.js";
import { useI18n } from "../use_i18n.js";
import CustomSelect from "../components/custom_select.jsx";

const FIELD_CLASS =
  "flex items-center rounded-lg border border-white/10 bg-black/40 px-1 py-0.5 focus-within:border-[#a7ffd4]/40";
const INPUT_CLASS =
  "w-full min-w-0 bg-transparent font-mono text-white outline-none";

/** Channel definitions per numeric model: label, upper bound. */
const CHANNELS = {
  RGB: [
    { key: "r", label: "R", max: 255 },
    { key: "g", label: "G", max: 255 },
    { key: "b", label: "B", max: 255 },
  ],
  HSL: [
    { key: "h", label: "H", max: 360 },
    { key: "s", label: "S", max: 100 },
    { key: "l", label: "L", max: 100 },
  ],
  HSB: [
    { key: "h", label: "H", max: 360 },
    { key: "s", label: "S", max: 100 },
    { key: "v", label: "B", max: 100 },
  ],
};

/**
 * A number input that shows exactly what the user typed while focused (so a
 * lossy round trip such as hex to hsl never rewrites the digits under the
 * caret) and falls back to the live channel value otherwise.
 */
function ChannelField({ label, ariaLabel, value, max, onCommit }) {
  const [draft, setDraft] = useState(null);
  return (
    <div className={FIELD_CLASS}>
      <span className="text-[9px] uppercase text-neutral-500">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        aria-label={ariaLabel}
        value={draft ?? value}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const num = Number(text);
          if (text !== "" && Number.isFinite(num)) {
            onCommit(Math.max(0, Math.min(max, Math.round(num))));
          }
        }}
        onBlur={() => setDraft(null)}
        className={`${INPUT_CLASS} text-center`}
      />
    </div>
  );
}

ChannelField.propTypes = {
  label: PropTypes.string.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  onCommit: PropTypes.func.isRequired,
};

/** A text field that commits a parsed colour on blur or Enter; bad text snaps back. */
function TextColourField({ shown, ariaLabel, prefix = null, upper = false, parse, onCommit }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft !== null) {
      const hex = parse(draft);
      if (hex) onCommit(hex);
    }
    setDraft(null);
  };
  return (
    <div className={`${FIELD_CLASS} flex-1`}>
      {prefix ? <span className="text-neutral-500">{prefix}</span> : null}
      <input
        type="text"
        spellCheck={false}
        aria-label={ariaLabel}
        value={draft ?? shown}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className={`${INPUT_CLASS} px-1 ${upper ? "uppercase" : ""}`}
      />
    </div>
  );
}

TextColourField.propTypes = {
  shown: PropTypes.string.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  prefix: PropTypes.string,
  upper: PropTypes.bool,
  parse: PropTypes.func.isRequired,
  onCommit: PropTypes.func.isRequired,
};

/**
 * Colour model dropdown (RGB / HEX / CSS / HSL / HSB) plus the inputs for the
 * chosen model. All models read from and write to the same hex, so they stay
 * in step with the wheel; HSB edits go through `onChangeHsv` to keep the hue
 * of greys that hex alone cannot remember.
 */
export function ColorModelInputs({
  hex,
  hsv,
  onChangeHex,
  onChangeHsv,
  defaultModel = "HEX",
}) {
  const { t } = useI18n();
  const [model, setModel] = useState(defaultModel);
  const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 };

  const values = { RGB: rgb, HSL: rgbToHsl(rgb), HSB: hsv };
  const applyChannel = (key, num) => {
    if (model === "RGB") onChangeHex(rgbToHex({ ...rgb, [key]: num }));
    else if (model === "HSL") {
      onChangeHex(rgbToHex(hslToRgb({ ...values.HSL, [key]: num })));
    } else onChangeHsv({ ...hsv, [key]: num });
  };
  const parseHexText = (text) => parseCssColour(text.replace(/^#?/, "#"));

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[11px]">
      <CustomSelect
        value={model}
        onChange={(event) => setModel(event.target.value)}
        aria-label={t("editor.colorPicker.colourModel")}
        data-testid="colour-model-select"
        rootClassName="shrink-0 !w-auto"
        className="h-6 shrink-0 cursor-pointer rounded-lg bg-white/5 px-1 text-neutral-300 outline-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      >
        {COLOUR_MODELS.map((name) => (
          <option key={name} value={name} className="bg-neutral-900">
            {name}
          </option>
        ))}
      </CustomSelect>

      {model === "HEX" ? (
        <TextColourField
          shown={hex.replace("#", "").slice(0, 6)}
          prefix="#"
          upper
          ariaLabel={t("editor.props.customColour")}
          parse={parseHexText}
          onCommit={onChangeHex}
        />
      ) : null}
      {model === "CSS" ? (
        <TextColourField
          shown={formatCssColour(hex)}
          ariaLabel={t("editor.colorPicker.cssValue")}
          parse={parseCssColour}
          onCommit={onChangeHex}
        />
      ) : null}
      {CHANNELS[model] ? (
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
          {CHANNELS[model].map(({ key, label, max }) => (
            <ChannelField
              key={`${model}-${key}`}
              label={label}
              max={max}
              value={Math.round(values[model][key])}
              ariaLabel={t("editor.colorPicker.channel", { model, channel: label })}
              onCommit={(num) => applyChannel(key, num)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

ColorModelInputs.propTypes = {
  hex: PropTypes.string.isRequired,
  hsv: PropTypes.shape({
    h: PropTypes.number.isRequired,
    s: PropTypes.number.isRequired,
    v: PropTypes.number.isRequired,
  }).isRequired,
  onChangeHex: PropTypes.func.isRequired,
  onChangeHsv: PropTypes.func.isRequired,
  /** Model shown first; the user's dropdown choice then takes over. */
  defaultModel: PropTypes.oneOf(COLOUR_MODELS),
};
