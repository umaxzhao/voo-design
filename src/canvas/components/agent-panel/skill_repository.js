/** Confirmed external Skill persistence through the shared IndexedDB owner. */
import * as db from "../../store/db.js";
import { PRESET_SKILL_METADATA } from "./preset-skills/catalog.js";

const presetMetadata = new Map(
  PRESET_SKILL_METADATA.map((skill) => [skill.id, skill]),
);

export const SKILLS_CHANGED_EVENT = "voo:agent-skills-changed";

function notifySkillsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT));
  }
}

export async function listExternalSkills() {
  if (typeof indexedDB === "undefined") return [];
  if (typeof db.listAgentSkills !== "function") return [];
  const skills = await db.listAgentSkills();
  // Empty or upload-only collections must not fetch every bundled instruction.
  if (!skills.some((skill) => skill.source === "preset")) return skills;
  let getPresetSkill;
  const current = [];
  let changed = false;
  for (const skill of skills) {
    if (skill.source !== "preset") {
      current.push(skill);
      continue;
    }
    const cleanId =
      typeof skill.id === "string" ? skill.id.replace(/^preset:/, "") : null;
    const metadata = presetMetadata.get(cleanId);
    if (!metadata) {
      await db.deleteAgentSkill("preset", skill.id);
      changed = true;
      continue;
    }
    if (
      skill.contentHash !== metadata.contentHash ||
      skill.sourceRevision !== metadata.sourceRevision ||
      typeof skill.instructions !== "string" ||
      !skill.instructions.trim()
    ) {
      // Installed current records already contain the complete instructions.
      // Only a migration needs the larger upstream instruction packages.
      if (!getPresetSkill) {
        ({ getPresetSkill } = await import("./preset-skills/index.js"));
      }
      const original = getPresetSkill(skill.id);
      if (!original) throw new Error(`Missing preset package: ${skill.id}`);
      const updated = await db.saveAgentSkill({
        ...original,
        enabled: skill.enabled !== false,
      });
      current.push(updated);
      changed = true;
    } else {
      current.push(skill);
    }
  }
  if (changed) notifySkillsChanged();
  return current;
}

export async function saveExternalSkill(skill) {
  if (typeof indexedDB === "undefined")
    throw new Error("IndexedDB is unavailable");
  if (typeof db.saveAgentSkill !== "function") {
    throw new Error("Skill persistence is unavailable");
  }
  const saved = await db.saveAgentSkill(skill);
  notifySkillsChanged();
  return saved;
}

export async function deleteExternalSkill(skill) {
  if (skill.source === "preset") {
    throw new Error("Preset skills cannot be deleted");
  }
  if (typeof db.deleteAgentSkill !== "function") {
    throw new Error("Skill deletion is unavailable");
  }
  const deleted = await db.deleteAgentSkill(skill.source ?? "upload", skill.id);
  notifySkillsChanged();
  return deleted;
}

export async function setExternalSkillEnabled(skill, enabled) {
  return saveExternalSkill({ ...skill, enabled });
}

export async function installPresetSkill(presetId) {
  const { getPresetSkill } = await import("./preset-skills/index.js");
  const skill = getPresetSkill(presetId);
  if (!skill) throw new Error(`Unknown preset skill: ${presetId}`);
  return saveExternalSkill({ ...skill, enabled: true });
}

export async function uninstallPresetSkill(presetId) {
  const skills = await listExternalSkills();
  const cleanId = presetId.startsWith("preset:")
    ? presetId.slice("preset:".length)
    : presetId;
  const target = skills.find(
    (skill) => skill.source === "preset" && skill.id === cleanId,
  );
  if (target) {
    return setExternalSkillEnabled(target, false);
  }
  return null;
}
