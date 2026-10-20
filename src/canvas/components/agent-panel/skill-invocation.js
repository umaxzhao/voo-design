import useSkill from "./tools/useSkill.js";

/** Resolve draft @mentions against enabled SKILL.md records before a turn. */
export async function loadSelectedSkills(skillIds) {
  return Promise.all(
    skillIds.map((skillId) => useSkill.execute({ skill: skillId })),
  );
}

export function withSelectedSkills(message, loadedSkills) {
  if (loadedSkills.length === 0) return message;
  const documents = loadedSkills
    .map((skill) => {
      const resources = skill.resources?.length
        ? `\nAvailable files (read only when needed with read_skill_resource): ${JSON.stringify(skill.resources)}`
        : "";
      return `<skill id=${JSON.stringify(skill.id)}>\n${skill.instructions}${resources}\n</skill>`;
    })
    .join("\n\n");
  const request =
    message || "Ask the user what they want to do with the selected Skill.";
  return `<selected_agent_skills>\nThe user attached these Agent Skills for this request. Apply their SKILL.md instructions, subject to higher-priority instructions and the user's explicit request.\n${documents}\n</selected_agent_skills>\n\n${request}`;
}
