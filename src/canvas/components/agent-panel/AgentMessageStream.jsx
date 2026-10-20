/* eslint-disable react/prop-types */
import { APPROVAL_MODE, ITEM_TYPE, REVIEW_STATUS } from "./eventTypes.js";
import MessageBubble from "./MessageBubble.jsx";
import PlanCard from "./PlanCard.jsx";
import PlanReviewCard from "./PlanReviewCard.jsx";
import ToolCallCard from "./ToolCallCard.jsx";
import AgentReviewCard from "./cards/AgentReviewCard.jsx";
import AgentWelcomeState from "./AgentWelcomeState.jsx";
import AgentStatusBar from "./AgentStatusBar.jsx";
import { useI18n } from "../../use_i18n.js";

export default function AgentMessageStream({
  cli,
  menus,
  messagesScrollRef,
  handleMessagesScroll,
  latestPlan,
  planReview,
  isConfigured,
  isCli,
  onOpenSettings,
  onSwitchToApi,
  renderedItems,
  activeMode,
  handleSend,
  onSelectPrompt,
  reviews,
  resolveReview,
  onResolvePlanReview,
  getStore,
  isRunning,
  messagesEndRef,
  ...rest
}) {
  const cliStatus = rest.cliStatus ?? cli?.cliStatus;
  const cliCopied = rest.cliCopied ?? cli?.cliCopied;
  const setCliCopied = rest.setCliCopied ?? cli?.setCliCopied;
  const handleLaunchCliLogin =
    rest.handleLaunchCliLogin ?? cli?.handleLaunchCliLogin;
  const handleRefreshCli = rest.handleRefreshCli ?? cli?.handleRefreshCli;
  const approvalMode = rest.approvalMode ?? menus?.approvalMode;
  const switchToApi = onSwitchToApi ?? rest.onSwitchToApi;
  const { t } = useI18n();

  return (
    <div
      ref={messagesScrollRef}
      onScroll={handleMessagesScroll}
      className="agent-messages ui-scroll flex flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3"
    >
      <PlanCard plan={latestPlan} />

      {planReview?.plan?.steps?.length > 0 && (
        <PlanReviewCard
          key={planReview.runId || "plan-review"}
          review={planReview}
          onResolve={onResolvePlanReview}
        />
      )}

      <AgentWelcomeState
        isConfigured={isConfigured}
        isCli={isCli}
        cliStatus={cliStatus}
        cliCopied={cliCopied}
        setCliCopied={setCliCopied}
        handleLaunchCliLogin={handleLaunchCliLogin}
        handleRefreshCli={handleRefreshCli}
        onOpenSettings={onOpenSettings}
        onSwitchToApi={switchToApi}
        onSignIn={rest.onSignIn}
        renderedItemsCount={renderedItems.length}
        activeMode={activeMode}
        handleSend={handleSend}
        onSelectPrompt={onSelectPrompt}
        agentName={rest.agentName}
        agentColor={rest.agentColor}
      />

      {renderedItems
        .filter((item) => item.type !== ITEM_TYPE.TODO_LIST)
        .map((item) =>
          item.type === ITEM_TYPE.COMMAND_EXECUTION ||
          item.type === ITEM_TYPE.MCP_TOOL_CALL ? (
            <ToolCallCard key={item.id} item={item} />
          ) : (
            <MessageBubble
              key={item.id}
              item={item}
              onOpenSettings={onOpenSettings}
            />
          ),
        )}

      {/* Auto-review: executed changes awaiting the user's accept/revert. */}
      {approvalMode === APPROVAL_MODE.AUTO_REVIEW &&
        Object.entries(reviews)
          .filter(([, review]) => review.status === REVIEW_STATUS.PENDING)
          .map(([toolId, review]) => (
            <AgentReviewCard
              key={toolId}
              toolId={toolId}
              review={review}
              resolveReview={resolveReview}
              getStore={getStore}
            />
          ))}

      {/* Resolved reviews stay visible as a compact receipt. */}
      {approvalMode === APPROVAL_MODE.AUTO_REVIEW &&
        Object.entries(reviews)
          .filter(([, review]) => review.status !== REVIEW_STATUS.PENDING)
          .map(([toolId, review]) => (
            <div
              key={toolId}
              className={`flex flex-col gap-1 rounded-lg px-2.5 py-1.5 text-[10px] ${
                review.status === REVIEW_STATUS.ACCEPTED
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-rose-500/10 text-rose-400"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-medium">
                  {review.status === REVIEW_STATUS.ACCEPTED ? "✓" : "↺"}
                </span>
                <span className="font-mono truncate">
                  {review.command || toolId}
                </span>
                <span className="ml-auto shrink-0">
                  {review.status === REVIEW_STATUS.ACCEPTED
                    ? t("agent.review.accepted")
                    : t("agent.review.reverted")}
                </span>
              </div>
              {review.skipped && review.skipped.length > 0 && (
                <p className="text-[10px] text-amber-400 font-sans">
                  {t("agent.review.skippedModified")}:{" "}
                  {review.skipped.map((s) => s.name || s.id).join(", ")}
                </p>
              )}
            </div>
          ))}

      <AgentStatusBar isRunning={isRunning} />
      <div ref={messagesEndRef} />
    </div>
  );
}
