import { useEffect, useState } from "react";

import { computeImageStats } from "../../editor/histogram.js";
import {
  HISTOGRAM_SAMPLE_BUDGET,
  sampleStrideFor,
} from "../../editor/histogram_geometry.js";
import { readImageRgba } from "../bitmap_pixels.js";

/**
 * Longest edge of the copy the analysis reads. The strip is ~200px wide, so a
 * 256px copy carries every shape the panel can show while costing a fraction
 * of a full-resolution walk.
 */
export const HISTOGRAM_MAX_EDGE = 256;

/**
 * The measured statistics of one bitmap: a capped-size copy in, four-channel
 * statistics at the stride the sample budget implies out.
 *
 * Exported rather than inlined into the hook below so the three options it has
 * to get right — the size cap, the stride and the channel count — are testable
 * without a React render. Getting one wrong is invisible on screen: the strip
 * still draws, just from the wrong pixels.
 *
 * Throws on a bitmap with no size; the hook turns that into "no strip".
 *
 * @param {CanvasImageSource} bitmap the decoded layer image
 */
export function layerHistogramStats(bitmap) {
  const { rgba, width, height } = readImageRgba(bitmap, {
    maxEdge: HISTOGRAM_MAX_EDGE,
  });
  const stride = sampleStrideFor(width, height, HISTOGRAM_SAMPLE_BUDGET);
  return computeImageStats(rgba, { channels: 4, stride });
}

/**
 * The measured statistics of a layer's bitmap, or null while there is nothing
 * to measure.
 *
 * Read-only and side-effect free: it exists so the levels and curves panels
 * can show what the picture holds before the user moves a slider. A failure
 * (an undecodable bitmap, a zero-sized canvas) leaves the strip absent rather
 * than throwing inside the panel's render — the panel stays usable, and the
 * reason is logged for whoever is looking.
 *
 * @param {CanvasImageSource|null} bitmap the decoded layer image
 */
export function useLayerHistogram(bitmap) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!bitmap) {
      setStats(null);
      return;
    }
    // Synchronous from end to end, so there is no window in which a stale
    // result could land: nothing to cancel, and a flag for it would be dead
    // state.
    try {
      setStats(layerHistogramStats(bitmap));
    } catch (error) {
      console.error("layer histogram failed", error);
      setStats(null);
    }
  }, [bitmap]);

  return stats;
}
