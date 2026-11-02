import { pickProjectSource } from "./pick-project-source.js";

/** Keep native user activation while loading parsers only after source selection. */
export async function openVooProject(options) {
  const pickedSource = await pickProjectSource(options);
  if (!pickedSource) return { canceled: true };
  const projectIo = await import("./project_io.js");
  return projectIo.openVooProject({ ...options, pickedSource });
}
