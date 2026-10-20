import { useState, useCallback, useRef, useEffect } from "react";

export function useAgentInteractiveCards(cancel) {
  const [pendingApproval, setPendingApproval] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [pendingPlanReview, setPendingPlanReview] = useState(null);
  const [questionDraft, setQuestionDraft] = useState("");

  const pendingApprovalRef = useRef(null);
  const pendingQuestionRef = useRef(null);
  const pendingPlanReviewRef = useRef(null);

  const requestApproval = useCallback((_id, toolName, args, costInfo) => {
    return new Promise((resolve) => {
      const card = { toolName, args, costInfo, resolve };
      pendingApprovalRef.current = card;
      setPendingApproval(card);
    });
  }, []);

  const resolveApproval = useCallback((approved) => {
    const card = pendingApprovalRef.current;
    pendingApprovalRef.current = null;
    card?.resolve(approved);
    setPendingApproval(null);
  }, []);

  /**
   * Loop-level plan review gate: resolves with
   * `{ approved: true }`, `{ approved: true, editedSteps }`, or
   * `{ approved: false, cancelled: true }`. No timeout — like requestApproval,
   * it waits until the user decides or the turn is stopped.
   */
  const requestPlanApproval = useCallback((request) => {
    return new Promise((resolve) => {
      const card = {
        runId: request?.runId ?? null,
        plan: request?.plan ?? null,
        estimatedCost: request?.estimatedCost ?? 0,
        resolve,
      };
      pendingPlanReviewRef.current = card;
      setPendingPlanReview(card);
    });
  }, []);

  /** @returns {boolean} whether a live plan-review card was waiting. */
  const resolvePlanReview = useCallback((decision) => {
    const card = pendingPlanReviewRef.current;
    if (!card) return false;
    pendingPlanReviewRef.current = null;
    card.resolve(decision);
    setPendingPlanReview(null);
    return true;
  }, []);

  const onRequestUserInput = useCallback((question, options) => {
    return new Promise((resolve) => {
      const card = { question, options: options || [], resolve };
      pendingQuestionRef.current = card;
      setPendingQuestion(card);
      setQuestionDraft("");
    });
  }, []);

  const resolveQuestion = useCallback((answer) => {
    const card = pendingQuestionRef.current;
    pendingQuestionRef.current = null;
    card?.resolve(answer);
    setPendingQuestion(null);
    setQuestionDraft("");
  }, []);

  const handleStop = useCallback(() => {
    pendingQuestionRef.current?.resolve(null);
    pendingApprovalRef.current?.resolve(false);
    pendingPlanReviewRef.current?.resolve({
      approved: false,
      cancelled: true,
    });
    pendingPlanReviewRef.current = null;
    setPendingPlanReview(null);
    cancel?.();
  }, [cancel]);

  useEffect(
    () => () => {
      pendingApprovalRef.current?.resolve(false);
      pendingQuestionRef.current?.resolve(null);
      pendingPlanReviewRef.current?.resolve({
        approved: false,
        cancelled: true,
      });
      pendingPlanReviewRef.current = null;
    },
    [],
  );

  return {
    pendingApproval,
    pendingQuestion,
    pendingPlanReview,
    questionDraft,
    setQuestionDraft,
    requestApproval,
    resolveApproval,
    requestPlanApproval,
    resolvePlanReview,
    onRequestUserInput,
    resolveQuestion,
    handleStop,
  };
}
