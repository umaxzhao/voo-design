import { useState, useCallback } from "react";
import { useWorkflowStore } from "../../store/workflow_store.js";
import {
  loadGlobalBrands,
  saveGlobalBrands,
  loadGlobalPreferences,
  saveGlobalPreferences,
  addBrand,
  updateBrand,
  removeBrand,
  addPreference,
  removePreference,
} from "../../agent-runtime/global-memory.js";

export function useAgentGlobalMemory() {
  const [globalBrands, setGlobalBrands] = useState(() => loadGlobalBrands());
  const [globalPreferences, setGlobalPreferences] = useState(() =>
    loadGlobalPreferences(),
  );

  const handleAddGlobalBrand = useCallback(async (brandData) => {
    const updated = addBrand(globalBrands, brandData);
    setGlobalBrands(updated);
    await saveGlobalBrands(updated);
  }, [globalBrands]);

  const handleUpdateGlobalBrand = useCallback(async (id, patch) => {
    const updated = updateBrand(globalBrands, id, patch);
    setGlobalBrands(updated);
    await saveGlobalBrands(updated);
  }, [globalBrands]);

  const handleDeleteGlobalBrand = useCallback(async (id) => {
    const updated = removeBrand(globalBrands, id);
    setGlobalBrands(updated);
    await saveGlobalBrands(updated);
  }, [globalBrands]);

  const handleAddGlobalPreference = useCallback(async (prefData) => {
    const s = useWorkflowStore.getState();
    const updated = addPreference(globalPreferences, {
      ...prefData,
      source: { projectId: s.workflowId || null, projectName: s.name || null },
    });
    setGlobalPreferences(updated);
    await saveGlobalPreferences(updated);
  }, [globalPreferences]);

  const handleDeleteGlobalPreference = useCallback(async (id) => {
    const updated = removePreference(globalPreferences, id);
    setGlobalPreferences(updated);
    await saveGlobalPreferences(updated);
  }, [globalPreferences]);

  const handleClearGlobalPreferences = useCallback(async () => {
    setGlobalPreferences([]);
    await saveGlobalPreferences([]);
  }, []);

  return {
    globalBrands,
    globalPreferences,
    handleAddGlobalBrand,
    handleUpdateGlobalBrand,
    handleDeleteGlobalBrand,
    handleAddGlobalPreference,
    handleDeleteGlobalPreference,
    handleClearGlobalPreferences,
  };
}
