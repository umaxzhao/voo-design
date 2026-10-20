// Registry costs: pricing normalization, cost estimation, and model selection.

import { useUserStore } from "../../store/user_store.js";
import { ToolRegistryCore } from "./tool-registry-core.js";

export function extractPricingItems(pricing) {
  if (!pricing) return [];
  if (Array.isArray(pricing)) return pricing;
  if (Array.isArray(pricing.items)) return pricing.items;
  if (typeof pricing === "object") {
    const modelsObj =
      pricing.models && typeof pricing.models === "object"
        ? pricing.models
        : pricing;
    return Object.entries(modelsObj).map(([modelKey, val]) => {
      if (typeof val === "number")
        return { model: modelKey, priceCredits: val };
      if (val && typeof val === "object") {
        return {
          model: val.model || val.Model || modelKey,
          unit: val.unit || val.Unit,
          priceCredits: Number(
            val.priceCredits ??
              val.PriceCredits ??
              val.credits ??
              val.rate ??
              val.cost ??
              val.price ??
              0,
          ),
        };
      }
      return { model: modelKey, priceCredits: 0 };
    });
  }
  return [];
}

export class ToolRegistryCosts extends ToolRegistryCore {
  estimateToolCostDetails(toolName, args = {}, options = {}) {
    const caps = this.getCapabilities(toolName);
    const pricing =
      options?.pricingTable ||
      this._pricingTable ||
      (typeof useUserStore === "function"
        ? useUserStore.getState()?.creditsPricing
        : null);
    const items = extractPricingItems(pricing);
    const requestedModel = args.model || args.engine;
    const findItem = (targetUnit, targetModel) => {
      if (!items.length) return null;
      const tm = (targetModel || "").toLowerCase();
      const tu = (targetUnit || "").toLowerCase();
      if (tm && tu) {
        const exact = items.find(
          (i) =>
            (i.model || i.Model || "").toLowerCase() === tm &&
            (i.unit || i.Unit || "").toLowerCase() === tu,
        );
        if (exact) return exact;
      }
      if (tm) {
        const modelMatch = items.find(
          (i) => (i.model || i.Model || "").toLowerCase() === tm,
        );
        if (modelMatch) return modelMatch;
      }
      if (tu) {
        const unitMatch = items.find(
          (i) => (i.unit || i.Unit || "").toLowerCase() === tu,
        );
        if (unitMatch) return unitMatch;
      }
      return null;
    };
    if (toolName === "generate_image" || toolName === "edit_generated_image") {
      const count = Math.max(
        1,
        Number(args.n || args.count || args.images || 1),
      );
      const model = requestedModel || "flux-schnell";
      const item = findItem("image", model);
      if (item) {
        const unitPrice = Number(
          item.priceCredits ??
            item.PriceCredits ??
            item.credits ??
            item.rate ??
            item.cost ??
            item.price ??
            0,
        );
        return {
          cost: unitPrice * count,
          estimated: false,
          unit: "image",
          model: item.model || item.Model || model,
        };
      }
    }
    if (toolName === "generate_video") {
      const duration = Math.max(1, Number(args.duration || args.seconds || 5));
      const model = requestedModel || "wan-2.1-t2v-720p";
      const item = findItem("second", model) || findItem("video", model);
      if (item) {
        const unitPrice = Number(
          item.priceCredits ?? item.PriceCredits ?? item.price ?? 0,
        );
        const unit = (item.unit || item.Unit || "").toLowerCase();
        return {
          cost: unit === "second" ? unitPrice * duration : unitPrice,
          estimated: false,
          unit,
          model: item.model || item.Model || model,
        };
      }
    }
    if (toolName === "chat_completion" || args.estimatedTokens || args.tokens) {
      const tokens = Number(args.estimatedTokens || args.tokens || 1000);
      const model = requestedModel || "deepseek-chat";
      const item = findItem("1k_tokens", model) || findItem("token", model);
      if (item) {
        const unitPrice = Number(
          item.priceCredits ?? item.PriceCredits ?? item.price ?? 0,
        );
        const unit = (item.unit || item.Unit || "").toLowerCase();
        const cost = unit.includes("1k")
          ? Math.ceil((tokens / 1000) * unitPrice)
          : Math.ceil(tokens * unitPrice);
        return {
          cost,
          estimated: false,
          unit,
          model: item.model || item.Model || model,
        };
      }
    }
    if (requestedModel) {
      const item = findItem(null, requestedModel);
      if (item) {
        const unitPrice = Number(
          item.priceCredits ?? item.PriceCredits ?? item.price ?? 0,
        );
        return {
          cost: unitPrice,
          estimated: false,
          unit: item.unit || item.Unit || null,
          model: item.model || item.Model || requestedModel,
        };
      }
    }
    let fallbackCost = 0;
    let costUnknown = false;
    if (caps) {
      const est = caps.estimatedCost;
      if (typeof est === "function") {
        try {
          const rawCost = est(args);
          const normalizedCost = Number(rawCost);
          if (rawCost == null || !Number.isFinite(normalizedCost)) {
            costUnknown = true;
          } else {
            fallbackCost = normalizedCost;
          }
        } catch {
          costUnknown = true;
        }
      } else if (est == null || !Number.isFinite(Number(est))) {
        costUnknown = true;
      } else {
        fallbackCost = Number(est);
      }
    }
    return {
      cost: costUnknown ? null : fallbackCost,
      estimated: !costUnknown && fallbackCost > 0,
      costUnknown,
      externalWebsiteCostUnknown: caps?.externalWebsiteCost === "unknown",
      unit: null,
      model: requestedModel || null,
    };
  }

  estimateToolCost(toolName, args = {}, options = {}) {
    const details = this.estimateToolCostDetails(
      toolName,
      args,
      typeof options === "object" && options !== null ? options : {},
    );
    return options === true ||
      (typeof options === "object" && options?.detailed)
      ? details
      : details.cost;
  }
}

export function findCheaperModel(pricingTable, toolName, currentModel) {
  const items = extractPricingItems(pricingTable);
  const targetUnit = toolName === "generate_video" ? "second" : "image";
  const candidates = items.filter((i) => {
    const unit = (i.unit || i.Unit || "").toLowerCase();
    return (
      !unit ||
      unit === targetUnit ||
      (targetUnit === "second" && unit === "video")
    );
  });
  if (candidates.length === 0)
    return toolName === "generate_video" ? "wan-2.1-t2v-720p" : "flux-schnell";
  candidates.sort(
    (a, b) =>
      Number(a.priceCredits ?? a.PriceCredits ?? a.credits ?? a.rate ?? 0) -
      Number(b.priceCredits ?? b.PriceCredits ?? b.credits ?? b.rate ?? 0),
  );
  const cheaper = candidates.find((c) => {
    const model = c.model || c.Model;
    return model && model.toLowerCase() !== (currentModel || "").toLowerCase();
  });
  return cheaper
    ? cheaper.model || cheaper.Model
    : candidates[0].model || candidates[0].Model;
}
