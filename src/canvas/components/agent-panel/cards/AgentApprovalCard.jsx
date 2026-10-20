/* eslint-disable react/prop-types */
import { useI18n } from "../../../use_i18n.js";

export default function AgentApprovalCard({
  pendingApproval,
  resolveApproval,
}) {
  const { t } = useI18n();
  if (!pendingApproval) return null;

  return (
    <div
      data-testid="agent-approval-card"
      className="mb-2 rounded-xl border border-[#E5B2FF]/30 bg-[#E5B2FF]/10 p-3"
    >
      <p className="text-[11px] font-semibold text-[#eed0ff]">
        {t("agent.approval.cardTitle")}
      </p>
      <p className="mt-1 font-mono text-[11px] font-semibold text-neutral-100 break-all">
        {pendingApproval.toolName}
      </p>
      {pendingApproval.costInfo?.externalWebsiteCostUnknown && (
        <p className="mt-1 text-[11px] text-amber-300">
          {t("agent.cost.externalWebsiteUnknown")}
        </p>
      )}
      <pre className="agent-tool-card-code mt-1 max-h-24 overflow-y-auto">
        {JSON.stringify(pendingApproval.args, null, 2)}
      </pre>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => resolveApproval(true)}
          className="rounded-lg bg-[#E5B2FF] px-3 py-1 text-[11px] font-semibold text-black transition-colors hover:bg-[#E5B2FF]/85 active:scale-95"
        >
          {t("agent.approval.approve")}
        </button>
        <button
          type="button"
          onClick={() => resolveApproval(false)}
          className="rounded-lg bg-white/[0.08] px-3 py-1 text-[11px] font-medium text-neutral-300 transition-colors hover:bg-white/[0.14] hover:text-white active:scale-95"
        >
          {t("agent.approval.deny")}
        </button>
      </div>
    </div>
  );
}
