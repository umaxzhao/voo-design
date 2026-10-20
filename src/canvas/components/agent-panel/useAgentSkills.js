import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  parseSkillInput,
  validateSkillCollection,
} from "./skill_descriptors.js";
import { readBrowserSkillFiles } from "./skill_import_adapters.js";
import {
  listExternalSkills,
  saveExternalSkill,
  setExternalSkillEnabled,
  SKILLS_CHANGED_EVENT,
} from "./skill_repository.js";
import { readHiddenSkillIds, setSkillVisibility } from "./skill_visibility.js";
import { PRESET_SKILL_CATALOG } from "./preset-skills/catalog.js";

export function useAgentSkills({ t }) {
  const [externalSkills, setExternalSkills] = useState([]);
  const [pendingExternalSkill, setPendingExternalSkill] = useState(null);
  const [skillImportError, setSkillImportError] = useState(null);
  const [skillImportProgress, setSkillImportProgress] = useState(null);
  const [hiddenBuiltinSkillIds, setHiddenBuiltinSkillIds] =
    useState(readHiddenSkillIds);
  const hiddenSkillIds = useMemo(
    () =>
      new Set([
        ...hiddenBuiltinSkillIds,
        ...PRESET_SKILL_CATALOG.filter(
          (item) =>
            !externalSkills.some(
              (skill) =>
                skill.source === "preset" &&
                skill.id === item.presetId &&
                skill.enabled !== false,
            ),
        ).map((item) => item.presetId),
        ...externalSkills
          .filter((skill) => skill.enabled === false)
          .map((skill) => skill.id),
      ]),
    [externalSkills, hiddenBuiltinSkillIds],
  );
  const skillFileInputRef = useRef(null);

  useEffect(() => {
    const refresh = () => {
      setHiddenBuiltinSkillIds(readHiddenSkillIds());
      if (typeof indexedDB === "undefined") return;
      listExternalSkills()
        .then(setExternalSkills)
        .catch(() => setSkillImportError(t("agent.skillImport.storage")));
    };
    refresh();
    window.addEventListener(SKILLS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SKILLS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [t]);

  const importSkillBatch = useCallback(
    async (inputs, source) => {
      const failures = [];
      const importedSkills = [];
      let completed = 0;
      setSkillImportError(null);
      setSkillImportProgress({ completed: 0, total: inputs.length });
      for (const input of inputs) {
        try {
          const result = input.error
            ? { ok: false, error: { code: input.error } }
            : parseSkillInput(input, source);
          if (!result.ok) {
            failures.push(
              `${input.name}: ${t(`agent.skillImport.${result.error.code}`)}`,
            );
          } else if (
            !validateSkillCollection([...importedSkills, result.skill]).ok
          ) {
            failures.push(
              `${input.name}: ${t("agent.skillImport.duplicateId")}`,
            );
          } else {
            importedSkills.push(result.skill);
            const saved = await saveExternalSkill(result.skill);
            setExternalSkills((current) => [
              ...current.filter((item) => item.id !== saved.id),
              saved,
            ]);
          }
        } catch {
          failures.push(`${input.name}: ${t("agent.skillImport.storage")}`);
        } finally {
          completed += 1;
          setSkillImportProgress({ completed, total: inputs.length });
        }
      }
      setSkillImportProgress(null);
      if (failures.length > 0) {
        setSkillImportError(
          t("agent.skillImport.batchPartial", {
            count: failures.length,
            details: failures.join("; "),
          }),
        );
      }
    },
    [t],
  );

  const handleSkillFileSelect = useCallback(
    async (event) => {
      const files = [...(event.target.files || [])];
      event.target.value = "";
      if (files.length === 0) return;
      if (
        files.some((file) => !/\.(md|markdown|skill|zip)$/i.test(file.name))
      ) {
        setSkillImportError(t("agent.skillImportUnsupported"));
        return;
      }
      try {
        const inputs = await readBrowserSkillFiles(files);
        if (inputs.length === 0) {
          setSkillImportError(t("agent.skillImport.emptyPackage"));
          return;
        }
        if (inputs.length > 1) {
          await importSkillBatch(inputs, "upload");
          return;
        }
        const result = inputs[0].error
          ? { ok: false, error: { code: inputs[0].error } }
          : parseSkillInput(inputs[0], "upload");
        if (!result.ok) {
          setSkillImportError(t(`agent.skillImport.${result.error.code}`));
          return;
        }
        setSkillImportError(null);
        setPendingExternalSkill(result.skill);
      } catch {
        setSkillImportError(t("agent.skillImport.notText"));
      }
    },
    [importSkillBatch, t],
  );

  const confirmExternalSkill = useCallback(async () => {
    if (!pendingExternalSkill) return;
    try {
      const saved = await saveExternalSkill(pendingExternalSkill);
      setExternalSkills((current) => [
        ...current.filter((item) => item.id !== saved.id),
        saved,
      ]);
      setPendingExternalSkill(null);
    } catch {
      setSkillImportError(t("agent.skillImport.storage"));
    }
  }, [pendingExternalSkill, t]);

  const toggleSkill = useCallback(
    async (skill) => {
      const visible = hiddenSkillIds.has(skill.id);
      try {
        if (skill.source && skill.source !== "builtin") {
          await setExternalSkillEnabled(skill, visible);
          setHiddenBuiltinSkillIds(setSkillVisibility(skill.id, true));
        } else {
          setHiddenBuiltinSkillIds(setSkillVisibility(skill.id, visible));
        }
      } catch {
        setSkillImportError(t("agent.skillImport.storage"));
      }
    },
    [hiddenSkillIds, t],
  );

  return {
    externalSkills,
    setExternalSkills,
    pendingExternalSkill,
    setPendingExternalSkill,
    skillImportError,
    setSkillImportError,
    skillImportProgress,
    hiddenSkillIds,
    skillFileInputRef,
    handleSkillFileSelect,
    confirmExternalSkill,
    toggleSkill,
  };
}
