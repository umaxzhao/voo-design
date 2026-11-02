/**
 * Category model for the asset-library page's local mode.
 *
 * The local tab is the user's own material collection — files they imported,
 * never generation results — so imports are registered with the "import"
 * platform marker and the page asks the store for that subset. Within it the
 * secondary nav splits by media type. Kept free of React and IndexedDB so it
 * can be tested under plain node.
 */

/** Platform marker stored on user-imported rows (never a real chat source). */
export const IMPORT_PLATFORM = "import";

/** Built-in secondary-nav categories of the local tab, in display order. */
export const MEDIA_CATEGORIES = ["all", "images", "videos", "audio"];

export const CUSTOM_CATEGORIES_STORAGE_KEY = "voo_local_custom_categories";
export const ASSET_CATEGORIES_STORAGE_KEY = "voo_local_asset_categories";

/**
 * Load user-defined custom categories from storage.
 * @returns {Array<{ id: string, name: string }>}
 */
export function loadCustomCategories() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save user-defined custom categories to storage.
 * @param {Array<{ id: string, name: string }>} categories
 */
export function saveCustomCategories(categories) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      CUSTOM_CATEGORIES_STORAGE_KEY,
      JSON.stringify(categories),
    );
  } catch {
    // Ignore storage quota errors.
  }
}

/**
 * Load mapping of assetId -> categoryId from storage.
 * @returns {Record<string, string>}
 */
export function loadAssetCategoryMap() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(ASSET_CATEGORIES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Save mapping of assetId -> categoryId to storage.
 * @param {Record<string, string>} map
 */
export function saveAssetCategoryMap(map) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ASSET_CATEGORIES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors.
  }
}

/**
 * Keeps the assets of one media or custom category.
 *
 * @param {Array<{id: string, video?: boolean, audio?: boolean}>} assets
 * @param {string} category
 * @param {Record<string, string>} [assetCategoryMap]
 */
export function filterAssetsByMedia(assets, category, assetCategoryMap = {}) {
  if (!category || category === "all") return assets;
  if (category === "videos") return assets.filter((asset) => asset.video);
  if (category === "audio") return assets.filter((asset) => asset.audio);
  if (category === "images") {
    return assets.filter((asset) => !asset.video && !asset.audio);
  }
  if (category === "uncategorized") {
    return assets.filter((asset) => !assetCategoryMap[asset.id]);
  }
  return assets.filter((asset) => assetCategoryMap[asset.id] === category);
}
