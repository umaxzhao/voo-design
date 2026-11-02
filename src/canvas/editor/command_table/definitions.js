/**
 * Command definition index.
 *
 * The full COMMAND_DEFINITIONS object is assembled from contiguous parts so
 * key order stays identical to the original monolithic file. Keeping the
 * definitions pure here means implementations can import history labels and
 * the capability list without circular dependencies.
 */
import { COMMAND_DEFINITIONS_PART1 } from "./definitions_part1.js";
import { COMMAND_DEFINITIONS_PART2 } from "./definitions_part2.js";
import { COMMAND_DEFINITIONS_PART3 } from "./definitions_part3.js";
import { COMMAND_DEFINITIONS_PART4 } from "./definitions_part4.js";

export const COMMAND_DEFINITIONS = {
  ...COMMAND_DEFINITIONS_PART1,
  ...COMMAND_DEFINITIONS_PART2,
  ...COMMAND_DEFINITIONS_PART3,
  ...COMMAND_DEFINITIONS_PART4,
};

export function getCommandDefinition(id) {
  return COMMAND_DEFINITIONS[id] ?? null;
}

export function listCommandCapabilities() {
  return Object.values(COMMAND_DEFINITIONS).map((def) => ({
    command: def.id,
    summary: def.summary,
    description: def.description,
    undoable: def.undoable,
    mutates: def.mutates,
    errors: [...def.errors],
  }));
}
