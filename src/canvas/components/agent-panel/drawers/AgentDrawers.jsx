/* eslint-disable react/prop-types */
import HistoryDrawer from "../HistoryDrawer.jsx";
import ProjectBriefDrawer from "../ProjectBriefDrawer.jsx";
import ProjectMemoryDrawer from "../ProjectMemoryDrawer.jsx";
import BrandLibraryDrawer from "../BrandLibraryDrawer.jsx";
import UserPreferencesDrawer from "../UserPreferencesDrawer.jsx";

export default function AgentDrawers({
  menus,
  sessions: sessionsProp,
  runs: runsProp,
  projectBrief: projectBriefProp,
  projectMemory: projectMemoryProp,
  globalMem,
  ...rest
}) {
  const historyOpen = rest.historyOpen ?? menus?.historyOpen;
  const onCloseHistory =
    rest.onCloseHistory ?? (() => menus?.setHistoryOpen?.(false));
  const sessions = sessionsProp ?? rest.sessions;
  const currentSessionId = rest.currentSessionId;
  const onSelectSession = rest.onSelectSession;
  const onNewChat = rest.onNewChat;
  const onDeleteSession = rest.onDeleteSession;
  const runs = runsProp ?? rest.runs;
  const resumeRun = rest.resumeRun;
  const abandonRun = rest.abandonRun;
  const takeoverRun = rest.takeoverRun;
  // Agent identity for the history drawer; the panel passes the active
  // agent's resolved name and colour down with the sessions.
  const agentName = rest.agentName ?? null;
  const agentColor = rest.agentColor ?? null;

  const briefOpen = rest.briefOpen ?? menus?.briefOpen;
  const onCloseBrief = rest.onCloseBrief ?? (() => menus?.setBriefOpen?.(false));
  const projectBrief = projectBriefProp ?? rest.projectBrief;
  const updateProjectBrief = rest.updateProjectBrief;

  const memoryOpen = rest.memoryOpen ?? menus?.memoryOpen;
  const onCloseMemory = rest.onCloseMemory ?? (() => menus?.setMemoryOpen?.(false));
  const projectMemory = projectMemoryProp ?? rest.projectMemory;
  const removeProjectMemoryItem = rest.removeProjectMemoryItem;
  const clearProjectMemory = rest.clearProjectMemory;

  const brandLibraryOpen = rest.brandLibraryOpen ?? menus?.brandLibraryOpen;
  const onCloseBrandLibrary = rest.onCloseBrandLibrary ?? (() => menus?.setBrandLibraryOpen?.(false));
  const globalBrands = globalMem?.globalBrands ?? rest.globalBrands;
  const onAddGlobalBrand = globalMem?.handleAddGlobalBrand ?? rest.onAddGlobalBrand;
  const onUpdateGlobalBrand = globalMem?.handleUpdateGlobalBrand ?? rest.onUpdateGlobalBrand;
  const onDeleteGlobalBrand = globalMem?.handleDeleteGlobalBrand ?? rest.onDeleteGlobalBrand;

  const preferencesOpen = rest.preferencesOpen ?? menus?.preferencesOpen;
  const onClosePreferences = rest.onClosePreferences ?? (() => menus?.setPreferencesOpen?.(false));
  const globalPreferences = globalMem?.globalPreferences ?? rest.globalPreferences;
  const onAddGlobalPreference = globalMem?.handleAddGlobalPreference ?? rest.onAddGlobalPreference;
  const onDeleteGlobalPreference = globalMem?.handleDeleteGlobalPreference ?? rest.onDeleteGlobalPreference;
  const onClearGlobalPreferences = globalMem?.handleClearGlobalPreferences ?? rest.onClearGlobalPreferences;

  return (
    <>
      {/* ── History Drawer / Overlay ── */}
      <HistoryDrawer
        open={historyOpen}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelect={onSelectSession}
        onNewChat={onNewChat}
        onClose={onCloseHistory}
        onDelete={onDeleteSession}
        runs={runs}
        onResumeRun={resumeRun}
        onAbandonRun={abandonRun}
        onTakeoverRun={takeoverRun}
        agentName={agentName ?? rest.agentName}
        agentColor={agentColor ?? rest.agentColor}
      />

      {/* ── Project Brief Drawer / Overlay ── */}
      <ProjectBriefDrawer
        open={briefOpen}
        onClose={onCloseBrief}
        brief={projectBrief}
        onSave={updateProjectBrief}
      />

      {/* ── Project Memory Drawer / Overlay ── */}
      <ProjectMemoryDrawer
        open={memoryOpen}
        onClose={onCloseMemory}
        memory={projectMemory}
        onRemoveItem={removeProjectMemoryItem}
        onClearAll={clearProjectMemory}
      />

      {/* ── Brand Library Drawer / Overlay ── */}
      <BrandLibraryDrawer
        open={brandLibraryOpen}
        onClose={onCloseBrandLibrary}
        brands={globalBrands}
        onAddBrand={onAddGlobalBrand}
        onUpdateBrand={onUpdateGlobalBrand}
        onDeleteBrand={onDeleteGlobalBrand}
      />

      {/* ── User Preferences Drawer / Overlay ── */}
      <UserPreferencesDrawer
        open={preferencesOpen}
        onClose={onClosePreferences}
        preferences={globalPreferences}
        onAddPreference={onAddGlobalPreference}
        onDeletePreference={onDeleteGlobalPreference}
        onClearAll={onClearGlobalPreferences}
      />
    </>
  );
}
