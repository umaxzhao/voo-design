import { useState, useRef, useEffect, useCallback } from "react";
import { APPROVAL_MODE } from "./eventTypes.js";

/** Opt-in "Review plan before running" setting (default OFF). */
export const PLAN_REVIEW_STORAGE_KEY = "voo.agent.planReview";
const PLAN_REVIEW_CHANGED_EVENT = "ciw-agent-plan-review-changed";

function readPlanReviewSetting() {
  try {
    return globalThis.localStorage?.getItem(PLAN_REVIEW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useAgentMenus() {
  const [approvalMode, setApprovalMode] = useState(APPROVAL_MODE.AUTO_CREATE);
  const [planReviewEnabled, setPlanReviewEnabledState] = useState(
    readPlanReviewSetting,
  );
  const [approvalMenuOpen, setApprovalMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [brandLibraryOpen, setBrandLibraryOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const modeMenuRef = useRef(null);
  const modeButtonRef = useRef(null);
  const approvalMenuRef = useRef(null);
  const modelMenuRef = useRef(null);

  const setPlanReviewEnabled = useCallback((value) => {
    const next = Boolean(value);
    setPlanReviewEnabledState(next);
    try {
      globalThis.localStorage?.setItem(
        PLAN_REVIEW_STORAGE_KEY,
        next ? "1" : "0",
      );
      window.dispatchEvent(
        new CustomEvent(PLAN_REVIEW_CHANGED_EVENT, { detail: next }),
      );
    } catch {
      // Storage unavailable: keep the in-memory setting.
    }
  }, []);

  useEffect(() => {
    const sync = () => setPlanReviewEnabledState(readPlanReviewSetting());
    window.addEventListener("storage", sync);
    window.addEventListener(PLAN_REVIEW_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(PLAN_REVIEW_CHANGED_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    if (!modeMenuOpen && !approvalMenuOpen && !modelMenuOpen && !historyOpen)
      return;
    const onPointerDown = (e) => {
      if (
        modeMenuOpen &&
        !modeMenuRef.current?.contains(e.target) &&
        !modeButtonRef.current?.contains(e.target)
      ) {
        setModeMenuOpen(false);
      }
      if (approvalMenuOpen && !approvalMenuRef.current?.contains(e.target)) {
        setApprovalMenuOpen(false);
      }
      if (modelMenuOpen && !modelMenuRef.current?.contains(e.target)) {
        setModelMenuOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setModeMenuOpen(false);
      setApprovalMenuOpen(false);
      setModelMenuOpen(false);
      setHistoryOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modeMenuOpen, approvalMenuOpen, modelMenuOpen, historyOpen]);

  return {
    approvalMode,
    setApprovalMode,
    planReviewEnabled,
    setPlanReviewEnabled,
    approvalMenuOpen,
    setApprovalMenuOpen,
    modeMenuOpen,
    setModeMenuOpen,
    modelMenuOpen,
    setModelMenuOpen,
    historyOpen,
    setHistoryOpen,
    briefOpen,
    setBriefOpen,
    memoryOpen,
    setMemoryOpen,
    brandLibraryOpen,
    setBrandLibraryOpen,
    preferencesOpen,
    setPreferencesOpen,
    modeMenuRef,
    modeButtonRef,
    approvalMenuRef,
    modelMenuRef,
  };
}
