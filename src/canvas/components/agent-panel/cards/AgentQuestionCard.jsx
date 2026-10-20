/* eslint-disable react/prop-types */
import { useI18n } from "../../../use_i18n.js";

export default function AgentQuestionCard({
  pendingQuestion,
  questionDraft,
  setQuestionDraft,
  resolveQuestion,
}) {
  const { t } = useI18n();
  if (!pendingQuestion) return null;

  return (
    <div
      data-testid="agent-question-card"
      className="mb-2 rounded-xl border border-[#E5B2FF]/30 bg-[#E5B2FF]/10 p-3"
    >
      <p className="text-[11px] font-semibold text-[#eed0ff]">
        {t("agent.question.cardTitle")}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-neutral-100">
        {pendingQuestion.question}
      </p>
      {pendingQuestion.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pendingQuestion.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => resolveQuestion(option)}
              className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-neutral-200 transition-colors hover:bg-[#E5B2FF]/25 hover:text-white active:scale-95"
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={questionDraft}
          onChange={(e) => setQuestionDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter during an IME composition (e.g. pinyin) commits the
            // candidate; it must not submit the answer.
            if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") {
              e.preventDefault();
              if (questionDraft.trim())
                resolveQuestion(questionDraft.trim());
            }
          }}
          placeholder={t("agent.question.placeholder")}
          aria-label={t("agent.question.placeholder")}
          className="min-w-0 flex-1 rounded-lg bg-black/40 px-2.5 py-1.5 text-[12px] text-neutral-100 outline-none placeholder:text-neutral-400 focus:ring-1 focus:ring-[#E5B2FF]/40"
        />
        <button
          type="button"
          onClick={() => resolveQuestion(questionDraft.trim())}
          disabled={!questionDraft.trim()}
          className="rounded-lg bg-[#E5B2FF] px-3 py-1 text-[11px] font-semibold text-black transition-colors hover:bg-[#E5B2FF]/85 active:scale-95 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500"
        >
          {t("agent.question.send")}
        </button>
        <button
          type="button"
          onClick={() => resolveQuestion(null)}
          title={t("agent.question.skip")}
          className="rounded-lg bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-neutral-300 transition-colors hover:bg-white/[0.14] hover:text-white active:scale-95"
        >
          {t("agent.question.skip")}
        </button>
      </div>
    </div>
  );
}
