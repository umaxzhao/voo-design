/**
 * Command implementation index.
 *
 * Implementation methods are split into contiguous parts so a schema edit and
 * an implementation edit land in different files. The combined object order
 * matches the original monolithic IMPLEMENTATIONS map.
 */
import { IMPLEMENTATIONS_PART1 } from "./implementations_part1.js";
import { IMPLEMENTATIONS_PART2 } from "./implementations_part2.js";
import { IMPLEMENTATIONS_PART3 } from "./implementations_part3.js";
import { IMPLEMENTATIONS_PART4 } from "./implementations_part4.js";

export const IMPLEMENTATIONS = {
  ...IMPLEMENTATIONS_PART1,
  ...IMPLEMENTATIONS_PART2,
  ...IMPLEMENTATIONS_PART3,
  ...IMPLEMENTATIONS_PART4,
};
