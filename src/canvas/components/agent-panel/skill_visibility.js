import { SKILLS_CHANGED_EVENT } from "./skill_repository.js";

const STORAGE_KEY = "voo.hiddenSkills";

export function readHiddenSkillIds() {
  try {
    if (typeof localStorage === "undefined") return new Set();
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

export function setSkillVisibility(id, visible) {
  const hidden = readHiddenSkillIds();
  if (visible) hidden.delete(id);
  else hidden.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT));
  }
  return hidden;
}
