/**
 * Curated local models and brand metadata.
 *
 * Shared between electron local engine catalog and frontend settings UI
 * so that both desktop and web clients can display the brand-grouped
 * model library consistently.
 */

export const CURATED_LOCAL_MODELS = [
  {
    id: "qwen-image-2.1-q4",
    label: "Qwen Image 2.1 (Q4)",
    brand: "Qwen",
    brandId: "qwen",
    capabilities: ["image-generation", "image-edit"],
    license: "Qwen Research License",
    licenseUrl: "https://github.com/QwenLM/Qwen-Image-2.1/blob/main/LICENSE",
    size: "11.1 GB",
    sizeBytes: 11_100_000_000,
    hfRepo: "leejet/Qwen-Image-2.1-GGUF",
    descriptionKey: "settings.localCapability.qwenImageDesc",
  },
  {
    id: "wan22-ti2v-5b-q2",
    label: "Wan 2.1 TI2V (5B Q2)",
    brand: "Qwen",
    brandId: "qwen",
    capabilities: ["video-generation"],
    license: "Apache-2.0",
    licenseUrl: "https://huggingface.co/QuantStack/Wan2.2-TI2V-5B-GGUF",
    size: "6.3 GB",
    sizeBytes: 6_320_000_000,
    hfRepo: "QuantStack/Wan2.2-TI2V-5B-GGUF",
    descriptionKey: "settings.localCapability.wanDesc",
  },
  {
    id: "ltx-video-2b",
    label: "LTX-Video 2.1 (0.9B/2B Fast)",
    brand: "Lightricks",
    brandId: "ltx",
    capabilities: ["video-generation"],
    license: "OpenRAIL-M",
    licenseUrl: "https://huggingface.co/Lightricks/LTX-Video",
    size: "4.8 GB",
    sizeBytes: 4_800_000_000,
    hfRepo: "city96/LTX-Video-gguf",
    descriptionKey: "settings.localCapability.ltxDesc",
  },
  {
    id: "minimax-h3-pruned-q4",
    label: "MiniMax H3 (Video + Audio)",
    brand: "MiniMax",
    brandId: "minimax",
    capabilities: ["video-generation", "audio-generation"],
    license: "MiniMax-H3 Community License",
    licenseUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3",
    size: "30.3 GB",
    sizeBytes: 30_340_000_000,
    hfRepo: "Comfy-Org/MiniMax-H3",
    descriptionKey: "settings.localCapability.minimaxDesc",
  },
];

export const LOCAL_MODEL_BRANDS = [
  {
    id: "all",
    labelKey: "settings.localBrand.all",
  },
  {
    id: "qwen",
    brandName: "Qwen",
    labelKey: "settings.localBrand.qwen",
    logoId: "qwen",
    descriptionKey: "settings.localBrand.qwenDesc",
  },
  {
    id: "ltx",
    brandName: "Lightricks",
    labelKey: "settings.localBrand.lightricks",
    logoId: "lightricks",
    descriptionKey: "settings.localBrand.lightricksDesc",
  },
  {
    id: "minimax",
    brandName: "MiniMax",
    labelKey: "settings.localBrand.minimax",
    logoId: "minimax",
    descriptionKey: "settings.localBrand.minimaxDesc",
  },
];
