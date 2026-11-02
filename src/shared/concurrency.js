/**
 * Bounded-concurrency helpers shared by every form of the app.
 *
 * `mapWithConcurrency` started life in `src/content/concurrency.js` for the
 * content-script adapters; the workflow executor needs exactly the same
 * primitive to bound API generation jobs. Rather than keep two copies that
 * can drift, the implementation lives here and content re-exports it.
 */

/**
 * Maps items with bounded concurrency while preserving their input order.
 *
 * Order is preserved because callers index back into the input to attribute
 * results — a completion-ordered result would mis-attribute them.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency max workers in flight at once
 * @param {(item: T, index: number) => Promise<R>} mapper
 * @returns {Promise<R[]>} results in input order
 */
export async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * How many API generation jobs run at once when the user has not chosen.
 *
 * Three is a compromise: enough parallelism that a batch is meaningfully
 * faster than serial, low enough that a provider's per-key rate limit is not
 * the first thing a batch discovers. Setting it to 1 makes a run strictly
 * serial — one job finishes before the next starts.
 */
export const DEFAULT_API_CONCURRENCY = 3;

/**
 * Coerces a stored setting into a usable worker count.
 *
 * "Not set" and "set to something invalid" are different: an absent setting
 * takes the default, while a nonsense number is clamped to a usable floor.
 * `Number(null)` and `Number("")` are both 0, so they must be caught up front
 * or an unset value would silently become a serial run. Nothing throws — a
 * corrupt setting must not be able to stop a run from starting.
 *
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number} an integer >= 1
 */
export function normalizeConcurrency(
  value,
  fallback = DEFAULT_API_CONCURRENCY,
) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  return floored < 1 ? 1 : floored;
}
