import { useState, useRef, useEffect } from "react";
import { EVENT_TYPE, REVIEW_STATUS } from "./eventTypes.js";

export function useAgentReviews(events) {
  const [reviews, setReviews] = useState({});
  const reviewEventsSeenRef = useRef(new Set());

  useEffect(() => {
    const seen = reviewEventsSeenRef.current;
    for (const event of events) {
      if (
        event.type !== EVENT_TYPE.REVIEW_PENDING &&
        event.type !== EVENT_TYPE.REVIEW_RESOLVED
      ) {
        continue;
      }
      const toolId = event.item?.id;
      if (!toolId) continue;
      const key = `${event.type}:${toolId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const patch =
        event.type === EVENT_TYPE.REVIEW_PENDING
          ? {
              command: event.item.command,
              rationale: event.item.rationale || event.item.reason || null,
              visualStatus:
                event.item.visualStatus || event.item.visualDiff || null,
              status: REVIEW_STATUS.PENDING,
              undoData: event.item.undoData,
              affectedObjects: event.item.affectedObjects || [],
            }
          : {
              status: event.item.reviewStatus,
              skipped: event.item.skipped || [],
              revertResult: event.item.revertResult,
            };
      setReviews((prev) => ({
        ...prev,
        [toolId]: { ...(prev[toolId] || {}), ...patch },
      }));
    }
  }, [events]);

  return {
    reviews,
    setReviews,
    reviewEventsSeenRef,
  };
}
