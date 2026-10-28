import { readFileSync } from "node:fs";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import * as nodeBuilders from "../../src/canvas/editor/scene_model_node_builders.js";
import * as adjustments from "../../src/canvas/editor/scene_model_adjustments.js";
import * as textEffects from "../../src/canvas/editor/scene_model_text_effects.js";
import * as geometry from "../../src/canvas/editor/scene_model_geometry.js";
import * as serialization from "../../src/canvas/editor/scene_model_serialization.js";
import * as paths from "../../src/canvas/editor/scene_model_paths.js";
import * as groups from "../../src/canvas/editor/scene_model_groups.js";

const modules = { "node_builders": nodeBuilders, "adjustments": adjustments, "text_effects": textEffects, "geometry": geometry, "serialization": serialization, "paths": paths, "groups": groups };
const expectedPublicApi = {
  "node_builders": {
    "BOOLEAN_OPERATIONS": "object",
    "BOOLEAN_SOURCE_KINDS": "object",
    "booleanSourceOf": 3,
    "canCombine": 1,
    "createAdjustmentNode": 0,
    "createBooleanNode": 2,
    "createEllipseNode": 1,
    "createRectNode": 1,
    "DEFAULT_BRUSH_HARDNESS": "number",
    "DEFAULT_SOFT_BRUSH_HARDNESS": "number",
    "isAdjustmentNode": 1,
    "normalizePathHardness": 1,
    "syncBooleanNode": 2,
  },
  "adjustments": {
    "normalizeAdjustments": 1,
    "normalizeColorBalanceZone": 2,
    "normalizeGradientStops": 2,
    "normalizeHexColor": 2,
    "normalizeInkRow": 2,
    "normalizeMixerRow": 2,
  },
  "text_effects": {
    "createTextNode": 1,
    "normalizeBevel": 1,
    "normalizeColourOrNull": 1,
    "normalizeDropShadow": 1,
    "normalizeEffects": 1,
    "normalizeFill": 1,
    "normalizeGlass": 1,
    "normalizeGradientOverlay": 1,
    "normalizeInnerGlow": 1,
    "normalizeInnerShadow": 1,
    "normalizeOuterGlow": 1,
    "normalizeSatin": 1,
    "normalizeStroke": 1,
    "normalizeTextShadow": 1,
    "normalizeTextStyle": 1,
    "normalizeTexture": 1,
  },
  "geometry": {
    "BASE_DEFAULTS": "object",
    "DEFAULT_PAGE_BACKGROUND": "string",
    "effectivePage": 1,
    "normalizeColorBalanceZone": 2,
    "normalizeGradientStops": 2,
    "normalizeHexColor": 2,
    "normalizeInkRow": 2,
    "normalizeMixerRow": 2,
  },
  "serialization": {
    "colourKeyOf": 1,
    "describeNode": 3,
    "deserialiseDocument": 1,
    "findNode": 2,
    "isFiniteCrop": 3,
    "isReadableNode": 1,
    "nodeRect": 1,
    "normalizeBooleanNode": 1,
    "normalizeNodeName": 1,
    "serialiseDocument": 1,
    "supportsColour": 1,
  },
  "paths": {
    "breakPenPointsAtAnchor": 2,
    "createPathNode": 1,
    "createPenNode": 3,
    "cubicExtrema1D": 4,
    "joinMultiplePenNodes": 1,
    "joinPenNodes": 2,
    "normalisePenAnchor": 1,
    "pathBounds": 2,
    "penAnchorsBounds": 1,
    "reversePenPoints": 1,
    "simplifyPenPoints": 1,
    "smartSmoothPenAnchor": 2,
    "smoothPenPoints": 1,
    "snapHandle45": 1,
    "toggleClosePenPoints": 1,
  },
  "groups": {
    "applyTextCase": 2,
    "booleanChildren": 2,
    "createGroupNode": 1,
    "createRegionNode": 1,
    "DEFAULT_REGION_INTENT": "string",
    "groupChildren": 2,
    "groupDescendants": 2,
    "imageUnderRect": 2,
    "isBooleanNode": 1,
    "isContainerNode": 1,
    "isGroupNode": 1,
    "isHiddenByGroup": 2,
    "isInsideBooleanGroup": 2,
    "isLockedByGroup": 2,
    "isRegionNode": 1,
    "normalizeRegionIntent": 1,
    "normalizeWarpControls": 1,
    "promptLayersOf": 1,
    "REGION_INTENTS": "object",
    "regionName": 1,
    "regionParts": 1,
    "regionsOf": 1,
    "TEXT_CASES": "object",
    "textLines": 1,
    "topLevelGroupOf": 2,
  },
};

const linter = new Linter();
const lintConfig = {
  env: { es2022: true, browser: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  rules: {
    // A map callback keeps its point slot to receive the index. The standard
    // after-used setting preserves that contract without ignoring trailing args.
    "no-unused-vars": ["error", { vars: "all", args: "after-used", caughtErrors: "all" }],
  },
};

describe("scene model unused-code guard", () => {
  it.each(Object.keys(modules))("lints %s with the real no-unused-vars rule and no inline exemptions", (name) => {
    const path = new URL(`../../src/canvas/editor/scene_model_${name}.js`, import.meta.url);
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/eslint-(?:disable|enable)[^\n]*no-unused-vars/);
    expect(linter.verify(source, lintConfig, { allowInlineConfig: false })).toEqual([]);
  });

  it("rejects an unused local even when an inline disable tries to hide it", () => {
    const source = "/* eslint-disable no-unused-vars */\nconst unreferenced = 1;";
    const messages = linter.verify(source, lintConfig, { allowInlineConfig: false });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ ruleId: "no-unused-vars", severity: 2 });
  });

  it("retains every public export, value kind and callable arity", () => {
    const api = Object.fromEntries(Object.entries(modules).map(([name, module]) => [name,
      Object.fromEntries(Object.entries(module).map(([key, value]) => [key,
        typeof value === "function" ? value.length : typeof value,
      ])),
    ]));
    expect(api).toEqual(expectedPublicApi);
  });
});
